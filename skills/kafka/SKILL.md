---
name: kafka
description: Topics, event envelope, partitioning, consumer conventions for the Kafka backbone. Read before touching iot-ingestion, telemetry, vehicle, alert, or realtime's Kafka code.
---

# Kafka

## Purpose

Kafka is the backbone between ingestion and the three domain consumers (`telemetry`, `vehicle`, `alert`)
plus `realtime`. Getting topic/partition/idempotency conventions right early avoids a schema-registry-style
retrofit later (which `CLAUDE.md` explicitly says to avoid).

## Current state (as of Phase 0)

Broker is up in `docker-compose.yml` (`apache/kafka:4.3.1`, KRaft mode, single-node combined
broker+controller). No topics created yet — deliberately deferred to Phase 1, when producers/consumers
actually exist. Relying on `auto.create.topics.enable` only was for the Phase 0 smoke check
(throwaway `smoke.test` topic); real topics for Phase 1 should be created explicitly (via a startup script
or `kafka-topics.sh`), not left to auto-create, so partition count/replication are deliberate.

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

Once Phase 1 wires producers/consumers: the E2E smoke test (MQTT → Kafka → TimescaleDB) per `CLAUDE.md`
Testing table. Topic existence/config can be checked with `docker exec iiot-kafka
/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list` (path confirmed present on the
`apache/kafka:4.3.1` image).

## Related

[[mqtt]] (producer side), [[architecture]], `docs/contracts.md`.
