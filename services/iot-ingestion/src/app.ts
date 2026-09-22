import express, {
  type Express,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '@iiot/logger';

/** Named dependency checks; every one must be `true` for `/ready` to pass. */
export type ReadinessChecks = () => Record<string, boolean>;

/**
 * `/health` only checks that the process itself is alive — no dependency
 * calls, per CLAUDE.md. `/ready` reports the MQTT + Kafka connection state
 * (cheap in-memory flags, no network round-trip per probe).
 */
export function createApp(logger: Logger, readiness: ReadinessChecks): Express {
  const app = express();

  app.use(pinoHttp({ logger }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    const checks = readiness();
    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', checks });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({ error: 'Internal Server Error' });
  };
  app.use(errorHandler);

  return app;
}
