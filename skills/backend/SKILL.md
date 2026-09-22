---
name: backend
description: Node/TypeScript/Express service conventions — structure, config, logging, error handling. Read before touching any services/* or packages/* code.
---

# Backend

## Purpose

Keep the 7 backend services (`api-gateway`, `iot-ingestion`, `telemetry`, `vehicle`, `alert`, `realtime`,
`simulator`) structurally identical where they don't need to differ, so the platform stays maintainable as
each one grows its own domain logic in later phases.

## Stack (as installed — verify against `package.json` before assuming a version)

Node 24, TypeScript `^6.0.3` (strict, no `any`), Express 5.x, Zod, Pino (`pino-http` for request logging).
ESM (`"type": "module"`), `NodeNext` module resolution.

## Conventions

- Every service: `package.json`, `tsconfig.json` (extends root `tsconfig.base.json`, `"composite": true`,
  registered in root `tsconfig.json` `references`), `src/`, `Dockerfile`, Zod-validated env config,
  `/health` (process only) + `/ready` (real dependency checks once the service has dependencies),
  structured logging via `@iiot/logger`, JSON error handler + 404, graceful shutdown on
  `SIGTERM`/`SIGINT`.
- Shared code lives in `packages/{types,events,logger,config}` (private workspace packages, built via
  `tsc --build`, consumed from `dist/` — never import another package's `src/` directly).
- Ports (fixed, Zod-validated `PORT` env default, not hardcoded): `api-gateway` 3000, `iot-ingestion` 3001,
  `telemetry` 3002, `vehicle` 3003, `alert` 3004, `realtime` 3005, `simulator` 3006.
- Express 5 forwards rejected async handler promises to error middleware natively — do not add
  `express-async-errors`, it's redundant.
- Zod v4 API: use `z.uuid()` / `z.iso.datetime()` (top-level functions), not the deprecated
  `.string().uuid()` / `.datetime()` chained methods.

## Rules

- No `any`. No hallucinated APIs/flags/env vars — check the installed package's `.d.ts` or official docs.
- `/ready` must reflect real dependency health once a service gains one (Kafka, Postgres, TimescaleDB,
  Redis, MQTT) — do not leave it as a `/health` alias past the point the dependency is wired in.
- Consumers of Kafka events must be idempotent (dedupe via `eventId`) and tolerate out-of-order delivery —
  see `docs/contracts.md`.

## Anti-patterns

- A service importing another service's `src/` (see [[architecture]] — boundaries are HTTP/Kafka/MQTT
  only).
- Business logic in `api-gateway` instead of the owning domain service.
- Swallowing errors instead of logging + propagating to the JSON error handler.
- Growing `/ready` into a slow, unbounded dependency probe — keep checks fast and bounded.

## Verification

`npm run typecheck` (root, `tsc --build` across all project references), `npm run lint`,
`npm run format:check`, `npm run smoke` (boots each service, checks `/health`/`/ready`/404).

## Related

[[architecture]], [[testing]], [[database]], [[kafka]], [[mqtt]], `docs/repository-layout.md`,
`docs/api-versioning.md`.
