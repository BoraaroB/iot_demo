import type { z } from 'zod';
import {
  PAYLOAD_SCHEMA_VERSION,
  createEventEnvelope,
  eventTypes,
  kafkaTopics,
  mqttTopics,
  statusPayloadSchema,
  telemetryPayloadSchema,
  type KafkaTopic,
} from '@iiot/events';
import type { Logger } from '@iiot/logger';
import type { KafkaPublisher } from './kafka.js';

interface Route {
  schema: z.ZodType;
  kafkaTopic: KafkaTopic;
  eventType: string;
}

/** 1:1 MQTT message kind → Kafka topic. No fan-out inside the bridge. */
const routes: Record<'telemetry' | 'status', Route> = {
  telemetry: {
    schema: telemetryPayloadSchema,
    kafkaTopic: kafkaTopics.vehicleTelemetry,
    eventType: eventTypes.telemetryReported,
  },
  status: {
    schema: statusPayloadSchema,
    kafkaTopic: kafkaTopics.vehicleStatus,
    eventType: eventTypes.statusReported,
  },
};

/** Wildcard filters for every vehicle-published topic the bridge handles. */
export const subscribedTopics: string[] = [
  mqttTopics.telemetry('+', '+'),
  mqttTopics.status('+', '+'),
];

const TOPIC_PATTERN = /^factory\/([^/]+)\/vehicle\/([^/]+)\/(telemetry|status)$/;

export interface Bridge {
  handleMessage(topic: string, payload: Buffer): void;
  /** Waits (bounded) for in-flight Kafka sends to settle. */
  drain(timeoutMs: number): Promise<void>;
}

export function createBridge(opts: {
  publisher: KafkaPublisher;
  logger: Logger;
  maxInFlight: number;
}): Bridge {
  const logger = opts.logger.child({ component: 'bridge' });
  let inFlight = 0;

  return {
    handleMessage(topic, payload) {
      const match = TOPIC_PATTERN.exec(topic);
      const [, factoryId, vehicleId, kind] = match ?? [];
      if (!factoryId || !vehicleId || (kind !== 'telemetry' && kind !== 'status')) {
        logger.warn({ topic }, 'Dropped message: unexpected topic');
        return;
      }
      const route = routes[kind];

      let json: unknown;
      try {
        json = JSON.parse(payload.toString('utf8'));
      } catch {
        logger.warn({ topic, bytes: payload.length }, 'Dropped message: payload is not JSON');
        return;
      }

      const parsed = route.schema.safeParse(json);
      if (!parsed.success) {
        logger.warn({ topic, issues: parsed.error.issues }, 'Dropped message: invalid payload');
        return;
      }

      if (inFlight >= opts.maxInFlight) {
        logger.warn({ topic, inFlight }, 'Dropped message: Kafka in-flight limit reached');
        return;
      }

      const envelope = createEventEnvelope({
        eventType: route.eventType,
        vehicleId,
        factoryId,
        schemaVersion: PAYLOAD_SCHEMA_VERSION,
        payload: parsed.data,
      });
      const ctx = { eventId: envelope.eventId, kafkaTopic: route.kafkaTopic, vehicleId };

      inFlight++;
      opts.publisher
        .send(route.kafkaTopic, vehicleId, JSON.stringify(envelope))
        .then(() => logger.debug(ctx, 'Forwarded to Kafka'))
        .catch((err: unknown) => logger.error({ ...ctx, err }, 'Kafka produce failed'))
        .finally(() => {
          inFlight--;
        });
    },

    async drain(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (inFlight > 0) logger.warn({ inFlight }, 'Shutdown with Kafka sends still in flight');
    },
  };
}
