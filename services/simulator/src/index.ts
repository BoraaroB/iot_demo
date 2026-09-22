import { randomUUID } from 'node:crypto';
import { createLogger } from '@iiot/logger';
import { createApp } from './app.js';
import { loadServiceEnv } from './config.js';
import { startSimulation } from './simulation.js';

const SHUTDOWN_HARD_TIMEOUT_MS = 10000;

const env = loadServiceEnv();
const logger = createLogger('simulator', { level: env.LOG_LEVEL });

const simulation = startSimulation({
  mqttUrl: env.MQTT_URL,
  clientId: env.MQTT_CLIENT_ID ?? `simulator-${randomUUID()}`,
  factoryId: env.SIM_FACTORY_ID,
  vehicleIdPrefix: env.SIM_VEHICLE_ID_PREFIX,
  vehicleCount: env.SIM_VEHICLE_COUNT,
  publishIntervalMs: env.SIM_PUBLISH_INTERVAL_MS,
  logger,
});
let shuttingDown = false;

const app = createApp(logger, () => ({ mqtt: simulation.isConnected() }));

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Service listening');
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_HARD_TIMEOUT_MS).unref();

  try {
    await simulation.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
