---
name: observability
description: Logging today, metrics/tracing later (Phase 8). Read before adding logs to a service or before starting Prometheus/Grafana/OpenTelemetry work.
---

# Observability

## Purpose

Make the running system diagnosable — starting with structured logs (available now), growing to
metrics/dashboards/tracing in Phase 8, without inventing ad hoc logging styles per service in the meantime.

## Current state (as of Phase 0)

Structured logging only, via `@iiot/logger` (Pino wrapper) + `pino-http` request logging on every service.
No metrics, dashboards, or tracing yet — Prometheus, Grafana, and OpenTelemetry are explicitly Phase 8
scope ("Observability", after Alerts and the realistic simulator). Don't add Prometheus client libraries or
OTel instrumentation early; it adds dependencies and surface area with nothing yet built that needs
diagnosing under load.

## Conventions

- All logging goes through `@iiot/logger`, not raw `console.log` — keeps format (JSON) and fields
  (service name, level, timestamps) consistent for later aggregation.
- Log at service boundaries: incoming requests (via `pino-http`), MQTT message received/forwarded, Kafka
  produce/consume, DB writes that fail, graceful shutdown start/complete.
- Errors are logged with enough context to diagnose without reproducing (event IDs, vehicle/factory IDs,
  not just a stack trace) — but never log secrets (env values, credentials).

## Phase 8 scope (when it starts)

- Prometheus: per-service metrics endpoint (request rates/latency, Kafka consumer lag, MQTT connection
  status) — verify the exact client library and version against npm metadata when chosen, don't assume one.
- Grafana: dashboards built against those metrics.
- OpenTelemetry: distributed tracing across the MQTT→Kafka→DB→WS path, so a single vehicle event can be
  followed across service boundaries.

## Anti-patterns

- `console.log`/`console.error` instead of `@iiot/logger`.
- Logging full payloads that may contain sensitive data without review.
- Starting Phase 8 tooling before Phase 8 (no metrics/tracing dependencies added early "just in case").
- Claiming a metric ("handles 10k vehicles", "p99 latency Xms") without an actual measurement — see
  `CLAUDE.md`'s "never claim unverified work" rule and [[load-testing]].

## Verification

Today: manual log inspection during smoke tests / `docker compose logs <service>`. Phase 8+: metrics
endpoint scrape check, Grafana dashboard renders real data, a trace spans the full pipeline for one
synthetic event.

## Related

[[backend]] (logger usage), [[load-testing]] (Phase 8 metrics feed load-test analysis), [[testing]].
