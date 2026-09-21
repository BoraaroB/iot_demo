import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EventEnvelope, FactoryId, VehicleId } from '@iiot/types';

/**
 * Validates the envelope shape. `payload` is left as `unknown` here and
 * narrowed separately by the caller's payload-specific schema — see
 * {@link parseEventEnvelope}.
 */
export const eventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.string().min(1),
  timestamp: z.iso.datetime(),
  vehicleId: z.string().min(1),
  factoryId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
});

export interface CreateEventEnvelopeInput<TPayload> {
  eventType: string;
  vehicleId: VehicleId;
  factoryId: FactoryId;
  schemaVersion: number;
  payload: TPayload;
}

/** Builds a new envelope with a fresh `eventId` and the current timestamp. */
export function createEventEnvelope<TPayload>(
  input: CreateEventEnvelopeInput<TPayload>,
): EventEnvelope<TPayload> {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    timestamp: new Date().toISOString(),
    vehicleId: input.vehicleId,
    factoryId: input.factoryId,
    schemaVersion: input.schemaVersion,
    payload: input.payload,
  };
}

/**
 * Parses and validates a raw value against the envelope schema, then narrows
 * `payload` with the caller-supplied schema. Throws a `ZodError` on invalid
 * input — callers (e.g. iot-ingestion) must catch it and handle malformed
 * messages per CLAUDE.md instead of letting it crash the process.
 */
export function parseEventEnvelope<TPayload>(
  raw: unknown,
  payloadSchema: z.ZodType<TPayload>,
): EventEnvelope<TPayload> {
  const envelope = eventEnvelopeSchema.parse(raw);
  const payload = payloadSchema.parse(envelope.payload);
  return { ...envelope, payload };
}
