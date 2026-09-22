---
name: kafka
description: Topics, event envelope, partitioning, consumer conventions for the Kafka backbone. Read before touching iot-ingestion, telemetry, vehicle, alert, or realtime's Kafka code.
---

# Kafka

## Purpose

Kafka is the backbone between ingestion and the three domain consumers (`telemetry`, `vehicle`, `alert`)
plus `realtime`. Getting topic/partition/idempotency conventions right early avoids a schema-registry-style
retrofit later (which `CLAUDE.md` explicitly says to avoid).

## Current state (as of step 1.2)

Broker is up in `docker-compose.yml` (`apache/kafka:4.3.1`, KRaft mode, single-node combined
broker+controller) with `auto.create.topics.enable=false`. The six contract topics are created by the
one-shot `kafka-init` compose service (`infrastructure/kafka/create-topics.sh`, idempotent):
`vehicle.telemetry`/`vehicle.location` 6 partitions, the rest 3, RF 1. Adding a topic means updating
`kafkaTopics` in `packages/events/src/topics.ts`, `create-topics.sh` and `docs/contracts.md` together —
`npm run smoke:kafka` fails on drift. Client library: `kafkajs` (see `PROGRESS.md` Decisions for the
maintenance trade-off).

First producer: `iot-ingestion` (`services/iot-ingestion/src/kafka.ts`) — `acks: -1`, explicit
`Partitioners.DefaultPartitioner` (murmur2, Java-compatible), `allowAutoTopicCreation: false`, key =
`vehicleId`, in-flight sends capped by `INGEST_MAX_IN_FLIGHT` (excess dropped, not buffered). Env:
`KAFKA_BROKERS` (host `localhost:9092`; inside compose **must** be `kafka:19092` — the host listener
advertises `localhost`, which fails from a container), `KAFKA_CLIENT_ID`. No consumers yet (step 1.3).

kafkajs gotchas (verified): the producer `DISCONNECT` event fires only on explicit `disconnect()`, not on
broker loss — readiness uses a periodic `admin.describeCluster()` probe instead. On Node 24, kafkajs emits
a harmless `TimeoutNegativeWarning` from `RequestQueue.scheduleCheckPendingRequests` (negative delay
clamped to 1 ms).

## Topics (`docs/contracts.md`)

`vehicle.telemetry`, `vehicle.location`, `vehicle.status`, `vehicle.alert`, `vehicle.mission`,
`vehicle.command`. Key = `vehicleId` (guarantees per-vehicle ordering within a partition).

## Event envelope (`docs/contracts.md`)

```ts
interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  timestamp: string;
  vehicleId: string;
  factoryId: string;
  schemaVersion: number;
  payload: TPayload;
}
```

Add fields via `schemaVersion` bump, not silently. Defined in `packages/types` + created/parsed via Zod in
`packages/events`.

## Rules

- Producers: only `iot-ingestion` produces from the MQTT bridge. Other services may produce derived events
  (e.g. `alert` producing `vehicle.alert`) but always through `packages/events`' envelope helpers, never
  hand-built objects.
- Consumers must be idempotent (dedupe via `eventId`) and tolerate duplicates, delays, and cross-partition
  reordering — never assume global ordering across different `vehicleId`s.
- One consumer group per service (`telemetry`, `vehicle`, `alert`, `realtime` each consume independently —
  Kafka fans out to all of them, they don't compete for messages).
- No schema registry (explicit `CLAUDE.md` "avoid premature complexity" — envelope versioning via
  `schemaVersion` is enough at this scale).

## Anti-patterns

- Consuming another domain's topic to avoid a Kafka round-trip (e.g. `alert` reading `vehicle.telemetry`
  directly from a shared table instead of consuming the topic).
- Skipping the envelope and producing a raw payload.
- Assuming exactly-once delivery/ordering without verifying — `CLAUDE.md` bans unverified claims like
  "exactly-once".
- Swapping Kafka for Redis pub/sub or SQS — protected architectural decision.

## Verification

Topics: `npm run smoke:kafka` (needs `docker compose up -d kafka kafka-init` and a built
`packages/events`). Once Phase 1 wires producers/consumers: the E2E smoke test (MQTT → Kafka → TimescaleDB) per `CLAUDE.md`
Testing table. Topic existence/config can be checked with `docker exec iiot-kafka
/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list` (path confirmed present on the
`apache/kafka:4.3.1` image).

## Related

[[mqtt]] (producer side), [[architecture]], `docs/contracts.md`.
