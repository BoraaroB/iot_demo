import { connect, type MqttClient } from 'mqtt';
import type { Logger } from '@iiot/logger';

export interface MqttSubscriberOptions {
  url: string;
  clientId: string;
  sharedGroup: string;
  /** Plain topic filters; the `$share/<group>/` prefix is added here. */
  topics: string[];
  logger: Logger;
  onMessage: (topic: string, payload: Buffer) => void;
}

/**
 * Connects to EMQX and subscribes (QoS 1) via shared subscriptions, so
 * multiple iot-ingestion replicas split the stream instead of each
 * forwarding every message. The broker delivers the real topic (without the
 * `$share/...` prefix) to `onMessage`.
 */
export function createMqttSubscriber(opts: MqttSubscriberOptions): MqttClient {
  const logger = opts.logger.child({ component: 'mqtt' });
  const filters = opts.topics.map((t) => `$share/${opts.sharedGroup}/${t}`);

  const client = connect(opts.url, {
    clientId: opts.clientId,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    // Re-subscribed explicitly on every `connect` below (clean session means
    // the broker forgets subscriptions on disconnect).
    resubscribe: false,
  });

  client.on('connect', () => {
    logger.info({ url: opts.url, clientId: opts.clientId }, 'MQTT connected');
    client
      .subscribeAsync(filters, { qos: 1 })
      .then((grants) => {
        const rejected = grants.filter((g) => g.qos === 128);
        if (rejected.length > 0) {
          logger.error({ rejected }, 'MQTT subscription rejected by broker');
        } else {
          logger.info({ filters }, 'MQTT subscribed');
        }
      })
      .catch((err: unknown) => {
        logger.error({ err, filters }, 'MQTT subscribe failed');
      });
  });
  client.on('reconnect', () => logger.info('MQTT reconnecting'));
  client.on('offline', () => logger.warn('MQTT offline'));
  client.on('error', (err) => logger.error({ err }, 'MQTT client error'));
  client.on('message', (topic, payload) => opts.onMessage(topic, payload));

  return client;
}
