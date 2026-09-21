# PROGRESS

> Single source of truth for project progress. Read this first at the start of every session.
> Update it at the end of every step, in the same commit as the code.

## Current position

- **Phase:** 0 — Bootstrap
- **Step:** 0.5 done (multi-stage, non-root Dockerfiles for all 7 services)
- **Branch:** `main`
- **Last tag:** none
- **Next step:** 0.6 — `docker-compose.yml` (Kafka KRaft, Postgres, TimescaleDB, Redis, EMQX, Kafka UI)

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` not started

## Phases

- [~] **Phase 0 — Bootstrap** → `v0.1.0`
  - [x] 0.1 git init, `.gitignore`, `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md`
  - [x] 0.2 npm workspaces root, shared TS config, lint + format scripts (typecheck script deferred to 0.3 — no `.ts` files exist yet)
  - [x] 0.3 `packages/` — types (EventEnvelope + id aliases), events (topics + envelope create/parse via Zod), logger (Pino wrapper), config (env loader via Zod). Root `tsconfig.json` (project references) + `typecheck` script added.
  - [x] 0.4 service skeletons (7): `api-gateway`(3000), `iot-ingestion`(3001), `telemetry`(3002), `vehicle`(3003), `alert`(3004), `realtime`(3005), `simulator`(3006). Each: Express app, `/health` (process only), `/ready` (mirrors `/health` for now — no dependencies wired yet), `pino-http` request logging via `@iiot/logger`, JSON error handler + 404, Zod env schema (`@iiot/config`'s `baseEnvSchema` + `PORT`), graceful shutdown on `SIGTERM`/`SIGINT`. All depend on `@iiot/{types,events,logger,config}`; only `logger`+`config` are imported so far (`types`/`events` wired in when Kafka/MQTT land in Phase 1).
  - [x] 0.5 Dockerfiles (multi-stage, non-root): `deps` → `build` → `prod-deps` → `runtime`, non-root `iiot` user, `HEALTHCHECK` against `/health`. One template (`infrastructure/docker/Dockerfile.service.template`) generates all 7 (`generate-dockerfiles.sh`) since dependency sets are currently identical across services.
  - [ ] 0.6 `docker-compose.yml` — Kafka (KRaft), Postgres, TimescaleDB, Redis, EMQX, Kafka UI
  - [ ] 0.7 `npm run smoke` (health/ready of all services)
  - [ ] 0.8 `docs/` (only what exists) + trim `CLAUDE.md` to ~80–90 lines: move Git/API versioning, Contracts and Repository layout into `docs/` / `README.md`, keep one-line links
  - [ ] 0.9 `skills/` (14 short, project-specific skills)
  - [ ] 0.10 full verification → tag `v0.1.0`
- [ ] **Phase 1 — Telemetry pipeline E2E** (simulator → MQTT → ingestion → Kafka → telemetry → TimescaleDB) → `v0.2.0`
- [ ] **Phase 2 — Realtime + first dashboard** (WebSocket, Next.js live map) → `v0.3.0`
- [ ] **Phase 3 — Domain model, Vehicle service, API Gateway `/api/v1`** → `v0.4.0`
- [ ] **Phase 4 — Alerts** → `v0.5.0`
- [ ] **Phase 5 — Realistic simulator, missions, commands** → `v0.6.0`
- [ ] **Phase 6 — Historical telemetry + charts** → `v0.7.0`
- [ ] **Phase 7 — Auth, RBAC, multi-tenancy** → `v0.8.0`
- [ ] **Phase 8 — Observability** → `v0.9.0`
- [ ] **Phase 9 — Tests + CI** → `v0.10.0`
- [ ] **Phase 10 — Load testing** → `v0.11.0`
- [ ] **Phase 11 — Hetzner deployment** → `v1.0.0`

## Last verification

| Date | Commands | Result |
|---|---|---|
| 2026-09-21 | `git init -b main` | PASS |
| 2026-09-21 | `npm install`, `npm run lint`, `npm run format:check`, `npx tsc --version` | PASS |
| 2026-09-21 | `npm run typecheck`, `npm run lint`, `npm run format:check`, runtime check via `tsx` (logger/config/events exercised end-to-end) | PASS |
| 2026-09-21 | `npm run typecheck`, `npm run lint`, `npm run format:check` (all 7 services); runtime: built + ran `api-gateway` and `iot-ingestion`, curled `/health`, `/ready`, an unknown route (404 JSON), verified `pino-http` request logs, then sent `SIGTERM` and confirmed graceful shutdown log + connection refused after | PASS |
| 2026-09-21 | `docker build -f services/<name>/Dockerfile -t iiot/<name>:dev .` for all 7 services (PASS, ~176MB each); ran `api-gateway` and `vehicle` containers, curled `/health` + `/ready` (200 `{"status":"ok"}`), `docker exec ... whoami` → `iiot` (non-root confirmed), `docker inspect --format='{{json .State.Health}}'` → `"healthy"` after `start-period`; test images/containers removed after verification | PASS |

## Environment (verified 2026-09-21)

- Node `v24.18.0`, npm `11.16.0`, Docker `29.4.0`, Docker Compose `v5.1.1`. pnpm not installed.

## Decisions

- 2026-09-21: Single main agent. Subagents only when the user asks or for truly independent work (skills writing, code review, frontend/backend in separate worktrees after Phase 2 contracts are stable).
- 2026-09-21: **TypeScript pinned to `^6.0.3`, not the newest `7.0.2`.** TS 7 (native/Go-ported compiler) shipped ~2026-07 and `typescript-eslint@8.70.0`'s peer range is still `<6.1.0` — installing TS 7 breaks `npm install` (ERESOLVE). Revisit once typescript-eslint supports TS 7.
- 2026-09-21: ESLint flat config lives in `eslint.config.mjs` (forced ESM via extension, independent of root `package.json` `"type"`), using the unified `typescript-eslint` package + `projectService: true` for type-aware linting.
- 2026-09-21: **TS project references convention** — every future `packages/*`, `services/*`, `apps/*` gets its own `tsconfig.json` extending `../../tsconfig.base.json` with `"composite": true`. The root `tsconfig.json` (solution file, `"files": []` + `"references": [...]`) and the root `typecheck` script (`tsc --build tsconfig.json`) are created in step 0.3 alongside the first real package — `tsc` errors (`TS18002`/`TS18003`) if it has zero inputs, so an empty solution file can't exist before then.
- 2026-09-21: **`tsconfig.base.json` sets `"types": ["node"]` explicitly.** Without it, `tsc --build` non-deterministically failed to resolve Node globals (`process`, `node:crypto`) in some workspace packages (`packages/config`, `packages/events`) but not others (`packages/logger`, whose `pino` import transitively pulled in `@types/node` via its own `.d.ts`) — a real, reproduced TS auto-`@types`-inclusion quirk in this composite-project setup, not a guess. Explicit `"types"` is standard practice for monorepos for exactly this reason.
- 2026-09-21: Package naming: `@iiot/{types,events,logger,config}`, all `private: true` workspace packages, ESM (`"type": "module"`), built via `tsc --build` (composite) — `main`/`types` point at `dist/`, so services must consume the built output, not `src/` directly.
- 2026-09-21: **Service HTTP stack: Express 5 + `pino-http` (no `express-async-errors`)** — Express 5.2.1 forwards rejected async handler promises to error middleware natively, so the extra package used with Express 4 is unnecessary. `pino-http@11.0.0` is a CJS package with no `"exports"` map; confirmed (by extracting the published tarball) it statically assigns `module.exports.pinoHttp`, so the named ESM import `import { pinoHttp } from 'pino-http'` resolves correctly under `NodeNext` + Node's CJS/ESM interop — not assumed from training data.
- 2026-09-21: **Service ports (fixed, not yet in `docker-compose.yml`):** `api-gateway` 3000, `iot-ingestion` 3001, `telemetry` 3002, `vehicle` 3003, `alert` 3004, `realtime` 3005, `simulator` 3006. Each is a Zod-validated default (`PORT` env var), not hardcoded.
- 2026-09-21: **`/ready` is currently a placeholder** (returns the same as `/health`) for all 7 services — none of them talk to Kafka/Postgres/TimescaleDB/Redis/MQTT yet (that starts in Phase 1 / step 0.6+). Do not read the current `/ready` as a real dependency check; it must be extended per-service once each service gains a real dependency.
- 2026-09-21: **Dockerfile base image: `node:24-alpine`.** Verified the tag exists (`docker manifest inspect node:24-alpine`) before use, per the no-hallucinated-versions rule. No native (non-pure-JS) deps in any service yet, so `musl`/alpine is safe; revisit if one is added later.
- 2026-09-21: **One Dockerfile template, not 7 hand-written ones.** `infrastructure/docker/Dockerfile.service.template` + `generate-dockerfiles.sh` produce `services/<name>/Dockerfile` — all 7 services currently share identical `dependencies`, so a single parameterized (`__SERVICE__`/`__PORT__`) 4-stage build (`deps` → `build` → `prod-deps` → `runtime`) avoids 7 copies drifting out of sync. Re-run the script after editing the template; do not hand-edit the generated files. Revisit (per-service Dockerfiles diverging naturally) once a service gains a dependency the others don't (e.g. `kafkajs`, `pg`, `mqtt` land at different times from Phase 1 on).
- 2026-09-21: **Docker healthcheck uses Node's built-in `fetch`**, not `curl`/`wget` — neither is installed in `node:24-alpine` by default, and adding one would grow the image for no benefit. `HEALTHCHECK` calls `node -e "fetch(...)"` against `/health`.
- 2026-09-21: **npm workspaces + Docker multi-stage gotcha (solved):** `node_modules/@iiot/<pkg>` are symlinks to `../../packages/<pkg>` (confirmed via `ls -la`), so the runtime stage must carry both the pruned `node_modules` (from a `prod-deps` stage running `npm ci --omit=dev`) *and* each `packages/<pkg>/package.json` + `dist/` at their real paths — copying `node_modules` alone breaks the symlink targets.
- 2026-09-21: **`generate-dockerfiles.sh` avoids `declare -A`** — macOS ships bash 3.2 (`/bin/bash`, confirmed via `bash --version`; no newer bash on `PATH`), which predates associative arrays and silently mis-evaluates `[api-gateway]` as arithmetic (`api - gateway`) instead of a literal string key. Uses a plain `name:port` newline list instead.
- 2026-09-21: **zod v4 API used correctly** — `z.uuid()` / `z.iso.datetime()` (top-level functions), not the deprecated `z.string().uuid()` / `.datetime()` chained methods. Verified against the installed package's `.d.ts`, not assumed from training data.

## Known issues

- None yet.
