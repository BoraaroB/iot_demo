# PROGRESS

> Single source of truth for project progress. Read this first at the start of every session.
> Update it at the end of every step, in the same commit as the code.

## Current position

- **Phase:** 0 — Bootstrap
- **Step:** 0.2 done (npm workspaces root, shared TS config, lint/format tooling)
- **Branch:** `main`
- **Last tag:** none
- **Next step:** 0.3 — `packages/` (config, logger, events, types). First real `.ts` code — also when root `tsconfig.json` (solution file with `references`) and the `typecheck` script get created, since `tsc` needs at least one input to run.

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` not started

## Phases

- [~] **Phase 0 — Bootstrap** → `v0.1.0`
  - [x] 0.1 git init, `.gitignore`, `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md`
  - [x] 0.2 npm workspaces root, shared TS config, lint + format scripts (typecheck script deferred to 0.3 — no `.ts` files exist yet)
  - [ ] 0.3 `packages/` — config, logger (Pino), events (EventEnvelope + Zod), types
  - [ ] 0.4 service skeletons (7) with `/health`, `/ready`, logging, error handler
  - [ ] 0.5 Dockerfiles (multi-stage, non-root)
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

## Environment (verified 2026-09-21)

- Node `v24.18.0`, npm `11.16.0`, Docker `29.4.0`, Docker Compose `v5.1.1`. pnpm not installed.

## Decisions

- 2026-09-21: Single main agent. Subagents only when the user asks or for truly independent work (skills writing, code review, frontend/backend in separate worktrees after Phase 2 contracts are stable).
- 2026-09-21: **TypeScript pinned to `^6.0.3`, not the newest `7.0.2`.** TS 7 (native/Go-ported compiler) shipped ~2026-07 and `typescript-eslint@8.70.0`'s peer range is still `<6.1.0` — installing TS 7 breaks `npm install` (ERESOLVE). Revisit once typescript-eslint supports TS 7.
- 2026-09-21: ESLint flat config lives in `eslint.config.mjs` (forced ESM via extension, independent of root `package.json` `"type"`), using the unified `typescript-eslint` package + `projectService: true` for type-aware linting.
- 2026-09-21: **TS project references convention** — every future `packages/*`, `services/*`, `apps/*` gets its own `tsconfig.json` extending `../../tsconfig.base.json` with `"composite": true`. The root `tsconfig.json` (solution file, `"files": []` + `"references": [...]`) and the root `typecheck` script (`tsc --build tsconfig.json`) are created in step 0.3 alongside the first real package — `tsc` errors (`TS18002`/`TS18003`) if it has zero inputs, so an empty solution file can't exist before then.

## Known issues

- None yet.
