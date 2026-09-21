# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each completed phase is tagged `v0.N.0`.

## [Unreleased]

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

### Notes
- TypeScript pinned to `^6.0.3` (not `7.0.2`) — `typescript-eslint@8.70.0` doesn't yet support TS 7's peer range.
- `tsconfig.base.json` sets `"types": ["node"]` explicitly — needed to work around a reproduced `tsc --build` quirk where Node globals resolved inconsistently across workspace packages without it.
- Services use Express `^5.2.1` (native async error forwarding, no `express-async-errors` needed) and `pino-http@^11.0.0` for request logging.
