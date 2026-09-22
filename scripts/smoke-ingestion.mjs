#!/usr/bin/env node
// iot-ingestion smoke test (MQTT → Kafka), against real EMQX + Kafka — no mocks.
//
// Boots the built iot-ingestion, waits for /ready, then publishes to MQTT for a
// unique throwaway vehicle: one non-JSON message, one schema-invalid telemetry,
// one valid telemetry and one valid status. Consumes vehicle.telemetry +
// vehicle.status and asserts exactly the two valid messages arrive, wrapped in
// a valid EventEnvelope with key = vehicleId. Finally SIGTERMs the service and
// checks it exits 0.
//
// Requires: `docker compose up -d kafka kafka-init emqx` and a build
// (`npm run typecheck`). Uses host ports from docker-compose.yml defaults.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Kafka, logLevel } from 'kafkajs';
import mqtt from 'mqtt';
import {
  eventTypes,
  kafkaTopics,
  mqttTopics,
  parseEventEnvelope,
  statusPayloadSchema,
  telemetryPayloadSchema,
} from '@iiot/events';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3001;
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const READY_TIMEOUT_MS = 30000;
const RECEIVE_TIMEOUT_MS = 15000;
// Extra wait after the valid messages arrive, to catch an invalid one leaking through.
const SETTLE_MS = 1500;

const factoryId = 'smoke-factory';
const vehicleId = `smoke-${randomUUID()}`;
const now = () => new Date().toISOString();

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

const entry = path.join(ROOT, 'services', 'iot-ingestion', 'dist', 'index.js');
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
  console.error(`FAIL port ${PORT} already in use — stop the running iot-ingestion first`);
  process.exit(1);
}

const service = spawn(process.execPath, ['dist/index.js'], {
  cwd: path.dirname(path.dirname(entry)),
  env: { ...process.env, PORT: String(PORT), MQTT_URL, KAFKA_BROKERS, LOG_LEVEL: 'warn' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serviceLog = '';
service.stdout.on('data', (c) => (serviceLog += c));
service.stderr.on('data', (c) => (serviceLog += c));
const serviceExit = new Promise((resolve) => service.once('exit', (code) => resolve(code)));

const kafka = new Kafka({
  clientId: 'smoke-ingestion',
  brokers: KAFKA_BROKERS.split(','),
  logLevel: logLevel.ERROR,
});
const consumer = kafka.consumer({ groupId: `smoke-ingestion-${randomUUID()}` });
let publisher;

try {
  const ready = await waitForReady(`http://localhost:${PORT}/ready`, READY_TIMEOUT_MS);
  check('/ready 200 with mqtt+kafka up', ready.body?.checks?.mqtt && ready.body?.checks?.kafka);

  // Collect only this run's vehicle (fromBeginning + unique vehicleId avoids a
  // race between group join and the first publish).
  const received = [];
  await consumer.connect();
  await consumer.subscribe({
    topics: [kafkaTopics.vehicleTelemetry, kafkaTopics.vehicleStatus],
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (message.key?.toString() !== vehicleId) return;
      received.push({ topic, key: message.key.toString(), value: message.value?.toString() });
    },
  });

  publisher = await mqtt.connectAsync(MQTT_URL, { clientId: `smoke-pub-${randomUUID()}` });
  const pub = (topic, body) => publisher.publishAsync(topic, body, { qos: 1 });
  const telemetryTopic = mqttTopics.telemetry(factoryId, vehicleId);
  const statusTopic = mqttTopics.status(factoryId, vehicleId);

  await pub(telemetryTopic, 'not json {');
  await pub(
    telemetryTopic,
    JSON.stringify({ timestamp: now(), x: 1, y: 2, speed: 1, battery: 150, temperature: 30 }),
  );
  const telemetry = {
    timestamp: now(),
    x: 12.5,
    y: 7.25,
    speed: 1.4,
    battery: 88,
    temperature: 31,
  };
  await pub(telemetryTopic, JSON.stringify(telemetry));
  const status = { timestamp: now(), status: 'moving' };
  await pub(statusTopic, JSON.stringify(status));

  const deadline = Date.now() + RECEIVE_TIMEOUT_MS;
  while (received.length < 2 && Date.now() < deadline) await sleep(100);
  await sleep(SETTLE_MS);

  check(
    'exactly 2 messages forwarded (2 invalid dropped)',
    received.length === 2,
    `got ${received.length}`,
  );

  const byTopic = Object.fromEntries(received.map((m) => [m.topic, m]));
  for (const [kafkaTopic, schema, eventType, sent] of [
    [kafkaTopics.vehicleTelemetry, telemetryPayloadSchema, eventTypes.telemetryReported, telemetry],
    [kafkaTopics.vehicleStatus, statusPayloadSchema, eventTypes.statusReported, status],
  ]) {
    const msg = byTopic[kafkaTopic];
    if (!msg) {
      check(`${kafkaTopic} received`, false);
      continue;
    }
    try {
      const env = parseEventEnvelope(JSON.parse(msg.value), schema);
      const ok =
        msg.key === vehicleId &&
        env.vehicleId === vehicleId &&
        env.factoryId === factoryId &&
        env.eventType === eventType &&
        env.schemaVersion === 1 &&
        JSON.stringify(env.payload) === JSON.stringify(sent);
      check(`${kafkaTopic} envelope valid, key=vehicleId, payload intact`, ok, ok ? '' : msg.value);
    } catch (err) {
      check(`${kafkaTopic} envelope parses`, false, err.message);
    }
  }
} catch (err) {
  check('smoke run', false, err.message);
} finally {
  await publisher?.endAsync().catch(() => {});
  await consumer.disconnect().catch(() => {});
  service.kill('SIGTERM');
  const code = await Promise.race([serviceExit, sleep(12000).then(() => 'timeout')]);
  if (code === 'timeout') service.kill('SIGKILL');
  check('graceful shutdown (exit 0)', code === 0, `exit=${code}`);
}

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.log(`\nservice log:\n${serviceLog.trim()}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
