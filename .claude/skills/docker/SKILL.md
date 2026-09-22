---
name: docker
description: Dockerfile template, docker-compose infra, and known image gotchas. Read before editing a service Dockerfile or docker-compose.yml.
---

# Docker

## Purpose

Every service ships as a multi-stage, non-root container; local infra runs via one `docker-compose.yml`.
Keep both consistent so `docker build` and `docker compose up` stay reliable across all 7 services + 6
infra containers.

## Service Dockerfiles

One template, not 7 hand-written files: `infrastructure/docker/Dockerfile.service.template` +
`generate-dockerfiles.sh` generate `services/<name>/Dockerfile` for all 7 (`__SERVICE__`/`__PORT__`
substitution). **Re-run the script after editing the template — never hand-edit a generated Dockerfile**,
it will be overwritten and drift silently otherwise.

- 4 stages: `deps` → `build` → `prod-deps` → `runtime`.
- Non-root `iiot` user in the runtime stage.
- Base image `node:24-alpine` (verified present via `docker manifest inspect`) — fine while no service has
  native (non-pure-JS) deps; revisit per-service if one gains a native dependency (e.g. anything requiring
  `node-gyp`).
- `HEALTHCHECK` uses Node's built-in `fetch` (`node -e "fetch(...)"`) against `/health` — not
  `curl`/`wget`, neither is installed on `node:24-alpine` by default and adding one just grows the image.
- npm workspaces gotcha: `node_modules/@iiot/<pkg>` are symlinks to `../../packages/<pkg>`. The runtime
  stage must carry the pruned `node_modules` (from `prod-deps`, `npm ci --omit=dev`) **and** each
  `packages/<pkg>/package.json` + `dist/` at their real paths, or the symlinks resolve to nothing.
- Split Dockerfiles per service (instead of the shared template) once a service's dependency set actually
  diverges from the others (e.g. `kafkajs`/`pg`/`mqtt` landing at different times from Phase 1 on) — not
  before.

## docker-compose.yml (local infra)

Kafka (`apache/kafka:4.3.1`, KRaft, single-node combined broker+controller), Postgres (`postgres:18-alpine`,
`vehicle_db`+`alert_db`), TimescaleDB (`timescale/timescaledb:2.24.0-pg18-oss`, `telemetry_db`), Redis
(`redis:8-alpine`), EMQX (`emqx/emqx:5.10.5`), Kafka UI (`ghcr.io/kafbat/kafka-ui:v1.5.0` — the maintained
fork, not the unmaintained `provectuslabs/kafka-ui`). All 6 have healthchecks and bind-mount persistence
under `.data/` (gitignored). Config via `.env` (see `.env.example`) — never commit real values.

Per-container healthcheck tool (confirmed present in each image, don't assume): Kafka →
`kafka-broker-api-versions.sh`, Postgres/TimescaleDB → `pg_isready`, Redis → `redis-cli ping`, EMQX →
`emqx ctl status`, Kafka UI → `wget --spider` (Alpine base has `wget`, not `curl`).

## Known gotchas

- Host ports shifted for TimescaleDB (5434) and Redis (6380) to dodge unrelated containers already running
  on this dev machine — see [[database]] for detail. Always verify with `docker port <container>` after
  bring-up; `docker compose ps` "healthy" does not guarantee the host port actually published (reproduced:
  Redis silently didn't).
- `postgres:18-alpine` volume path changed to `/var/lib/postgresql` (see [[database]]).

## Anti-patterns

- Hand-editing a generated service Dockerfile instead of the template.
- Adding a package/tool to an image "just in case" instead of only what the runtime needs.
- Trusting `docker compose ps` health status as proof of host-port reachability.

## Verification

`docker build -f services/<name>/Dockerfile -t iiot/<name>:dev .` per changed service; `docker compose
config` (syntax) + `docker compose up -d` + `docker compose ps` for compose changes; `docker port
<container>` to confirm bindings; remove test images/containers after verifying.

## Related

[[backend]], [[database]], [[deployment]].
