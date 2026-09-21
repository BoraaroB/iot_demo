# PROGRESS

> Single source of truth for project progress. Read this first at the start of every session.
> Update it at the end of every step, in the same commit as the code.

## Current position

- **Phase:** 0 — Bootstrap
- **Step:** 0.1 done (git + tracking files + CLAUDE.md)
- **Branch:** `main`
- **Last tag:** none
- **Next step:** 0.2 — npm workspaces root (`package.json`, `tsconfig.base.json`, lint/typecheck scripts)

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` not started

## Phases

- [~] **Phase 0 — Bootstrap** → `v0.1.0`
  - [x] 0.1 git init, `.gitignore`, `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md`
  - [ ] 0.2 npm workspaces root, shared TS config, lint + typecheck scripts
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

## Environment (verified 2026-09-21)

- Node `v24.18.0`, npm `11.16.0`, Docker `29.4.0`, Docker Compose `v5.1.1`. pnpm not installed.

## Decisions

- 2026-09-21: Single main agent. Subagents only when the user asks or for truly independent work (skills writing, code review, frontend/backend in separate worktrees after Phase 2 contracts are stable).

## Known issues

- None yet.
