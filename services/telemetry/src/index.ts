import { setTimeout as sleep } from 'node:timers/promises';
import { kafkaTopics } from '@iiot/events';
import { createLogger } from '@iiot/logger';
import { createApp } from './app.js';
import { loadServiceEnv } from './config.js';
import { createTelemetryStore } from './db.js';
import { createKafkaConsumer } from './kafka.js';
import { runMigrations } from './migrate.js';
import { createBatchHandler } from './persist.js';

const MIGRATE_RETRY_DELAY_MS = 5000;
// kafkajs' disconnect can block for a whole rebalance (e.g. a crashed member
// still in the group); after this we exit(1). Anything not committed is
// redelivered and re-inserted idempotently.
const SHUTDOWN_HARD_TIMEOUT_MS = 10000;

const env = loadServiceEnv();
const logger = createLogger('telemetry', { level: env.LOG_LEVEL });

const store = createTelemetryStore({
  databaseUrl: env.DATABASE_URL,
  poolMax: env.DB_POOL_MAX,
  logger,
});
const consumer = createKafkaConsumer({
  brokers: env.KAFKA_BROKERS.split(',')
    .map((b) => b.trim())
    .filter(Boolean),
  clientId: env.KAFKA_CLIENT_ID,
  groupId: env.KAFKA_GROUP_ID,
  topics: [kafkaTopics.vehicleTelemetry],
  logger,
});
let migrated = false;
let shuttingDown = false;

const app = createApp(logger, () => ({
  db: migrated && store.isReady(),
  kafka: consumer.isReady(),
}));

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Service listening');
});

/** Schema first, then consume: never pull from Kafka without a table to write to. */
async function start(): Promise<void> {
  while (!shuttingDown) {
    try {
      await runMigrations(env.DATABASE_URL, logger);
      break;
    } catch (err) {
      logger.error({ err, retryInMs: MIGRATE_RETRY_DELAY_MS }, 'Migrations failed');
      await sleep(MIGRATE_RETRY_DELAY_MS);
    }
  }
  if (shuttingDown) return;
  migrated = true;
  store.startProbe();
  await consumer.start(createBatchHandler(store, logger));
}

void start();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_HARD_TIMEOUT_MS).unref();

  try {
    // Finish the running batch and commit its offsets before closing the pool.
    await consumer.disconnect();
    await store.close();
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
