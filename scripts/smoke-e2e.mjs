#!/usr/bin/env node
// Full-pipeline E2E smoke test: simulator → MQTT (EMQX) → iot-ingestion →
// Kafka → telemetry → TimescaleDB. Real infrastructure, no mocks.
//
// Boots iot-ingestion + telemetry, then the simulator against a throwaway
// factory id and vehicle id prefix unique to this run. Observes the MQTT
// messages the simulator actually publishes and the Kafka envelopes
// iot-ingestion actually produces, stops the simulator, and then asserts that
// every published telemetry message reached the telemetry hypertable exactly
// once with intact values, and that the stored event ids are the ones that
// travelled through Kafka. Finally stops both services and checks they exit 0.
//
// Requires: `docker compose up -d emqx kafka kafka-init timescaledb` and a
// build (`npm run typecheck`). Uses host ports / credentials from
// docker-compose.yml defaults unless DATABASE_URL / KAFKA_BROKERS / MQTT_URL
// are set.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, logLevel } from 'kafkajs';
import mqtt from 'mqtt';
import pg from 'pg';
import {
  eventTypes,
  kafkaTopics,
  parseEventEnvelope,
  statusPayloadSchema,
  telemetryPayloadSchema,
} from '@iiot/events';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgres://${process.env.TIMESCALEDB_USER ?? 'iiot'}:${
    process.env.TIMESCALEDB_PASSWORD ?? 'changeme_dev_only'
  }@localhost:${process.env.TIMESCALEDB_PORT ?? '5434'}/telemetry_db`;
// Throwaway consumer group for the telemetry service, so the run never touches
// the real `telemetry` group's offsets. telemetry subscribes fromBeginning, so
// the group's offsets are seeded to the topic end before the service starts —
// otherwise every run would replay the topic's history and re-insert it.
// Not overridable: the run seeds and then deletes this group.
const KAFKA_GROUP_ID = `smoke-e2e-telemetry-${randomUUID()}`;

const PORTS = { ingestion: 3001, telemetry: 3002, simulator: 3006 };
const READY_TIMEOUT_MS = 30000;
const GROUP_JOIN_TIMEOUT_MS = 30000;
// Generous: on the first ever run the telemetry group has no committed offset
// and replays the topic's history before reaching this run's messages.
const PERSIST_TIMEOUT_MS = 60000;
const SHUTDOWN_TIMEOUT_MS = 12000;
// Extra wait after the expected rows land, to catch a duplicate arriving late.
const SETTLE_MS = 2000;

const VEHICLES = 3;
const INTERVAL_MS = 250;
const COLLECT_MS = 4000;
// Device time → ingestion receipt. Bounded liveness check, not a latency claim.
const MAX_LAG_MS = 30000;

const factoryId = `e2e-${randomUUID()}`;
const prefix = `e2e-${randomUUID().slice(0, 8)}`;
const expectedIds = Array.from(
  { length: VEHICLES },
  (_, i) => `${prefix}-${String(i + 1).padStart(4, '0')}`,
);

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

/** Spawns a built service and collects its log; `stop()` SIGTERMs and returns the exit code. */
function startService(name, env) {
  const entry = path.join(ROOT, 'services', name, 'dist', 'index.js');
  if (!existsSync(entry)) {
    console.error(`FAIL ${entry} does not exist — run "npm run typecheck" first`);
    process.exit(1);
  }
  const proc = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.join(ROOT, 'services', name),
    env: { ...process.env, LOG_LEVEL: 'warn', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const service = { name, proc, log: '', exit: null };
  proc.stdout.on('data', (c) => (service.log += c));
  proc.stderr.on('data', (c) => (service.log += c));
  const exited = new Promise((resolve) => proc.once('exit', (code) => resolve(code)));
  service.stop = async () => {
    proc.kill('SIGTERM');
    const code = await Promise.race([exited, sleep(SHUTDOWN_TIMEOUT_MS).then(() => 'timeout')]);
    if (code === 'timeout') proc.kill('SIGKILL');
    service.exit = code;
    return code;
  };
  return service;
}

for (const [name, port] of Object.entries(PORTS)) {
  const stray = await fetch(`http://localhost:${port}/health`).then(
    () => true,
    () => false,
  );
  if (stray) {
    console.error(`FAIL port ${port} already in use — stop the running ${name} first`);
    process.exit(1);
  }
}

const kafka = new Kafka({
  clientId: 'smoke-e2e',
  brokers: KAFKA_BROKERS.split(','),
  logLevel: logLevel.ERROR,
});
// Observes what iot-ingestion produces. fromBeginning: false with a fresh group
// starts at the topic end; the simulator is only started after GROUP_JOIN, so
// nothing is missed and the topic's history is not replayed.
const observerGroupId = `smoke-e2e-observer-${randomUUID()}`;
const observer = kafka.consumer({ groupId: observerGroupId });
const admin = kafka.admin();
const db = new pg.Client({ connectionString: DATABASE_URL });

