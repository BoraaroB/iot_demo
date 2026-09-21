# CLAUDE.md — Autonomous Vehicle IIoT Platform

Production-style Industrial IoT platform for monitoring autonomous vehicles in a factory.
Portfolio + architecture demo. Not a toy CRUD app. Build incrementally, verify every step.

Full original specification: `instruction_plan.md` (read only the section you need — it is long).

## Session start (always)

1. Read `PROGRESS.md` — current phase, step, next step.
2. Run `git status` and `git log --oneline -5`.
3. Work on **one step** only. Then verify → update `PROGRESS.md` + `CHANGELOG.md` → commit.

## Token discipline

- Read files partially when possible; do not re-read files already in context.
- Load `skills/<domain>/` and `docs/*.md` only when working in that domain.
- Tail/filter long command output (`| tail -30`, `grep`), e.g. docker logs, npm install.
- No subagents unless the user asks.
- Keep this file short (< 250 lines). Domain detail belongs in `skills/` and `docs/`.

## Hard rules

- **No hallucinations.** Never invent APIs, library options, versions, CLI flags, env vars, files or endpoints. Inspect the repo / package metadata / official docs; state uncertainty.
- **Never claim unverified work.** Use "implemented but not yet verified" or "implemented and verified with: `<cmd>`". No "production ready", "supports 10k vehicles", "exactly-once" without evidence.
- **User instructions win**, then this file, then repo, then `docs/`, then `skills/`, then official docs.
- **Stop and ask** on architectural changes, conflicting requirements, destructive actions, credentials.
- Never commit secrets. `.env.example` has placeholders only.
- Never destroy user work: no `reset --hard`, `clean`, force-push without explicit permission.

## Architecture (protected — do not replace without approval)

```text
Vehicles/Simulator --MQTT--> EMQX --> iot-ingestion --Kafka--> telemetry  -> TimescaleDB
                                                         +--> vehicle    -> PostgreSQL (+ Redis runtime state)
                                                         +--> alert      -> PostgreSQL / Redis
                                                         +--> realtime --WebSocket--> Next.js web
Client --HTTP--> api-gateway --> vehicle | telemetry | alert
```

Never swap: Kafka→Redis, MQTT→HTTP, TimescaleDB→PostgreSQL, WebSocket→polling, microservices→monolith, Next.js→other.
Avoid premature complexity: no Kubernetes, service mesh, event sourcing, CQRS, schema registry, multi-region.

## Stack

- Backend: Node.js 24, TypeScript (strict, no `any`), Express, Zod, Pino.
- Frontend: Next.js, React 19+, Tailwind, shadcn/ui, TanStack Query, Zustand, React Hook Form, ECharts, Playwright.
- Infra: EMQX, Kafka, PostgreSQL, TimescaleDB, Redis, Docker Compose. Later: Prometheus, Grafana, OpenTelemetry, GitHub Actions, Hetzner + Nginx.
- Package manager: **npm workspaces** (npm 11 installed; pnpm is not).
- Verify every dependency version from package metadata before adding it.

## Repository layout (target — create incrementally)

```text
apps/web/                         Next.js dashboard
services/{api-gateway,iot-ingestion,telemetry,vehicle,alert,realtime,simulator}/
packages/{config,logger,events,types,validation}/
infrastructure/{kafka,postgres,timescaledb,redis,emqx}/
docs/   skills/   docker-compose.yml   .env.example
```

Each service: `package.json`, `tsconfig`, `src/`, Dockerfile (multi-stage, non-root, healthcheck), env config, `/health` (process only), `/ready` (dependencies), structured logging, error handling, smoke test.
Services never import another service's source. Communicate via HTTP, Kafka or MQTT. Shared code lives in `packages/`.

## Contracts

MQTT topics:
```text
factory/{factoryId}/vehicle/{vehicleId}/telemetry
factory/{factoryId}/vehicle/{vehicleId}/status
factory/{factoryId}/vehicle/{vehicleId}/command
```

Kafka topics: `vehicle.telemetry`, `vehicle.location`, `vehicle.status`, `vehicle.alert`, `vehicle.mission`, `vehicle.command`. Key = `vehicleId`.

Event envelope (do not add fields casually; version changes via `schemaVersion`):
```ts
interface EventEnvelope<TPayload> {
  eventId: string; eventType: string; timestamp: string;
  vehicleId: string; factoryId: string; schemaVersion: number; payload: TPayload;
}
```

Consumers must tolerate duplicates, delays and cross-partition reordering (idempotency via `eventId`).

Coordinates: local factory `x`/`y` (no GPS initially).

Multi-tenancy: `organizationId` + `factoryId` on core entities. Tenant isolation is a security requirement.

## API versioning

- Public API is versioned by URI **in the api-gateway only**: `/api/v1/...`. Internal services use unversioned routes.
- Major version only in the URL. Additive, backward-compatible changes stay in `v1`. `v2` only for breaking changes.
- During a migration `v1` and `v2` run in parallel. `v1` responses get `Deprecation` and `Sunset` headers before removal.
- Events are versioned with `schemaVersion`; WebSocket messages carry a protocol version.

## Git & versioning

- Conventional Commits: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `chore: ...`, `test: ...`.
- `main` is always verified. Work per phase on `phase/<n>-<name>`, merge when verification passes.
- Completed phase gets an annotated SemVer tag: `git tag -a v0.N.0 -m "Phase ..."`. Fixes bump patch.
- Roll back: inspect `git checkout vX.Y.Z`; branch from it `git switch -c fix/... vX.Y.Z`; undo on main with `git revert`.
- Docker images tagged with the same version as git.
- DB migrations are versioned and forward-only; provide `down` where reasonable.
- Pushing to a remote only when the user asks.

## Realtime & performance

- Frontend never polls live state. WebSocket updates are subscription-based (`factory:<id>`, `vehicle:<id>`), filtered, batched, throttled.
- Bounded buffers; drop stale realtime updates instead of growing memory.
- Measure before optimizing. Scale targets (100 / 1k / 5k / 10k vehicles) are test goals, not claims.

## Testing

Phase 1 of testing = smoke tests only (`/health`, `/ready`, then E2E MQTT→Kafka→TimescaleDB, then Kafka→WS→web).
Use real infrastructure (Docker Compose) — do not mock Kafka/MQTT when testing connectivity.
Unit → integration → E2E → load tests come later, in that order.

## Verification (smallest relevant)

| Change | Verify |
|---|---|
| TypeScript | `npm run typecheck` (+ `npm run lint` when configured) |
| Dockerfile | `docker build ...` |
| Service startup | `npm run smoke` |
| Kafka / MQTT / WS | the matching smoke test |
| DB schema | migration + DB smoke test |

(Scripts above are created in Phase 0 — check `package.json` before using them.)

## Definition of done

Code exists, boundaries respected, typecheck/lint pass, relevant smoke tests pass, Docker build passes (if relevant), errors handled, logs present, docs updated, `PROGRESS.md` + `CHANGELOG.md` updated, no secrets, no unverified claims.

## Report after each task

`## Changed` · `## Verified` (exact commands run) · `## Result` (PASS / PARTIAL / FAIL) · `## Known Issues` · `## Next Step`
