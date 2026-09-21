import express, {
  type Express,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '@iiot/logger';

/**
 * `/health` only checks that the process itself is alive — no dependency
 * calls, per CLAUDE.md. `/ready` will check this service's actual
 * dependencies (Kafka, databases, MQTT, ...) once they are wired up; until
 * then it mirrors `/health`.
 */
export function createApp(logger: Logger): Express {
  const app = express();

  app.use(pinoHttp({ logger }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
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
