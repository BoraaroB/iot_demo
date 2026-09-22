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