const kafkaEvents = []; // { topic, key, value }
const published = []; // { vehicleId, kind, body }
let subscriber;
const services = [];

const countRows = async () =>
  Number(
    (await db.query('SELECT count(*) AS n FROM telemetry WHERE factory_id = $1', [factoryId]))
      .rows[0].n,
  );

try {
  await db.connect();
  await admin.connect();

  const joined = new Promise((resolve, reject) => {
    observer.on(observer.events.GROUP_JOIN, () => resolve());
    setTimeout(
      () => reject(new Error('observer did not join its group in time')),
      GROUP_JOIN_TIMEOUT_MS,
    ).unref?.();
  });
  await observer.connect();
  await observer.subscribe({
    topics: [kafkaTopics.vehicleTelemetry, kafkaTopics.vehicleStatus],
    fromBeginning: false,
  });
  await observer.run({
    eachMessage: async ({ topic, message }) => {
      const value = message.value?.toString();
      if (!value?.includes(factoryId)) return; // other runs' traffic
      kafkaEvents.push({ topic, key: message.key?.toString(), value });
    },
  });
  await joined;

  const ingestion = startService('iot-ingestion', {
    PORT: String(PORTS.ingestion),
    MQTT_URL,
    KAFKA_BROKERS,
  });
  services.push(ingestion);

  // Start the telemetry group at the topic end (the group has no members yet,
  // so setOffsets is allowed). Without this its fromBeginning subscription
  // would replay every message the topic still retains.
  const endOffsets = await admin.fetchTopicOffsets(kafkaTopics.vehicleTelemetry);
  await admin.setOffsets({
    groupId: KAFKA_GROUP_ID,
    topic: kafkaTopics.vehicleTelemetry,
    partitions: endOffsets.map(({ partition, offset }) => ({ partition, offset })),
  });

  const telemetry = startService('telemetry', {
    PORT: String(PORTS.telemetry),
    DATABASE_URL,
    KAFKA_BROKERS,
    KAFKA_GROUP_ID,
  });
  services.push(telemetry);

  const ingestionReady = await waitForReady(
    `http://localhost:${PORTS.ingestion}/ready`,
    READY_TIMEOUT_MS,
  );
  check(
    'iot-ingestion /ready 200 with mqtt+kafka up',
    ingestionReady.body?.checks?.mqtt === true && ingestionReady.body?.checks?.kafka === true,
    JSON.stringify(ingestionReady.body?.checks),
  );
  const telemetryReady = await waitForReady(
    `http://localhost:${PORTS.telemetry}/ready`,
    READY_TIMEOUT_MS,
  );
  check(
    'telemetry /ready 200 with db+kafka up',
    telemetryReady.body?.checks?.db === true && telemetryReady.body?.checks?.kafka === true,
    JSON.stringify(telemetryReady.body?.checks),
  );

  // Independent view of what actually left the simulator over MQTT.
  subscriber = await mqtt.connectAsync(MQTT_URL, { clientId: `smoke-e2e-sub-${randomUUID()}` });
  subscriber.on('message', (topic, payload) => {
    const [, , , vehicleId, kind] = topic.split('/');
    published.push({ vehicleId, kind, body: payload.toString() });
  });
  await subscriber.subscribeAsync(`factory/${factoryId}/vehicle/+/+`, { qos: 1 });

  const simulator = startService('simulator', {
    PORT: String(PORTS.simulator),
    MQTT_URL,
    SIM_FACTORY_ID: factoryId,
    SIM_VEHICLE_ID_PREFIX: prefix,
    SIM_VEHICLE_COUNT: String(VEHICLES),
    SIM_PUBLISH_INTERVAL_MS: String(INTERVAL_MS),
  });
  services.push(simulator);
  const simulatorReady = await waitForReady(
    `http://localhost:${PORTS.simulator}/ready`,
    READY_TIMEOUT_MS,
  );
  check(
    'simulator /ready 200 with mqtt up',
    simulatorReady.body?.checks?.mqtt === true,
    JSON.stringify(simulatorReady.body?.checks),
  );

  await sleep(COLLECT_MS);

  // Stop publishing before comparing, so the expected set is closed and no
  // in-flight message is counted as loss.
  const simulatorExit = await simulator.stop();
  check('simulator graceful shutdown (exit 0)', simulatorExit === 0, `exit=${simulatorExit}`);

  const sentTelemetry = published
    .filter((m) => m.kind === 'telemetry')
    .map((m) => JSON.parse(m.body));
  const sentStatus = published.filter((m) => m.kind === 'status');
  check(
    'simulator published telemetry for every vehicle over MQTT',
    sentTelemetry.length > 0 &&
      expectedIds.every((id) =>
        published.some((m) => m.vehicleId === id && m.kind === 'telemetry'),
      ),
    `${sentTelemetry.length} telemetry, ${sentStatus.length} status, ${VEHICLES} vehicles`,
  );

  const deadline = Date.now() + PERSIST_TIMEOUT_MS;
  while ((await countRows()) < sentTelemetry.length && Date.now() < deadline) await sleep(250);
  await sleep(SETTLE_MS);

  const stored = await countRows();
  check(
    'every published telemetry message stored exactly once',
    stored === sentTelemetry.length,
    `${stored} rows for ${sentTelemetry.length} published`,
  );

  const { rows } = await db.query(
    `SELECT time, event_id, vehicle_id, x, y, speed, battery, temperature, ingested_at
       FROM telemetry WHERE factory_id = $1`,
    [factoryId],
  );
  const byKey = new Map(rows.map((r) => [`${r.vehicle_id}|${r.time.toISOString()}`, r]));
  const mismatched = [];
  for (const m of published.filter((p) => p.kind === 'telemetry')) {
    const sent = JSON.parse(m.body);
    const row = byKey.get(`${m.vehicleId}|${sent.timestamp}`);
    if (
      !row ||
      row.x !== sent.x ||
      row.y !== sent.y ||
      row.speed !== sent.speed ||
      row.battery !== sent.battery ||
      row.temperature !== sent.temperature
    ) {
      mismatched.push({ sent, row: row ?? null });
    }
  }
  check(
    'stored rows match the published payloads (vehicle, device time, values)',
    mismatched.length === 0,
    mismatched.length ? JSON.stringify(mismatched[0]) : `${rows.length} rows compared`,
  );

  check(
    'rows stored for every vehicle',
    expectedIds.every((id) => rows.some((r) => r.vehicle_id === id)),
    [...new Set(rows.map((r) => r.vehicle_id))].sort().join(','),
  );

  // Kafka is genuinely in the path: the ids stored in TimescaleDB are the ones
  // carried by the envelopes observed on vehicle.telemetry.
  const telemetryEnvelopes = [];
  let envelopeFailures = 0;
  for (const e of kafkaEvents.filter((e) => e.topic === kafkaTopics.vehicleTelemetry)) {
    try {
      telemetryEnvelopes.push(parseEventEnvelope(JSON.parse(e.value), telemetryPayloadSchema));
    } catch {
      envelopeFailures += 1;
    }
  }
  check(
    'all vehicle.telemetry messages are valid envelopes keyed by vehicleId',
    envelopeFailures === 0 &&
      telemetryEnvelopes.length === sentTelemetry.length &&
      telemetryEnvelopes.every((env) => env.eventType === eventTypes.telemetryReported) &&
      kafkaEvents
        .filter((e) => e.topic === kafkaTopics.vehicleTelemetry)
        .every((e) => expectedIds.includes(e.key)),
    `${telemetryEnvelopes.length} envelopes, ${envelopeFailures} unparseable, ${sentTelemetry.length} published`,
  );
  const storedIds = new Set(rows.map((r) => r.event_id));
  const kafkaIds = new Set(telemetryEnvelopes.map((env) => env.eventId));
  check(
    'stored event ids are exactly the ids seen on Kafka',
    storedIds.size === kafkaIds.size && [...kafkaIds].every((id) => storedIds.has(id)),
    `${storedIds.size} stored, ${kafkaIds.size} on Kafka`,
  );

  const statusEnvelopes = kafkaEvents.filter((e) => e.topic === kafkaTopics.vehicleStatus);
  let statusOk = statusEnvelopes.length > 0;
  for (const e of statusEnvelopes) {
    try {
      const env = parseEventEnvelope(JSON.parse(e.value), statusPayloadSchema);
      if (env.eventType !== eventTypes.statusReported) statusOk = false;
    } catch {
      statusOk = false;
    }
  }
  check(
    'status announcements reached vehicle.status as valid envelopes',
    statusOk && expectedIds.every((id) => statusEnvelopes.some((e) => e.key === id)),
    `${statusEnvelopes.length} envelopes for ${sentStatus.length} published`,
  );

  const lags = rows.map((r) => r.ingested_at.getTime() - r.time.getTime());
  const maxLag = lags.length ? Math.max(...lags) : Infinity;
  check(
    `pipeline lag (device time → ingestion) under ${MAX_LAG_MS} ms`,
    maxLag < MAX_LAG_MS,
    `max ${maxLag} ms, min ${lags.length ? Math.min(...lags) : 'n/a'} ms (this run only, not a benchmark)`,
  );
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  await subscriber?.endAsync().catch(() => {});
  for (const service of services) {
    if (service.exit !== null) continue;
    const code = await service.stop();
    check(`${service.name} graceful shutdown (exit 0)`, code === 0, `exit=${code}`);
  }
  await db.query('DELETE FROM telemetry WHERE factory_id = $1', [factoryId]).catch(() => {});
  await db.end().catch(() => {});
  await observer.disconnect().catch(() => {});
  // Both groups are throwaway; deleting them requires no active members, hence
  // after the services and the observer are gone.
  await admin.deleteGroups([observerGroupId, KAFKA_GROUP_ID]).catch(() => {});
  await admin.disconnect().catch(() => {});
}

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  for (const service of services) {
    console.log(`\n${service.name} log:\n${service.log.trim()}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
