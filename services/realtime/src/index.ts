import { createLogger } from '@iiot/logger';
import { createApp } from './app.js';
import { loadServiceEnv } from './config.js';

const env = loadServiceEnv();
const logger = createLogger('realtime', { level: env.LOG_LEVEL });

const app = createApp(logger);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Service listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
      return;
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
