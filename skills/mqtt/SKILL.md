---
name: mqtt
description: EMQX broker, topic structure, and the MQTT→Kafka bridge contract. Read before touching iot-ingestion or the simulator's publish side.
---

# MQTT

## Purpose

MQTT is the only protocol vehicles/the simulator speak to the platform. `iot-ingestion` is the single
service allowed to hold an MQTT connection — it bridges to Kafka and does nothing else (see
[[architecture]]).

## Current state (as of Phase 0)

EMQX (`emqx/emqx:5.10.5`) is up in `docker-compose.yml`, dashboard on `EMQX_DASHBOARD_PORT` (18083), MQTT
on `EMQX_MQTT_PORT` (1883). `allow_anonymous` is on the default (no auth configured) — local dev only,
revisit in Phase 7 (auth/RBAC/multi-tenancy). No publishers/subscribers wired yet; that starts in Phase 1.

## Topics (`docs/contracts.md`)

```text
factory/{factoryId}/vehicle/{vehicleId}/telemetry
factory/{factoryId}/vehicle/{vehicleId}/status
factory/{factoryId}/vehicle/{vehicleId}/command
```

- `telemetry`/`status`: vehicle → platform (simulator/vehicle publishes, `iot-ingestion` subscribes).
- `command`: platform → vehicle (`iot-ingestion` or a later command-dispatch path publishes, vehicle
  subscribes) — command topic consumption is a later phase (Phase 5, "missions, commands"), don't build it
  early.

## Rules

- `iot-ingestion` subscribes with a wildcard (`factory/+/vehicle/+/telemetry` etc.), extracts
  `factoryId`/`vehicleId` from the topic string, validates the payload with Zod, wraps it in the
  `EventEnvelope` (`packages/events`), and produces to the matching Kafka topic — 1:1 MQTT topic → Kafka
  topic mapping, no fan-out logic inside the bridge itself.
- Payload validation happens at the MQTT boundary (`iot-ingestion`), not downstream — downstream Kafka
  consumers trust the envelope.
- Use QoS appropriate to the data: telemetry can tolerate at-most-once/at-least-once (idempotent
  consumers handle dupes per [[kafka]]); commands should use at-least-once (QoS 1) since a dropped command
  is a real operational miss.

## Anti-patterns

- Any service other than `iot-ingestion` opening an MQTT connection.
- Business logic (alerting, persistence) living inside the MQTT bridge instead of downstream Kafka
  consumers.
- Swapping MQTT for HTTP polling from vehicles — protected architectural decision.
- Leaving `allow_anonymous` on past local dev / Phase 7.

## Verification

Once Phase 1 wires the bridge: the E2E smoke test (MQTT → Kafka → TimescaleDB) per `CLAUDE.md`. Manual
check: `docker exec iiot-emqx emqx ctl status`, publish via `mosquitto_pub` or the simulator, confirm
`iot-ingestion` logs (Pino) show the received + forwarded event.

## Related

[[kafka]] (consumer side), [[simulator]] (publisher), [[architecture]], `docs/contracts.md`.
