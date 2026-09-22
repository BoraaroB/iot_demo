import { randomUUID } from 'node:crypto';
import type { MqttClient } from 'mqtt';
import { createLogger } from '@iiot/logger';
import { createApp } from './app.js';
import { createBridge, subscribedTopics } from './bridge.js';
import { loadServiceEnv } from './config.js';
import { createKafkaPublisher } from './kafka.js';
import { createMqttSubscriber } from './mqtt.js';

const SHUTDOWN_DRAIN_MS = 5000;
const SHUTDOWN_HARD_TIMEOUT_MS = 10000;

const env = loadServiceEnv();
const logger = createLogger('iot-ingestion', { level: env.LOG_LEVEL });

const publisher = createKafkaPublisher({
  brokers: env.KAFKA_BROKERS.split(',')
    .map((b) => b.trim())
    .filter(Boolean),
  clientId: env.KAFKA_CLIENT_ID,
  logger,
});
const bridge = createBridge({ publisher, logger, maxInFlight: env.INGEST_MAX_IN_FLIGHT });
let mqttClient: MqttClient | undefined;
let shuttingDown = false;

const app = createApp(logger, () => ({
  mqtt: mqttClient?.connected ?? false,
  kafka: publisher.isReady(),
}));

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Service listening');
});

// Kafka first: don't accept MQTT messages until there is somewhere to send them.
void publisher.connect().then(() => {
  if (shuttingDown) return;
  mqttClient = createMqttSubscriber({
    url: env.MQTT_URL,
    clientId: env.MQTT_CLIENT_ID ?? `iot-ingestion-${randomUUID()}`,
    sharedGroup: env.MQTT_SHARED_GROUP,
    topics: subscribedTopics,
    logger,
    onMessage: (topic, payload) => bridge.handleMessage(topic, payload),
  });
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
    // Stop intake, let in-flight sends finish, then close Kafka and HTTP.
    await mqttClient?.endAsync();
    await bridge.drain(SHUTDOWN_DRAIN_MS);
    await publisher.disconnect();
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
