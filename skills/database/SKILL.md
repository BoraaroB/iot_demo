---
name: database
description: Postgres/TimescaleDB/Redis ownership, schemas, and known Docker gotchas. Read before writing a migration or a query in telemetry, vehicle, or alert.
---

# Database

## Purpose

Three separate datastores, one per data shape — no shared schema, no cross-service joins. Getting
ownership right avoids the "shared database" anti-pattern that would defeat the point of separate
services (see [[architecture]]).

## Ownership

- `telemetry` service → TimescaleDB (`telemetry_db`) — high-volume time-series vehicle telemetry.
- `vehicle` service → PostgreSQL (`vehicle_db`) for durable state + Redis for runtime/ephemeral state
  (e.g. last-known position cache).
- `alert` service → PostgreSQL (`alert_db`) + Redis.
- One Postgres instance hosts both `vehicle_db` and `alert_db` (two logical databases, not two
  containers) — simplest option at demo scale; `alert_db` is created by
  `infrastructure/postgres/init/01-create-databases.sh` since `POSTGRES_DB` only creates one DB by default.

## Current state (as of Phase 0)

Compose brings up all three datastores with healthchecks; no schema/migrations exist yet — that starts in
Phase 1 (telemetry table) and Phase 3 (vehicle domain model). No ORM/migration tool has been chosen yet —
decide and record it in `PROGRESS.md` Decisions when the first migration is written, don't assume one.

## Images & ports (verified via `docker manifest inspect` before use — see `PROGRESS.md` Decisions)

Postgres `postgres:18-alpine` (`POSTGRES_PORT`, default 5432), TimescaleDB
`timescale/timescaledb:2.24.0-pg18-oss` (`TIMESCALEDB_PORT`, shifted to 5434 locally — see gotchas), Redis
`redis:8-alpine` (`REDIS_PORT`, shifted to 6380 locally).

## Known gotchas (reproduced, not guessed — don't rediscover these)

- `postgres:18-alpine`'s data volume mount point is `/var/lib/postgresql`, **not**
  `/var/lib/postgresql/data` — the official image now manages a versioned subdirectory itself; the old path
  breaks container startup with a `pg_ctlcluster` error. `timescale/timescaledb` uses its own entrypoint and
  still wants `/var/lib/postgresql/data` — the two images are not symmetric here.
- TimescaleDB auto-runs `CREATE EXTENSION IF NOT EXISTS timescaledb` against `POSTGRES_DB` on init — no
  custom init script needed for the extension itself.
- Redis/TimescaleDB host ports were shifted (6380/5434) to avoid colliding with unrelated pre-existing
  containers on this dev machine (`ft-redis`, `ft-postgres`) — Docker silently left Redis's container
  running without publishing the port on conflict, no error. Always confirm with `docker port <container>`
  after bring-up, don't trust `docker compose ps` health alone.

## Rules

- No cross-database foreign keys or joins — a service needing another domain's data gets it via that
  service's Kafka topic or HTTP API, not a direct query.
- TimescaleDB tables for telemetry must use hypertables (not plain Postgres tables) to get the
  time-series benefits that justified choosing it over plain PostgreSQL.
- Redis in `vehicle`/`alert` is runtime/cache state, not source of truth — Postgres is authoritative;
  Redis must be reconstructable from Postgres + Kafka replay if lost.

## Anti-patterns

- Adding a table to `vehicle_db` for alert data (or vice versa) instead of giving `alert` its own schema.
- Swapping TimescaleDB for plain PostgreSQL for telemetry — protected architectural decision.
- Treating Redis as durable storage for anything that isn't reconstructable.

## Verification

DB schema changes: migration + the matching DB smoke test (per `CLAUDE.md` Verification table — smoke test
scripts don't exist per-DB yet, add one alongside the first migration). Container health:
`docker compose ps`, `docker exec <container> pg_isready` / `redis-cli ping`.

## Related

[[architecture]], [[kafka]] (source of truth for what gets persisted), `docs/contracts.md`.
