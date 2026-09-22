#!/usr/bin/env node
// Kafka topic smoke test: asserts the topics that actually exist on the running
// broker match the contract in `@iiot/events` (`kafkaTopics`) — every contract
// topic exists, and no unexpected `vehicle.*` topic exists (e.g. a typo that
// slipped past before auto-create was disabled).
//
// Requires: `docker compose up -d kafka kafka-init` and a built `packages/events`
// (`npm run typecheck`). Uses the real broker via `docker exec` — no mocking.

import { execFileSync } from 'node:child_process';
import { kafkaTopics } from '@iiot/events';

const CONTAINER = process.env.KAFKA_CONTAINER ?? 'iiot-kafka';

function describeTopics() {
  const out = execFileSync(
    'docker',
    [
      'exec',
      CONTAINER,
      '/opt/kafka/bin/kafka-topics.sh',
      '--bootstrap-server',
      'localhost:9092',
      '--describe',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Summary lines look like: "Topic: vehicle.telemetry\tTopicId: ...\tPartitionCount: 6\t..."
  const topics = new Map();
  for (const line of out.split('\n')) {
    const m = /^Topic: (\S+)\s.*PartitionCount: (\d+)/.exec(line);
    if (m) topics.set(m[1], Number(m[2]));
  }
  return topics;
}

let actual;
try {
  actual = describeTopics();
} catch (err) {
  console.error(`FAIL could not describe topics via container "${CONTAINER}": ${err.message}`);
  process.exit(1);
}

const expected = Object.values(kafkaTopics);
const failures = [];

for (const topic of expected) {
  if (actual.has(topic)) {
    console.log(`PASS ${topic} exists (partitions=${actual.get(topic)})`);
  } else {
    failures.push(`${topic} missing on broker`);
  }
}

for (const topic of actual.keys()) {
  if (topic.startsWith('vehicle.') && !expected.includes(topic)) {
    failures.push(`${topic} exists on broker but is not in @iiot/events kafkaTopics`);
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(
  `OK ${expected.length}/${expected.length} contract topics present, no unexpected vehicle.* topics`,
);
