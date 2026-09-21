# syntax=docker/dockerfile:1
#
# Multi-stage build for the "vehicle" service in the npm-workspaces monorepo.
# Build context MUST be the repository root, e.g.:
#   docker build -f services/vehicle/Dockerfile -t iiot/vehicle:dev .
#
# This file is generated from infrastructure/docker/Dockerfile.service.template
# (infrastructure/docker/generate-dockerfiles.sh) — edit the template, not the
# per-service copies, and re-run the script.

FROM node:24-alpine AS base
WORKDIR /app

# ---- deps: install all workspace deps (dev included) needed to compile ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/package.json
COPY packages/events/package.json packages/events/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/config/package.json packages/config/package.json
COPY services/vehicle/package.json services/vehicle/package.json
RUN npm ci

# ---- build: compile this service and its @iiot/* package references ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY packages/events packages/events
COPY packages/logger packages/logger
COPY packages/config packages/config
COPY services/vehicle services/vehicle
RUN npx tsc --build services/vehicle

# ---- prod-deps: production-only deps, same workspace symlink layout ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/package.json
COPY packages/events/package.json packages/events/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/config/package.json packages/config/package.json
COPY services/vehicle/package.json services/vehicle/package.json
RUN npm ci --omit=dev

# ---- runtime: distroless-ish — only prod deps + compiled dist, non-root ----
FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S iiot && adduser -S iiot -G iiot

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/packages/types/package.json packages/types/package.json
COPY --from=prod-deps /app/packages/events/package.json packages/events/package.json
COPY --from=prod-deps /app/packages/logger/package.json packages/logger/package.json
COPY --from=prod-deps /app/packages/config/package.json packages/config/package.json
COPY --from=prod-deps /app/services/vehicle/package.json services/vehicle/package.json

COPY --from=build /app/packages/types/dist packages/types/dist
COPY --from=build /app/packages/events/dist packages/events/dist
COPY --from=build /app/packages/logger/dist packages/logger/dist
COPY --from=build /app/packages/config/dist packages/config/dist
COPY --from=build /app/services/vehicle/dist services/vehicle/dist

USER iiot
WORKDIR /app/services/vehicle
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env['PORT']||'3003')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
