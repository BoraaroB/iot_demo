#!/usr/bin/env node
// Boot smoke test: starts each service's built process and checks /health,
// /ready and the JSON 404 handler, then sends it SIGTERM and confirms it
// exits. Needs no infrastructure: services with real dependencies are pointed
// at unreachable addresses and must report /ready 503 while /health stays 200
// (their happy path is covered by the per-service smoke tests, e.g.
// `npm run smoke:ingestion`).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SERVICES = [
  { name: 'api-gateway', port: 3000 },
  {
    name: 'iot-ingestion',
    port: 3001,
    env: { MQTT_URL: 'mqtt://127.0.0.1:1', KAFKA_BROKERS: '127.0.0.1:1' },
    ready: { status: 503, body: { status: 'unavailable', checks: { mqtt: false, kafka: false } } },
  },
  {
    name: 'telemetry',
    port: 3002,
    env: { DATABASE_URL: 'postgres://smoke@127.0.0.1:1/none', KAFKA_BROKERS: '127.0.0.1:1' },
    ready: { status: 503, body: { status: 'unavailable', checks: { db: false, kafka: false } } },
  },
  { name: 'vehicle', port: 3003 },
  { name: 'alert', port: 3004 },
  { name: 'realtime', port: 3005 },
  {
    name: 'simulator',
    port: 3006,
    env: { MQTT_URL: 'mqtt://127.0.0.1:1' },
    ready: { status: 503, body: { status: 'unavailable', checks: { mqtt: false } } },
  },
];

const START_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out waiting for ${url}${lastErr ? `: ${lastErr.message}` : ''}`);
}

async function expectJson(url, expectedStatus, expectedBody) {
  const res = await fetch(url);
  if (res.status !== expectedStatus) {
    throw new Error(`${url}: expected status ${expectedStatus}, got ${res.status}`);
  }
  if (expectedBody !== undefined) {
    const body = await res.json();
    if (JSON.stringify(body) !== JSON.stringify(expectedBody)) {
      throw new Error(
        `${url}: expected body ${JSON.stringify(expectedBody)}, got ${JSON.stringify(body)}`,
      );
    }
  }
}

const READY_OK = { status: 200, body: { status: 'ok' } };

async function checkService({ name, port, env = {}, ready = READY_OK }) {
  const cwd = path.join(ROOT, 'services', name);
  const entry = path.join(cwd, 'dist', 'index.js');
  if (!existsSync(entry)) {
    return { name, ok: false, error: `${entry} does not exist — run "npm run typecheck" first` };
  }

  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const base = `http://localhost:${port}`;
  let result;
  try {
    await waitForHealth(`${base}/health`, START_TIMEOUT_MS);
    await expectJson(`${base}/health`, 200, { status: 'ok' });
    await expectJson(`${base}/ready`, ready.status, ready.body);
    await expectJson(`${base}/__smoke_not_found__`, 404, { error: 'Not Found' });
    result = { name, ok: true };
  } catch (err) {
    result = {
      name,
      ok: false,
      error: `${err.message}${stderr ? `\n  stderr: ${stderr.trim()}` : ''}`,
    };
  }

  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(3000).then(() => false),
  ]);
  if (!exited) {
    child.kill('SIGKILL');
    if (result.ok) {
      result = { name, ok: false, error: 'did not exit within 3s of SIGTERM (SIGKILLed)' };
    }
  }
  return result;
}

async function main() {
  const results = [];
  for (const service of SERVICES) {
    process.stdout.write(`${service.name} (:${service.port}) ... `);
    const result = await checkService(service);
    results.push(result);
    console.log(result.ok ? 'PASS' : `FAIL\n  ${result.error}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} services passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
