import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@iiot/config';

/** MQTT topic segment: no level separator or wildcards. */
const topicSegment = z.string().regex(/^[^/+#\s]+$/, 'must not contain /, +, # or whitespace');

/**
 * Service-specific environment schema. Extends the shared base
 * (`NODE_ENV`, `LOG_LEVEL`) with this service's own variables.
 * Defaults target the host-side ports published by docker-compose.yml.
 */
const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3006),
  MQTT_URL: z.url().default('mqtt://localhost:1883'),
  /** Must be unique per simulator instance; generated when unset. */
  MQTT_CLIENT_ID: z.string().min(1).optional(),
  SIM_FACTORY_ID: topicSegment.default('factory-1'),
  /** Vehicle ids are `<prefix>-0001`, `<prefix>-0002`, ... */
  SIM_VEHICLE_ID_PREFIX: topicSegment.default('sim'),
  SIM_VEHICLE_COUNT: z.coerce.number().int().positive().max(10000).default(5),
  /** Telemetry period per vehicle. */
  SIM_PUBLISH_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),
});

export type Env = z.infer<typeof envSchema>;

export function loadServiceEnv(): Env {
  return loadEnv(envSchema);
}
