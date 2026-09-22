# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each completed phase is tagged `v0.N.0`.

## [Unreleased]

### Changed
- `skills/architecture/SKILL.md`: removed the duplicated topology diagram; it now references `CLAUDE.md` "Architecture" as the single source of truth.

## [0.1.0] - 2026-09-22

### Added
- Git repository (`main` branch), `.gitignore`.
- `CLAUDE.md` (condensed agent rules), `PROGRESS.md` (progress tracker), `CHANGELOG.md`.
- `instruction_plan.md` kept as the full original specification.
- npm workspaces root (`apps/*`, `services/*`, `packages/*`), `tsconfig.base.json` (strict, `NodeNext`), ESLint 10 flat config (`eslint.config.mjs`, `typescript-eslint`), Prettier, `.nvmrc` (Node 24).
- `packages/types`: `EventEnvelope<TPayload>` + id type aliases (`VehicleId`, `FactoryId`, `OrganizationId`, `ZoneId`).
- `packages/events`: MQTT/Kafka topic constants (`mqttTopics`, `kafkaTopics`), `createEventEnvelope`/`parseEventEnvelope` (Zod-validated).
- `packages/logger`: `createLogger(service)` — structured Pino logger, redacts secrets, pretty-prints outside production.
- `packages/config`: `loadEnv(schema)` — Zod-validated `process.env` loading with a `baseEnvSchema` (`NODE_ENV`, `LOG_LEVEL`) services extend.
- Root `tsconfig.json` (TS project references) + `npm run typecheck` (`tsc --build`).
- `services/{api-gateway,iot-ingestion,telemetry,vehicle,alert,realtime,simulator}`: skeleton Express apps with `/health` (process only), `/ready` (placeholder — mirrors `/health` until each service has a real dependency to check), `pino-http` structured request logging, JSON 404 + error-handling middleware, Zod-validated env config (`@iiot/config`'s `baseEnvSchema` + `PORT`), and graceful shutdown on `SIGTERM`/`SIGINT`. Each depends on `@iiot/{types,events,logger,config}` and is registered in the root `tsconfig.json` project references.
- Multi-stage `Dockerfile` for all 7 services (`node:24-alpine`; `deps` → `build` (`tsc --build`) → `prod-deps` (`npm ci --omit=dev`) → `runtime`), non-root `iiot` user, `EXPOSE`/`HEALTHCHECK` hitting `/health` via Node's built-in `fetch` (no curl/wget in the image). Generated from `infrastructure/docker/Dockerfile.service.template` via `infrastructure/docker/generate-dockerfiles.sh` (7 services currently share identical dependency sets — edit the template, not the per-service copies). `.dockerignore` added at repo root.
- `docker-compose.yml`: local infra — Kafka (`apache/kafka:4.3.1`, KRaft combined mode, single node), PostgreSQL (`postgres:18-alpine`, `vehicle_db` + `alert_db` via `infrastructure/postgres/init/01-create-databases.sh`), TimescaleDB (`timescale/timescaledb:2.24.0-pg18-oss`, `telemetry_db`, `timescaledb` extension auto-created by the image), Redis (`redis:8-alpine`), EMQX (`emqx/emqx:5.10.5`), Kafka UI (`ghcr.io/kafbat/kafka-ui:v1.5.0`, the maintained fork of the archived `provectuslabs/kafka-ui`). All 6 services have Docker healthchecks and bind-mount persistence under `.data/` (gitignored). `.env.example` added with placeholder credentials and host-port overrides.
- `npm run smoke` (`scripts/smoke.mjs`): starts each of the 7 services' built `dist/index.js` on its assigned port, polls `/health` until it responds, asserts `/health` and `/ready` both return `200 {"status":"ok"}` and an unknown route returns the JSON `404` handler, then sends `SIGTERM` and confirms the process exits (falls back to `SIGKILL` after 3s). No Kafka/MQTT/DB involved — those aren't wired into any service yet.
- `docs/repository-layout.md`, `docs/contracts.md`, `docs/api-versioning.md`, `docs/git-workflow.md`: moved out of `CLAUDE.md` (139 → 89 lines), which now links to them one line each.
- `skills/` (14 domain skills, per `instruction_plan.md` §29): `architecture`, `backend`, `frontend`, `kafka`, `mqtt`, `websocket`, `database`, `docker`, `simulator`, `testing`, `observability`, `security`, `load-testing`, `deployment` — each `skills/<domain>/SKILL.md` states purpose, current implementation status, conventions, rules, anti-patterns, and verification steps specific to this repo (not generic filler), cross-linked via `[[name]]` references and to the relevant `docs/*.md`.

### Fixed
- `docker-compose.yml` Prettier formatting (long `healthcheck.test` array was unwrapped).

### Notes
- TypeScript pinned to `^6.0.3` (not `7.0.2`) — `typescript-eslint@8.70.0` doesn't yet support TS 7's peer range.
- `tsconfig.base.json` sets `"types": ["node"]` explicitly — needed to work around a reproduced `tsc --build` quirk where Node globals resolved inconsistently across workspace packages without it.
- Services use Express `^5.2.1` (native async error forwarding, no `express-async-errors` needed) and `pino-http@^11.0.0` for request logging.
- `docker-compose.yml` host ports for TimescaleDB (`5434`) and Redis (`6380`) are shifted off their defaults (`5432`+1, `6379`+1) — this machine already had unrelated containers (`ft-postgres`, `ft-redis`) bound to `5433`/`6379`. Override via `.env` if these still collide locally.
- `postgres:18-alpine` changed its data volume convention: mount `/var/lib/postgresql` (the image manages a versioned subdirectory itself), not `/var/lib/postgresql/data` as in `postgres:17` and earlier — mounting the old path errors out with a `pg_ctlcluster`-compatibility message. `timescale/timescaledb` (not `docker-library/postgres`-derived) is unaffected and still uses `/var/lib/postgresql/data`.
- Phase 0 acceptance criteria (`instruction_plan.md` §32) verified end-to-end: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run smoke` (7/7 services), `docker build` for all 7 services, `docker compose up` (all 6 infra services healthy, host ports confirmed bound via `docker port`), no secrets committed (only `.env.example`, gitignored `.env*`). Tagged `v0.1.0`.
