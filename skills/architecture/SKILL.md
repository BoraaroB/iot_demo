---
name: architecture
description: System topology, service boundaries, data flow, protected decisions. Read before adding a service, changing a data path, or touching cross-service contracts.
---

# Architecture

## Purpose

Keep the system's shape consistent across 11 phases built incrementally by different sessions. This is the
single place that states what the topology *is* and why — everything else (services, docs, skills) must
agree with it.

## Topology (protected)

The topology diagram lives only in `CLAUDE.md` "Architecture" (single source of truth — not copied here).
What each node is allowed to do:

- `iot-ingestion` is the *only* service that speaks MQTT. It bridges MQTT → Kafka and does nothing else
  (no business logic, no DB writes).
- `telemetry`, `vehicle`, `alert` are independent Kafka consumers, each owning its own datastore. They
  never call each other directly or share tables.
- `realtime` consumes Kafka and pushes to browsers over WebSocket. It holds no durable state.
- `api-gateway` is the only HTTP entrypoint for clients; it proxies/aggregates to the domain services, it
  does not implement domain logic itself.
- `apps/web` (Next.js) talks to `api-gateway` over HTTP for reads/writes and to `realtime` over WebSocket
  for live updates. It never talks to Kafka, MQTT, or a database directly.

## Service boundaries

Services never import another service's source (`services/x` never imports from `services/y`). The only
legal communication paths are HTTP, Kafka, and MQTT. Code shared across services goes in `packages/`, not
copy-pasted.

## Never swap (requires explicit user approval to change)

Kafka→Redis, MQTT→HTTP, TimescaleDB→PostgreSQL, WebSocket→polling, microservices→monolith, Next.js→other.

## Avoid premature complexity

No Kubernetes, service mesh, event sourcing, CQRS, schema registry, multi-region — until a later phase's
acceptance criteria actually requires it. Phase numbers are in `PROGRESS.md`.

## Anti-patterns

- Adding a new service without updating this file, `docs/repository-layout.md`, and the topology diagram.
- A domain service (`telemetry`/`vehicle`/`alert`) reading another domain service's table directly instead
  of consuming its own Kafka topic.
- `api-gateway` growing business logic instead of delegating to domain services.
- Introducing a new cross-service dependency (e.g. gRPC, a shared DB) without flagging it as an
  architectural change per `CLAUDE.md` ("Stop and ask" rule).

## Verification

No dedicated command — architecture conformance is reviewed by inspection against this file and
`docs/repository-layout.md` during code review of each phase.

## Related

`docs/repository-layout.md` (directory layout, per-service requirements), `docs/contracts.md` (topics,
event envelope), [[kafka]], [[mqtt]], [[websocket]], [[database]].
