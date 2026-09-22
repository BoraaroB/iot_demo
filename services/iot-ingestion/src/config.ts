import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@iiot/config';

/**
 * Service-specific environment schema. Extends the shared base
 * (`NODE_ENV`, `LOG_LEVEL`) with this service's own variables.
 * Defaults target the host-side ports published by docker-compose.yml.
 */
const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  MQTT_URL: z.url().default('mqtt://localhost:1883'),
  /** Must be unique per replica; generated when unset. */
  MQTT_CLIENT_ID: z.string().min(1).optional(),
  /** EMQX shared-subscription group — replicas in one group split messages instead of duplicating them. */
  MQTT_SHARED_GROUP: z
    .string()
    .regex(/^[^/+#]+$/, 'must not contain /, + or #')
    .default('iot-ingestion'),
  /** Comma-separated `host:port` list. */
  KAFKA_BROKERS: z.string().min(1).default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().min(1).default('iot-ingestion'),
  /** Upper bound on un-acked Kafka sends; messages beyond it are dropped, not buffered. */
  INGEST_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

export function loadServiceEnv(): Env {
  return loadEnv(envSchema);
}
