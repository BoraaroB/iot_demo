---
name: testing
description: Test pyramid order and current phase-1 smoke-test scope. Read before adding any test, or before claiming a change is "verified".
---

# Testing

## Purpose

Define what "verified" means at each project phase so `CLAUDE.md`'s "never claim unverified work" rule has
a concrete, checkable meaning instead of being interpreted ad hoc per session.

## Order (do not skip ahead)

1. **Smoke tests** (current phase): `/health`, `/ready`, then E2E MQTT→Kafka→TimescaleDB, then
   Kafka→WS→web. Exist to prove the pipeline wiring works end-to-end with real infra, nothing more.
2. **Unit tests** — pure logic (Zod schema parsing, envelope creation, business rules) with no Docker
   dependency. Comes after there's real business logic to unit-test (Phase 3+ domain model).
3. **Integration tests** — a service against its real dependency (e.g. `telemetry` against a real
   TimescaleDB container), still no cross-service mocking.
4. **E2E tests** — full pipeline or full user flow (Playwright for the frontend, per [[frontend]]).
5. **Load tests** — Phase 10 only, see [[load-testing]].

## Current state (as of Phase 0)

Only smoke tests exist: `npm run smoke` (`scripts/smoke.mjs`) boots each service's built `dist/index.js`,
polls until up, asserts `/health` + `/ready` → `200 {"status":"ok"}` and an unknown route → JSON 404, then
`SIGTERM`s it and confirms clean exit. No Kafka/MQTT/DB smoke tests yet — those land with Phase 1's
pipeline.

## Rules

- **Use real infrastructure (Docker Compose)** for connectivity tests — never mock Kafka/MQTT when testing
  that a service can actually reach them. Mocking is fine for pure unit tests of logic that doesn't touch
  I/O.
- A task isn't "done" until the smallest relevant verification in `CLAUDE.md`'s Verification table has
  actually been run and its output checked — not just that the code compiles.
- Report results as PASS/PARTIAL/FAIL with the exact command run (per `CLAUDE.md`'s Report format) — never
  "should work" or "production ready" without a command's output backing it.

## Anti-patterns

- Writing integration/E2E tests before the smoke-test layer for that path exists and passes.
- Mocking Kafka/MQTT in a test whose entire purpose is proving real connectivity.
- Claiming a scale target (100/1k/5k/10k vehicles) without a load test — these are test goals, not claims,
  until Phase 10 measures them.

## Verification

`npm run smoke` today; per-domain smoke tests (Kafka/MQTT/WS) as they're added per `CLAUDE.md`'s
Verification table; `npm run typecheck` + `npm run lint` always run alongside any test change.

## Related

[[backend]], [[frontend]] (Playwright), [[load-testing]], `CLAUDE.md` "Testing" and "Verification".
