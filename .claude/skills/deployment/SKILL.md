---
name: deployment
description: Local Docker Compose today; Hetzner + Nginx + GitHub Actions in Phase 11. Read before touching CI config or production deployment.
---

# Deployment

## Purpose

Keep "how this runs" honest about what's actually deployed versus what's local-only, and avoid building
CI/production infra before Phase 9/11 need it.

## Current state (as of Phase 0)

Local only: `docker-compose.yml` runs infra (Kafka, Postgres, TimescaleDB, Redis, EMQX, Kafka UI), each
service has a Dockerfile ([[docker]]) but there is no orchestrated "run everything" compose target for the
7 services yet, no CI pipeline, and no production target. GitHub Actions is Phase 9 ("Tests + CI") scope;
Hetzner + Nginx production deployment is Phase 11 (`v1.0.0`), the last phase.

## Planned shape (per `CLAUDE.md` Stack / Architecture — do not build early)

- CI: GitHub Actions running typecheck/lint/smoke tests (and whatever Phase 9 adds) on PRs.
- Production: Hetzner VM(s) + Nginx as reverse proxy/TLS termination in front of `api-gateway` (HTTP) and
  `realtime` (WebSocket upgrade) and static hosting/reverse-proxy for the Next.js app.
- No Kubernetes, no service mesh, no multi-region — explicitly out of scope per `CLAUDE.md` "avoid
  premature complexity", same constraint as [[architecture]].

## Rules

- Don't add a CI workflow file before Phase 9, or Hetzner/Nginx config before Phase 11 — follow
  `PROGRESS.md`'s phase order; earlier phases build the thing that would be deployed.
- Any production credential/secret handling must go through a secrets mechanism appropriate to the host
  (never `.env` committed, never a secret baked into an image layer) — see [[security]].
- Verify Nginx/GitHub Actions config choices (action versions, Nginx directives) against official docs
  when written — same "no hallucinated flags/versions" rule as everywhere else in this project.

## Anti-patterns

- Standing up a Hetzner box or writing deploy scripts before the app has anything worth deploying beyond
  Phase 0 skeletons.
- A CI workflow that doesn't run the same commands defined in `CLAUDE.md`'s Verification table (typecheck,
  lint, smoke) — CI should enforce the same bar sessions already hold themselves to locally.
- Force-pushing or bypassing CI checks to get a deploy out — `CLAUDE.md`'s git-safety rules apply here too.

## Verification

Today: `docker compose up -d` / `docker compose ps` for local infra ([[docker]]). Phase 9+: CI green on
the same commands as local verification. Phase 11: a real smoke test against the deployed Hetzner URL
(`/health` on each public-facing service) before calling a deploy done.

## Related

[[docker]], [[security]], `docs/git-workflow.md`, [[testing]].
