#!/usr/bin/env node
// simulator smoke test (simulator → MQTT), against real EMQX — no mocks.
//
// Subscribes to a unique throwaway factory's topics, boots the built simulator
// with a few vehicles and a short publish interval, and asserts that every
// vehicle announces its status and publishes telemetry that passes the same
// Zod schemas iot-ingestion validates with, with advancing device timestamps
// and moving positions. Finally SIGTERMs the service and checks it exits 0.
//
// Requires: `docker compose up -d emqx` and a build (`npm run typecheck`).
// Uses host ports from docker-compose.yml defaults.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import mqtt from 'mqtt';
import { statusPayloadSchema, telemetryPayloadSchema } from '@iiot/events';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3006;
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const READY_TIMEOUT_MS = 15000;
const VEHICLES = 3;
const INTERVAL_MS = 200;
const COLLECT_MS = 3000;
// Allow for connect time and the per-vehicle start offset.
const MIN_TELEMETRY_PER_VEHICLE = Math.floor(COLLECT_MS / INTERVAL_MS / 2);

const factoryId = `smoke-sim-${randomUUID()}`;
const prefix = 'simsmoke';
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

const entry = path.join(ROOT, 'services', 'simulator', 'dist', 'index.js');
if (!existsSync(entry)) {
  console.error(`FAIL ${entry} does not exist — run "npm run typecheck" first`);
  process.exit(1);
}

// Guard against a stray instance answering /ready instead of the one we spawn.
const stray = await fetch(`http://localhost:${PORT}/health`).then(
  () => true,
  () => false,
);
if (stray) {
  console.error(`FAIL port ${PORT} already in use — stop the running simulator first`);
  process.exit(1);
}

// Subscribe before the simulator starts so the initial status announcements are captured.
const received = []; // { vehicleId, kind, body }
const subscriber = await mqtt.connectAsync(MQTT_URL, { clientId: `smoke-sub-${randomUUID()}` });
subscriber.on('message', (topic, payload) => {
  const [, , , vehicleId, kind] = topic.split('/');
  received.push({ vehicleId, kind, body: payload.toString() });
});
await subscriber.subscribeAsync(`factory/${factoryId}/vehicle/+/+`, { qos: 1 });

const service = spawn(process.execPath, ['dist/index.js'], {
  cwd: path.dirname(path.dirname(entry)),
  env: {
    ...process.env,
    PORT: String(PORT),
    MQTT_URL,
    SIM_FACTORY_ID: factoryId,
    SIM_VEHICLE_ID_PREFIX: prefix,
    SIM_VEHICLE_COUNT: String(VEHICLES),
    SIM_PUBLISH_INTERVAL_MS: String(INTERVAL_MS),
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serviceLog = '';
service.stdout.on('data', (c) => (serviceLog += c));
service.stderr.on('data', (c) => (serviceLog += c));
const serviceExit = new Promise((resolve) => service.once('exit', (code) => resolve(code)));

try {
  const ready = await waitForReady(`http://localhost:${PORT}/ready`, READY_TIMEOUT_MS);
  check('/ready 200 with mqtt up', ready.body?.checks?.mqtt === true);

  await sleep(COLLECT_MS);

  const unexpected = received.filter((m) => !expectedIds.includes(m.vehicleId));
  check('only configured vehicle ids published', unexpected.length === 0, `${unexpected.length}`);

  const schemas = { telemetry: telemetryPayloadSchema, status: statusPayloadSchema };
  const invalid = received.filter((m) => {
    const schema = schemas[m.kind];
    if (!schema) return true;
    try {
      return !schema.safeParse(JSON.parse(m.body)).success;
    } catch {
      return true;
    }
  });
  check(
    'all payloads pass the ingestion schemas',
    invalid.length === 0,
    invalid.length ? invalid[0].body : `${received.length} messages`,
  );

  for (const id of expectedIds) {
    const status = received.filter((m) => m.vehicleId === id && m.kind === 'status');
    const telemetry = received
      .filter((m) => m.vehicleId === id && m.kind === 'telemetry')
      .map((m) => JSON.parse(m.body));
    const times = telemetry.map((t) => Date.parse(t.timestamp));
    const increasing = times.every((t, i) => i === 0 || t > times[i - 1]);
    const moved =
      telemetry.length >= 2 &&
      (telemetry[0].x !== telemetry.at(-1).x || telemetry[0].y !== telemetry.at(-1).y);
    check(
      `${id}: status announced, telemetry flowing with advancing time and position`,
      status.length >= 1 && telemetry.length >= MIN_TELEMETRY_PER_VEHICLE && increasing && moved,
      `status=${status.length} telemetry=${telemetry.length} increasing=${increasing} moved=${moved}`,
    );
  }
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  service.kill('SIGTERM');
  const code = await Promise.race([serviceExit, sleep(12000).then(() => 'timeout')]);
  if (code === 'timeout') service.kill('SIGKILL');
  check('graceful shutdown (exit 0)', code === 0, `exit=${code}`);
  await subscriber.endAsync().catch(() => {});
}

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.log(`\nservice log:\n${serviceLog.trim()}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
