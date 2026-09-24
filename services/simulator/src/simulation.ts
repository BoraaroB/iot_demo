import { connect, type MqttClient } from 'mqtt';
import { mqttTopics } from '@iiot/events';
import type { Logger } from '@iiot/logger';
import { createVehicle, stepVehicle, toStatus, toTelemetry, type Vehicle } from './vehicle.js';

export interface SimulationOptions {
  mqttUrl: string;
  clientId: string;
  factoryId: string;
  vehicleIdPrefix: string;
  vehicleCount: number;
  publishIntervalMs: number;
  logger: Logger;
}

export interface Simulation {
  isConnected(): boolean;
  /** Stops publishing, waits for in-flight QoS 1 acks, disconnects. */
  stop(): Promise<void>;
}

const STATS_INTERVAL_MS = 10000;

/**
 * One MQTT connection publishes for all simulated vehicles (fine for Phase 1;
 * per-vehicle connections are a load-testing question for Phase 10).
 *
 * Each vehicle ticks on its own timer, offset evenly across the interval so
 * publishes are spread out instead of bursting. While disconnected, ticks
 * still advance the model but nothing is published — mqtt.js would otherwise
 * buffer every message in memory until reconnect.
 */
export function startSimulation(opts: SimulationOptions): Simulation {
  const logger = opts.logger.child({ component: 'simulation' });
  const vehicles: Vehicle[] = Array.from({ length: opts.vehicleCount }, (_, i) =>
    createVehicle(`${opts.vehicleIdPrefix}-${String(i + 1).padStart(4, '0')}`, i),
  );
  const timers: NodeJS.Timeout[] = [];
  const stats = { published: 0, skippedOffline: 0, failed: 0 };
  let stopping = false;

  const client: MqttClient = connect(opts.mqttUrl, {
    clientId: opts.clientId,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
  });

  function publish(topic: string, payload: object): void {
    client.publishAsync(topic, JSON.stringify(payload), { qos: 1 }).then(
      () => {
        stats.published += 1;
      },
      (err: unknown) => {
        stats.failed += 1;
        logger.warn({ err, topic }, 'MQTT publish failed');
      },
    );
  }

  function publishStatus(v: Vehicle): void {
    publish(mqttTopics.status(opts.factoryId, v.vehicleId), toStatus(v, new Date().toISOString()));
  }

  function tick(v: Vehicle): void {
    const statusChanged = stepVehicle(v, opts.publishIntervalMs / 1000);
    if (!client.connected) {
      stats.skippedOffline += 1;
      return;
    }
    const timestamp = new Date().toISOString();
    publish(mqttTopics.telemetry(opts.factoryId, v.vehicleId), toTelemetry(v, timestamp));
    if (statusChanged) {
      logger.debug({ vehicleId: v.vehicleId, status: v.status }, 'Vehicle status changed');
      publishStatus(v);
    }
  }

  client.on('connect', () => {
    logger.info({ url: opts.mqttUrl, clientId: opts.clientId }, 'MQTT connected');
    // Status is published on change only, so (re)announce every vehicle's
    // current status after each (re)connect.
    for (const v of vehicles) publishStatus(v);
  });
  client.on('reconnect', () => logger.info('MQTT reconnecting'));
  client.on('offline', () => logger.warn('MQTT offline'));
  client.on('error', (err) => logger.error({ err }, 'MQTT client error'));

  vehicles.forEach((v, i) => {
    const offset = Math.floor((i * opts.publishIntervalMs) / vehicles.length);
    const start = setTimeout(() => {
      if (stopping) return;
      timers.push(setInterval(() => tick(v), opts.publishIntervalMs));
    }, offset);
    timers.push(start);
  });

  const statsTimer = setInterval(() => {
    logger.info({ ...stats, vehicles: vehicles.length }, 'Simulation stats');
  }, STATS_INTERVAL_MS);
  timers.push(statsTimer);

  logger.info(
    {
      factoryId: opts.factoryId,
      vehicleCount: vehicles.length,
      publishIntervalMs: opts.publishIntervalMs,
    },
    'Simulation started',
  );

  return {
    isConnected: () => client.connected,
    async stop() {
      stopping = true;
      for (const t of timers) clearTimeout(t); // clearTimeout also clears intervals
      await client.endAsync();
      logger.info(stats, 'Simulation stopped');
    },
  };
}
