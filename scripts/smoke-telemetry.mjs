#!/usr/bin/env node
// telemetry smoke test (Kafka → TimescaleDB), against real Kafka + TimescaleDB — no mocks.
//
// Boots the built telemetry service with a throwaway consumer group, waits for
// /ready, then produces to vehicle.telemetry for a unique vehicle: one valid
// envelope sent twice (duplicate delivery), a second valid envelope, a
// non-JSON value, a schema-invalid payload and a wrong eventType. Asserts the
// telemetry hypertable + migration record exist, exactly the 2 valid events
// are stored once each with intact values, then SIGTERMs the service, checks
// it exits 0 and that the group committed offsets past the produced messages.
// Cleans up its rows and consumer group.
//
// Requires: `docker compose up -d kafka kafka-init timescaledb` and a build
// (`npm run typecheck`). Uses host ports / credentials from docker-compose.yml
// defaults unless DATABASE_URL / KAFKA_BROKERS are set.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, Partitioners, logLevel } from 'kafkajs';
import pg from 'pg';
import { PAYLOAD_SCHEMA_VERSION, createEventEnvelope, eventTypes, kafkaTopics } from '@iiot/events';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3002;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgres://${process.env.TIMESCALEDB_USER ?? 'iiot'}:${
    process.env.TIMESCALEDB_PASSWORD ?? 'changeme_dev_only'
  }@localhost:${process.env.TIMESCALEDB_PORT ?? '5434'}/telemetry_db`;
const READY_TIMEOUT_MS = 30000;
const PERSIST_TIMEOUT_MS = 15000;
// Extra wait after the expected rows appear, to catch a duplicate/invalid one landing late.
const SETTLE_MS = 1500;

const factoryId = 'smoke-factory';
const vehicleId = `smoke-${randomUUID()}`;
const groupId = `smoke-telemetry-${randomUUID()}`;
const topic = kafkaTopics.vehicleTelemetry;

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      last = { status: res.status, body: await res.json() };
      if (res.status === 200) return last;
    } catch (err) {
      last = { error: err.message };
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}: last=${JSON.stringify(last)}`);
}

const entry = path.join(ROOT, 'services', 'telemetry', 'dist', 'index.js');
if (!existsSync(entry)) {
  console.error(`FAIL ${entry} does not exist — run "npm run typecheck" first`);
  process.exit(1);
}

const stray = await fetch(`http://localhost:${PORT}/health`).then(
  () => true,
  () => false,
);
if (stray) {
  console.error(`FAIL port ${PORT} already in use — stop the running telemetry first`);
  process.exit(1);
}

const service = spawn(process.execPath, ['dist/index.js'], {
  cwd: path.dirname(path.dirname(entry)),
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL,
    KAFKA_BROKERS,
    KAFKA_GROUP_ID: groupId,
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serviceLog = '';
service.stdout.on('data', (c) => (serviceLog += c));
service.stderr.on('data', (c) => (serviceLog += c));
const serviceExit = new Promise((resolve) => service.once('exit', (code) => resolve(code)));

const kafka = new Kafka({
  clientId: 'smoke-telemetry',
  brokers: KAFKA_BROKERS.split(','),
  logLevel: logLevel.ERROR,
});
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const admin = kafka.admin();
const db = new pg.Client({ connectionString: DATABASE_URL });

const telemetry = (overrides = {}) => ({
  timestamp: new Date().toISOString(),
  x: 12.5,
  y: 7.25,
  speed: 1.4,
  battery: 88,
  temperature: 31,
  ...overrides,
});
const envelope = (payload, eventType = eventTypes.telemetryReported) =>
  createEventEnvelope({
    eventType,
    vehicleId,
    factoryId,
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    payload,
  });

const countRows = async () =>
  Number(
    (await db.query('SELECT count(*) AS n FROM telemetry WHERE vehicle_id = $1', [vehicleId]))
      .rows[0].n,
  );

let producedTo; // { partition, lastOffset }

try {
  await db.connect();
  await producer.connect();
  await admin.connect();

  const ready = await waitForReady(`http://localhost:${PORT}/ready`, READY_TIMEOUT_MS);
  check('/ready 200 with db+kafka up', ready.body?.checks?.db && ready.body?.checks?.kafka);

  const hypertable = await db.query(
    `SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry'`,
  );
  check('telemetry is a hypertable', hypertable.rowCount === 1);
  const migration = await db.query(
    `SELECT 1 FROM pgmigrations WHERE name = '1790078400000_create-telemetry-hypertable'`,
  );
  check('migration recorded in pgmigrations', migration.rowCount === 1);

  const first = envelope(telemetry({ x: 1.5, battery: 70 }));
  const second = envelope(telemetry({ x: 2.5, speed: 0 }));
  const values = [
    JSON.stringify(first),
    JSON.stringify(first), // duplicate delivery
    'not json {',
    JSON.stringify(envelope(telemetry({ battery: 150 }))),
    JSON.stringify(envelope(telemetry(), eventTypes.statusReported)),
    JSON.stringify(second),
  ];
  // Sequential sends: one partition (key = vehicleId), predictable offsets.
  for (const value of values) {
    const [meta] = await producer.send({ topic, acks: -1, messages: [{ key: vehicleId, value }] });
    producedTo = { partition: meta.partition, lastOffset: Number(meta.baseOffset) };
  }

  const deadline = Date.now() + PERSIST_TIMEOUT_MS;
  while ((await countRows()) < 2 && Date.now() < deadline) await sleep(200);
  await sleep(SETTLE_MS);
  const n = await countRows();
  check('exactly 2 rows stored (duplicate + 3 invalid skipped)', n === 2, `got ${n}`);

  const { rows } = await db.query(
    `SELECT time, event_id, factory_id, x, y, speed, battery, temperature, ingested_at
       FROM telemetry WHERE vehicle_id = $1 ORDER BY x`,
    [vehicleId],
  );
  const row = rows[0];
  const ok =
    row &&
    row.event_id === first.eventId &&
    row.factory_id === factoryId &&
    row.time.toISOString() === first.payload.timestamp &&
    row.ingested_at.toISOString() === first.timestamp &&
    row.x === 1.5 &&
    row.y === 7.25 &&
    row.speed === 1.4 &&
    row.battery === 70 &&
    row.temperature === 31 &&
    rows[1]?.event_id === second.eventId;
  check('row values match the envelope', Boolean(ok), ok ? '' : JSON.stringify(rows));
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  service.kill('SIGTERM');
  const code = await Promise.race([serviceExit, sleep(12000).then(() => 'timeout')]);
  if (code === 'timeout') service.kill('SIGKILL');
  check('graceful shutdown (exit 0)', code === 0, `exit=${code}`);

  if (producedTo) {
    try {
      const [offsets] = await admin.fetchOffsets({ groupId, topics: [topic] });
      const committed = Number(
        offsets.partitions.find((p) => p.partition === producedTo.partition)?.offset ?? -1,
      );
      check(
        'offsets committed past produced messages',
        committed > producedTo.lastOffset,
        `partition ${producedTo.partition}: committed=${committed}, last produced=${producedTo.lastOffset}`,
      );
    } catch (err) {
      check('offsets committed past produced messages', false, err.message);
    }
  }

  await db.query('DELETE FROM telemetry WHERE vehicle_id = $1', [vehicleId]).catch(() => {});
  await admin.deleteGroups([groupId]).catch(() => {});
  await db.end().catch(() => {});
  await producer.disconnect().catch(() => {});
  await admin.disconnect().catch(() => {});
}

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.log(`\nservice log:\n${serviceLog.trim()}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
