import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, logLevel, type EachBatchHandler, type LogEntry, type logCreator } from 'kafkajs';
import type { Logger } from '@iiot/logger';

const CONNECT_RETRY_DELAY_MS = 5000;
const PROBE_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

export interface KafkaConsumerHandle {
  /** Connects, subscribes and starts consuming; retries until it succeeds or `disconnect()` is called. */
  start(eachBatch: EachBatchHandler): Promise<void>;
  /** Group joined and broker reachable (cached — no network call). */
  isReady(): boolean;
  /** Stops fetching, waits for the running batch and commits resolved offsets. */
  disconnect(): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Routes kafkajs' internal logs through the service's Pino logger. */
function pinoLogCreator(logger: Logger): logCreator {
  return () =>
    ({ namespace, level, log }: LogEntry) => {
      const { message, timestamp: _timestamp, ...extra } = log;
      const fields: Record<string, unknown> = { namespace, ...extra };
      if (level === logLevel.ERROR) logger.error(fields, message);
      else if (level === logLevel.WARN) logger.warn(fields, message);
      else if (level === logLevel.INFO) logger.info(fields, message);
      else logger.debug(fields, message);
    };
}

export function createKafkaConsumer(opts: {
  brokers: string[];
  clientId: string;
  groupId: string;
  topics: string[];
  logger: Logger;
}): KafkaConsumerHandle {
  const logger = opts.logger.child({ component: 'kafka' });
  const kafka = new Kafka({
    clientId: opts.clientId,
    brokers: opts.brokers,
    logLevel: logLevel.WARN,
    logCreator: pinoLogCreator(logger),
  });
  const consumer = kafka.consumer({ groupId: opts.groupId, allowAutoTopicCreation: false });
  // Same readiness approach as iot-ingestion: kafkajs connection events don't
  // reliably report broker loss, so broker reachability is a bounded probe.
  const admin = kafka.admin({ retry: { retries: 0 } });

  let joined = false;
  let brokerReachable = false;
  let probing = false;
  let stopped = false;
  let probeTimer: NodeJS.Timeout | undefined;

  function setReachable(reachable: boolean, err?: unknown): void {
    if (reachable && !brokerReachable) logger.info('Kafka broker reachable');
    if (!reachable && brokerReachable) logger.warn({ err }, 'Kafka broker unreachable');
    brokerReachable = reachable;
  }

  async function probe(): Promise<void> {
    if (probing) return;
    probing = true;
    const attempt = admin.describeCluster();
    void attempt
      .catch(() => undefined)
      .finally(() => {
        probing = false;
      });
    await withTimeout(attempt, PROBE_TIMEOUT_MS).then(
      () => setReachable(true),
      (err: unknown) => setReachable(false, err),
    );
  }

  consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
    joined = true;
    logger.info(
      { groupId: payload.groupId, assignment: payload.memberAssignment },
      'Kafka consumer joined group',
    );
  });
  // kafkajs restarts the consumer itself after a retriable crash (e.g. retries
  // exhausted on a failing DB insert); it rejoins and GROUP_JOIN fires again.
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    joined = false;
    logger.error({ err: payload.error, restart: payload.restart }, 'Kafka consumer crashed');
  });
  consumer.on(consumer.events.STOP, () => {
    joined = false;
  });

  return {
    async start(eachBatch) {
      while (!stopped) {
        try {
          await consumer.connect();
          await admin.connect();
          await consumer.subscribe({ topics: opts.topics, fromBeginning: true });
          // The handler resolves offsets itself, per inserted chunk.
          await consumer.run({ eachBatch, eachBatchAutoResolve: false });
          await probe();
          probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
          logger.info({ brokers: opts.brokers, topics: opts.topics }, 'Kafka consumer started');
          return;
        } catch (err) {
          logger.error({ err, retryInMs: CONNECT_RETRY_DELAY_MS }, 'Kafka consumer start failed');
          await sleep(CONNECT_RETRY_DELAY_MS);
        }
      }
    },
    isReady: () => joined && brokerReachable,
    async disconnect() {
      stopped = true;
      clearInterval(probeTimer);
      await consumer.disconnect();
      await admin.disconnect();
    },
  };
}
