# Repository layout

Target layout (create incrementally — not everything exists yet, check the tree before assuming a path):

```text
apps/web/                         Next.js dashboard
services/{api-gateway,iot-ingestion,telemetry,vehicle,alert,realtime,simulator}/
packages/{config,logger,events,types,validation}/
infrastructure/{kafka,postgres,timescaledb,redis,emqx}/
docs/   skills/   docker-compose.yml   .env.example
```

## Per-service requirements

Each service under `services/` needs:

- `package.json`, `tsconfig.json` (extends root `tsconfig.base.json`, sets `"composite": true`, registered in root `tsconfig.json`'s `references`)
- `src/`
- `Dockerfile` (multi-stage, non-root, healthcheck)
- env config (Zod-validated)
- `/health` (process only) and `/ready` (dependencies)
- structured logging (`@iiot/logger`)
- error handling
- a smoke test

Root `npm run typecheck` runs `tsc --build` across all registered project references.

## Service boundaries

Services never import another service's source. Communicate via HTTP, Kafka or MQTT only. Shared code lives in `packages/`.

## Planned refactors (implement when CRUD routes are added)

- **Shared error handling**: every service's `app.ts` currently duplicates the same `notFoundHandler`/`errorHandler` pair. Extract into a shared package (e.g. `packages/http` or an addition to `packages/logger`) exporting a `notFoundHandler` and an `errorHandler(logger)` factory; each service imports and mounts them instead of redefining.
- **Per-domain routers**: once a service gets real business endpoints (not just `/health`/`/ready`), move them out of `app.ts` into `src/routes/<domain>.ts` using `express.Router()`. `app.ts` stays an orchestrator that only mounts middleware and `app.use('/api/v1/<domain>', <domain>Router)`. Keep `/health` and `/ready` inline in `app.ts` (infrastructure, not business routes).
