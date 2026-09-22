import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, Partitioners, logLevel, type LogEntry, type logCreator } from 'kafkajs';
import type { Logger } from '@iiot/logger';

const CONNECT_RETRY_DELAY_MS = 5000;
const PROBE_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

export interface KafkaPublisher {
  /** Resolves once connected; retries until it succeeds or `disconnect()` is called. */
  connect(): Promise<void>;
  send(topic: string, key: string, value: string): Promise<void>;
  /** Cached result of the last broker probe / send — no network call. */
  isReady(): boolean;
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

export function createKafkaPublisher(opts: {
  brokers: string[];
  clientId: string;
  logger: Logger;
}): KafkaPublisher {
  const logger = opts.logger.child({ component: 'kafka' });
  const kafka = new Kafka({
    clientId: opts.clientId,
    brokers: opts.brokers,
    logLevel: logLevel.WARN,
    logCreator: pinoLogCreator(logger),
  });
  // Explicit partitioner: murmur2 on the key (Java-client compatible), so
  // key = vehicleId keeps per-vehicle ordering. Also silences kafkajs' v2
  // "default partitioner changed" warning.
  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: false,
  });

  // kafkajs' producer DISCONNECT event only fires on an explicit
  // `disconnect()`, not when the broker goes away (verified by stopping the
  // broker), so readiness comes from a periodic, bounded metadata probe.
  const admin = kafka.admin({ retry: { retries: 0 } });

  let connected = false;
  let brokerReachable = false;
  let probing = false;
  let stopped = false;
  let probeTimer: NodeJS.Timeout | undefined;

  function setReachable(reachable: boolean, err?: unknown): void {
    if (reachable && !brokerReachable) logger.info('Kafka broker reachable');
    if (!reachable && brokerReachable) logger.warn({ err }, 'Kafka broker unreachable');
    brokerReachable = reachable;
  }

  /**
   * Never rejects. Status flips after at most PROBE_TIMEOUT_MS, but a new
   * probe only starts once the previous `describeCluster()` has settled, so a
   * hung broker can't stack up requests.
   */
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

  producer.on(producer.events.CONNECT, () => {
    connected = true;
    logger.info({ brokers: opts.brokers }, 'Kafka producer connected');
  });
  producer.on(producer.events.DISCONNECT, () => {
    connected = false;
    logger.info('Kafka producer disconnected');
  });

  return {
    async connect() {
      while (!stopped) {
        try {
          await producer.connect();
          await admin.connect();
          await probe();
          probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
          return;
        } catch (err) {
          logger.error({ err, retryInMs: CONNECT_RETRY_DELAY_MS }, 'Kafka connect failed');
          await sleep(CONNECT_RETRY_DELAY_MS);
        }
      }
    },
    async send(topic, key, value) {
      try {
        await producer.send({ topic, acks: -1, messages: [{ key, value }] });
      } catch (err) {
        setReachable(false, err);
        throw err;
      }
    },
    isReady: () => connected && brokerReachable,
    async disconnect() {
      stopped = true;
      clearInterval(probeTimer);
      await admin.disconnect();
      await producer.disconnect();
    },
  };
}
