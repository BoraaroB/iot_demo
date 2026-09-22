---
name: websocket
description: realtime service's WebSocket contract — subscription channels, batching, backpressure. Read before touching services/realtime or any frontend live-data consumer.
---

# WebSocket

## Purpose

`realtime` is the only service that pushes live data to browsers. It exists so the frontend never has to
poll (`CLAUDE.md` "Realtime & performance" — hard rule).

## Current state (as of Phase 0)

`realtime` service skeleton exists (port 3005), `/health` + `/ready` only — no Kafka consumer or WebSocket
server wired yet. That starts in Phase 2 ("Realtime + first dashboard").

## Conventions (to apply once the WebSocket server is built)

- Subscription-based, not broadcast: clients subscribe to `factory:<id>` and/or `vehicle:<id>` channels;
  `realtime` only forwards Kafka events matching an active subscription for that connection.
- `realtime` consumes the same Kafka topics domain services do ([[kafka]]) but holds no durable state — a
  restart just means clients resubscribe and get gaps filled by the next `api-gateway` HTTP fetch.
- Updates are filtered (per-subscription), batched, and throttled before being sent — don't forward every
  raw Kafka message 1:1 to a socket that only needs a UI refresh a few times a second.
- Per-connection buffers are bounded; on backpressure, drop the oldest/stale update rather than growing
  memory or blocking the Kafka consumer.
- Message envelope on the wire should carry enough to route client-side (channel, event type, payload) —
  define the concrete shape in `docs/contracts.md` or `packages/types` when this is built, don't invent it
  ad hoc in `realtime`'s code alone.

## Anti-patterns

- Frontend polling `api-gateway` for data `realtime` already streams (see [[frontend]]).
- Unbounded per-client queues — a slow client must not cause unbounded memory growth on the server.
- Sending every vehicle's telemetry to every connected client instead of filtering by subscribed channel.
- Swapping WebSocket for polling/SSE — protected architectural decision.

## Verification

Once built: the Kafka→WS→web smoke test named in `CLAUDE.md`'s Testing section. Measure throughput/latency
before claiming a scale target (100/1k/5k/10k vehicles are test goals, not claims, per `CLAUDE.md`).

## Related

[[kafka]] (source of events), [[frontend]] (consumer), [[architecture]].
