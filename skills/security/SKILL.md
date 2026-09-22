---
name: security
description: Multi-tenancy isolation, secrets handling, current auth gaps (deferred to Phase 7). Read before touching auth, tenant-scoped queries, or anything credential-related.
---

# Security

## Purpose

Track what's actually protected today versus deliberately deferred, so no session accidentally treats a
Phase-0/1 local-dev shortcut (anonymous MQTT, no Redis auth) as production-acceptable, and so
multi-tenancy isolation — a stated hard requirement — is built in from the point entities first get an
`organizationId`/`factoryId`, not retrofitted.

## Current state (as of Phase 0)

No auth/RBAC anywhere yet — Phase 7 ("Auth, RBAC, multi-tenancy") is when it's built. Until then:

- EMQX `allow_anonymous` is on (local dev only) — see [[mqtt]].
- Redis has no auth configured — see [[database]].
- No `.env` values are real credentials; `.env.example` holds placeholders only, `.env` is gitignored.

These are **known, deliberate, and temporary** — not something to silently carry into Phase 7 or later
without re-evaluating.

## Multi-tenancy (`docs/contracts.md`)

`organizationId` + `factoryId` on core entities. Tenant isolation is a security requirement, not just a
data-modeling convenience — from Phase 3 (domain model) onward, every query that reads/writes tenant-scoped
data must filter by tenant, and every Kafka event envelope already carries `factoryId` (see [[kafka]]) so
consumers can enforce isolation without a separate lookup.

## Rules

- Never commit secrets. `.env.example` placeholders only; real values stay in local `.env` (gitignored) or
  a secrets manager once deployed.
- No credential ever appears in a log line (see [[observability]]).
- Once Phase 7 lands: every `api-gateway` route requires authentication + tenant-scoped authorization
  before it requires anything else — don't build features in later phases that assume an unauthenticated
  client can reach arbitrary data.
- Treat "Stop and ask" (`CLAUDE.md`) as applying to any credential, auth, or destructive-action decision,
  not just architectural ones.

## Anti-patterns

- Writing a query against `vehicle_db`/`alert_db`/`telemetry_db` that doesn't filter by `factoryId`/
  `organizationId` once those columns exist.
- Leaving `allow_anonymous`/no-auth-Redis defaults in place past local dev without flagging it in
  `PROGRESS.md` as an open known issue.
- Adding OAuth/JWT/session libraries speculatively before Phase 7 — avoid premature complexity, same as
  [[architecture]]'s "avoid premature complexity" rule.

## Verification

No dedicated security test suite yet. Phase 7: authz tests proving cross-tenant access is rejected;
`security-review` skill (already available in this environment) can be run on the diff for any auth-related
change once that phase starts.

## Related

[[mqtt]], [[database]], [[architecture]] (multi-tenancy touches every layer), `docs/contracts.md`.
