---
name: frontend
description: Next.js/React dashboard conventions — realtime data flow, state, forms, charts. Read before starting apps/web work (Phase 2+, not started as of Phase 0).
---

# Frontend

## Status

Not started. `apps/web` does not exist yet — this skill documents conventions to follow *when* Phase 2
("Realtime + first dashboard") begins. Do not create `apps/web` speculatively during earlier phases.

## Stack (verify exact versions from npm metadata when first installed — do not assume)

Next.js, React 19+, Tailwind, shadcn/ui, TanStack Query, Zustand, React Hook Form, ECharts, Playwright.

## Conventions (to apply once `apps/web` exists)

- Server state (data fetched from `api-gateway`) goes through TanStack Query. Client/UI-only state
  (selected vehicle, open panels, filters) goes through Zustand. Do not duplicate server state into
  Zustand.
- Forms use React Hook Form + Zod resolvers (reuse Zod schemas from `packages/types`/`packages/validation`
  where the shape matches a backend contract — don't redefine it).
- Charts use ECharts (`docs/contracts.md` defines the data shapes historical/telemetry charts will consume
  in Phase 6).
- Styling: Tailwind utility classes + shadcn/ui components; avoid hand-rolled CSS-in-JS.
- E2E tests use Playwright, added once there are real user flows to test (Phase 2+), per [[testing]].

## Realtime rule (hard rule, from `CLAUDE.md`)

The frontend **never polls** live vehicle/telemetry/alert state. All live updates come from the `realtime`
service over WebSocket, subscription-based per `factory:<id>` / `vehicle:<id>` channel — see [[websocket]].
Historical data (charts, past telemetry) is fetched once via `api-gateway` HTTP, not streamed.

## Anti-patterns

- Polling `api-gateway` on an interval for data that `realtime` already pushes.
- Talking to Kafka, MQTT, or a database directly from the browser or from Next.js server code — always go
  through `api-gateway` (HTTP) or `realtime` (WebSocket), per [[architecture]].
- Storing WebSocket payloads in an unbounded array — buffers must be bounded; drop stale updates instead
  of growing memory (`CLAUDE.md` "Realtime & performance").
- Swapping Next.js for another framework — protected architectural decision.

## Verification (once `apps/web` exists)

`npm run typecheck` / `npm run lint` at the workspace root (covers `apps/web` once added to the
`workspaces` glob), Playwright E2E suite for user-facing flows, manual browser check for any UI change per
`CLAUDE.md`'s frontend testing guidance.

## Related

[[websocket]], [[architecture]], [[testing]], `docs/contracts.md`, `docs/api-versioning.md`.
