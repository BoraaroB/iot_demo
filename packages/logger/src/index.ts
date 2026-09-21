import pino from 'pino';

export type Logger = pino.Logger;

/**
 * Per-call/per-request context fields. Attach with `logger.child({...})` at
 * the point where the value becomes known (e.g. a request handler, a Kafka
 * consumer). See CLAUDE.md "Logging" for the full field list.
 */
export interface LogContext {
  requestId?: string;
  correlationId?: string;
  vehicleId?: string;
  factoryId?: string;
  eventId?: string;
}

export interface CreateLoggerOptions {
  /** Log level. Defaults to the `LOG_LEVEL` env var, or `'info'`. */
  level?: string;
  /** Pretty-print for local development. Defaults to `NODE_ENV !== 'production'`. */
  pretty?: boolean;
}

/**
 * Redact known-sensitive fields. See CLAUDE.md "Logging" — never log
 * passwords, tokens, secrets, or credentials. Add more specific paths
 * per-service (via `logger.child` bindings are not redacted retroactively,
 * so keep secrets out of bindings entirely).
 */
const REDACT_PATHS = [
  'password',
  'token',
  'secret',
  'authorization',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  'req.headers.authorization',
];

/**
 * Creates a structured logger bound to a service name. Every log line
 * carries `service`, `level`, `time`, and `msg`; add request-scoped context
 * with `.child(...)` — see {@link LogContext}.
 */
export function createLogger(service: string, options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env['LOG_LEVEL'] ?? 'info';
  const pretty = options.pretty ?? process.env['NODE_ENV'] !== 'production';

  return pino({
    level,
    base: { service },
    redact: REDACT_PATHS,
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  });
}
