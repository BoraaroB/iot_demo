---
name: simulator
description: Fake-vehicle telemetry/mission generator conventions. Read before implementing services/simulator's publish logic (Phase 1 basic, Phase 5 realistic).
---

# Simulator

## Purpose

`simulator` stands in for real autonomous vehicles so the rest of the pipeline (MQTT → Kafka → DBs →
WebSocket → UI) can be built and load-tested without physical hardware. It is a normal service in this
repo, not a throwaway script — same skeleton conventions as the rest ([[backend]]).

## Current state (as of step 1.4)

Basic publisher (port 3006): one MQTT client (`mqtt@5`) publishes for `SIM_VEHICLE_COUNT` vehicles
(`<SIM_VEHICLE_ID_PREFIX>-0001` ...) in `SIM_FACTORY_ID`, telemetry every `SIM_PUBLISH_INTERVAL_MS` (QoS 1),
status on change + after every (re)connect. `src/vehicle.ts` is a deterministic model (circular loop,
acceleration, battery drain, charge in place 20 → 95 %, temperature follows load); `src/simulation.ts` owns
the MQTT client and per-vehicle timers (offset across the interval, ticks skipped while offline — never
buffered). `/ready` reports `mqtt`. Run: `SIM_VEHICLE_COUNT=N npm run simulate`. Remaining work: realistic movement, missions, and command handling are explicitly deferred to Phase 5
("Realistic simulator, missions, commands") — don't build mission logic while Phase 1 is in progress.

## Conventions (to apply as it's built)

- Publishes over MQTT only, to `factory/{factoryId}/vehicle/{vehicleId}/telemetry` and `/status` (see
  [[mqtt]]) — it is a normal MQTT client, not a shortcut that writes to Kafka or the DB directly.
- Payload shapes must match whatever `iot-ingestion` expects to validate (`packages/types` /
  `packages/validation`) — don't invent a simulator-only payload shape that diverges from the real
  contract, the whole point is exercising the real path.
- Configurable vehicle/factory count and publish rate (env-driven, Zod-validated like every other service)
  so it can later double as the driver for [[load-testing]] — but don't build load-test-specific tooling
  into it ahead of Phase 10; keep Phase 1–5 scope focused on correctness, not throughput.
- Phase 5 adds "missions" (a sequence of waypoints/behavior) and "commands" (consuming
  `factory/.../vehicle/.../command` — see [[mqtt]]) — out of scope until then.

## Anti-patterns

- Bypassing MQTT to push synthetic data straight into Kafka or a database "for convenience" — that stops
  it from being a useful end-to-end test of the real ingestion path.
- Building mission/command logic before Phase 5, or load-generation tuning before Phase 10.
- Hardcoding factory/vehicle IDs instead of making count and identity configurable.

## Verification

`npm run smoke:simulator` (needs `docker compose up -d emqx`): every vehicle announces status and publishes
schema-valid telemetry with advancing time/position, exit 0 on `SIGTERM`. Once Phase 1's E2E smoke test exists, the simulator is what drives
it.

## Related

[[mqtt]], [[backend]], [[load-testing]] (later reuse).
