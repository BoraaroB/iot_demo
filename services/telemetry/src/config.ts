import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@iiot/config';

/**
 * Service-specific environment schema. Extends the shared base
 * (`NODE_ENV`, `LOG_LEVEL`) with this service's own variables.
 * Kafka defaults target the host-side ports published by docker-compose.yml.
 * `DATABASE_URL` has no default because it carries credentials.
 */
const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3002),
  /** TimescaleDB `telemetry_db`, e.g. `postgres://user:pass@localhost:5434/telemetry_db`. Never logged. */
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  /** Comma-separated `host:port` list. */
  KAFKA_BROKERS: z.string().min(1).default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().min(1).default('telemetry'),
  /** One consumer group per service; replicas in the group split partitions. */
  KAFKA_GROUP_ID: z.string().min(1).default('telemetry'),
});

export type Env = z.infer<typeof envSchema>;

export function loadServiceEnv(): Env {
  return loadEnv(envSchema);
}
