import pg from 'pg';
import type { Logger } from '@iiot/logger';

const PROBE_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 3000;
/** Client-side cap on any query (probe or insert) so a hung server can't stall the consumer forever. */
const QUERY_TIMEOUT_MS = 10000;

export interface TelemetryRow {
  time: string;
  eventId: string;
  factoryId: string;
  vehicleId: string;
  x: number;
  y: number;
  speed: number;
  battery: number;
  temperature: number;
  ingestedAt: string;
}

export interface TelemetryStore {
  /** Inserts rows, skipping ones already stored. Returns how many were new. */
  insert(rows: TelemetryRow[]): Promise<number>;
  startProbe(): void;
  /** Cached result of the last probe / query — no network call. */
  isReady(): boolean;
  close(): Promise<void>;
}

/**
 * One statement per batch: parallel arrays + `unnest`, so the parameter
 * count stays at 10 regardless of batch size. `ON CONFLICT DO NOTHING` on
 * (event_id, time) makes Kafka redelivery harmless.
 */
const INSERT_SQL = `
  INSERT INTO telemetry
    (time, event_id, factory_id, vehicle_id, x, y, speed, battery, temperature, ingested_at)
  SELECT * FROM unnest(
    $1::timestamptz[], $2::uuid[], $3::text[], $4::text[],
    $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::float8[],
    $10::timestamptz[]
  )
  ON CONFLICT (event_id, time) DO NOTHING
`;

export function createTelemetryStore(opts: {
  databaseUrl: string;
  poolMax: number;
  logger: Logger;
}): TelemetryStore {
  const logger = opts.logger.child({ component: 'db' });
  const pool = new pg.Pool({
    connectionString: opts.databaseUrl,
    max: opts.poolMax,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    application_name: 'telemetry',
  });
  // An idle client losing its connection emits on the pool; without a
  // listener that would crash the process.
  pool.on('error', (err) => logger.warn({ err }, 'Idle Postgres client error'));

  let reachable = false;
  let probing = false;
  let probeTimer: NodeJS.Timeout | undefined;

  function setReachable(value: boolean, err?: unknown): void {
    if (value && !reachable) logger.info('TimescaleDB reachable');
    if (!value && reachable) logger.warn({ err }, 'TimescaleDB unreachable');
    reachable = value;
  }

  async function probe(): Promise<void> {
    if (probing) return;
    probing = true;
    try {
      await pool.query('SELECT 1');
      setReachable(true);
    } catch (err) {
      setReachable(false, err);
    } finally {
      probing = false;
    }
  }

  return {
    async insert(rows) {
      if (rows.length === 0) return 0;
      try {
        const result = await pool.query(INSERT_SQL, [
          rows.map((r) => r.time),
          rows.map((r) => r.eventId),
          rows.map((r) => r.factoryId),
          rows.map((r) => r.vehicleId),
          rows.map((r) => r.x),
          rows.map((r) => r.y),
          rows.map((r) => r.speed),
          rows.map((r) => r.battery),
          rows.map((r) => r.temperature),
          rows.map((r) => r.ingestedAt),
        ]);
        setReachable(true);
        return result.rowCount ?? 0;
      } catch (err) {
        setReachable(false, err);
        throw err;
      }
    },
    startProbe() {
      void probe();
      probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
    },
    isReady: () => reachable,
    async close() {
      clearInterval(probeTimer);
      await pool.end();
    },
  };
}
