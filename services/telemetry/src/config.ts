import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@iiot/config';

/**
 * Service-specific environment schema. Extends the shared base
 * (`NODE_ENV`, `LOG_LEVEL`) with this service's own variables.
 */
const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3002),
});

export type Env = z.infer<typeof envSchema>;

export function loadServiceEnv(): Env {
  return loadEnv(envSchema);
}
