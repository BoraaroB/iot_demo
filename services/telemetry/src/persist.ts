import type { EachBatchHandler, KafkaMessage } from 'kafkajs';
import { z } from 'zod';
import { eventTypes, parseEventEnvelope, telemetryPayloadSchema } from '@iiot/events';
import type { Logger } from '@iiot/logger';
import type { TelemetryRow, TelemetryStore } from './db.js';

/** Messages per INSERT; a Kafka batch (≤1 MB per partition by default) is split into chunks. */
const INSERT_CHUNK_SIZE = 1000;

/** Parses one Kafka message into a row, or returns `undefined` (logged) if it is unusable. */
function toRow(message: KafkaMessage, logger: Logger): TelemetryRow | undefined {
  const ctx = { offset: message.offset, key: message.key?.toString() };
  if (!message.value) {
    logger.warn(ctx, 'Skipped message: empty value');
    return undefined;
  }

  let json: unknown;
  try {
    json = JSON.parse(message.value.toString('utf8'));
  } catch {
    logger.warn({ ...ctx, bytes: message.value.length }, 'Skipped message: value is not JSON');
    return undefined;
  }

  // Bad input is expected here: log the validation issues, not a stack trace.
  let envelope;
  try {
    envelope = parseEventEnvelope(json, telemetryPayloadSchema);
  } catch (err) {
    if (!(err instanceof z.ZodError)) throw err;
    logger.warn({ ...ctx, issues: err.issues }, 'Skipped message: invalid envelope or payload');
    return undefined;
  }
  if (envelope.eventType !== eventTypes.telemetryReported) {
    logger.warn({ ...ctx, eventType: envelope.eventType }, 'Skipped message: unexpected eventType');
    return undefined;
  }

  const p = envelope.payload;
  return {
    time: p.timestamp,
    eventId: envelope.eventId,
    factoryId: envelope.factoryId,
    vehicleId: envelope.vehicleId,
    x: p.x,
    y: p.y,
    speed: p.speed,
    battery: p.battery,
    temperature: p.temperature,
    ingestedAt: envelope.timestamp,
  };
}

/**
 * Kafka batch → TimescaleDB, in chunks of messages. After each chunk is
 * inserted its last offset is resolved (the consumer runs with
 * `eachBatchAutoResolve: false`), so stopping mid-batch on shutdown or
 * rebalance only redelivers what was not stored. Invalid messages are logged
 * and skipped; their offsets are resolved with their chunk. A failed insert
 * throws: kafkajs retries the batch and restarts the consumer if retries run
 * out. Redelivered rows hit ON CONFLICT DO NOTHING. This is at-least-once
 * consumption + an idempotent insert, not exactly-once.
 */
export function createBatchHandler(store: TelemetryStore, logger: Logger): EachBatchHandler {
  const log = logger.child({ component: 'persist' });

  return async (payload) => {
    const { batch } = payload;
    let valid = 0;
    let inserted = 0;

    for (let i = 0; i < batch.messages.length; i += INSERT_CHUNK_SIZE) {
      if (!payload.isRunning() || payload.isStale()) return;
      const chunk = batch.messages.slice(i, i + INSERT_CHUNK_SIZE);
      const rows = chunk.map((m) => toRow(m, log)).filter((r) => r !== undefined);
      inserted += await store.insert(rows);
      valid += rows.length;
      const last = chunk.at(-1);
      if (last) payload.resolveOffset(last.offset);
      await payload.heartbeat();
    }

    log.debug(
      {
        partition: batch.partition,
        messages: batch.messages.length,
        valid,
        inserted,
        duplicates: valid - inserted,
      },
      'Batch persisted',
    );
  };
}
