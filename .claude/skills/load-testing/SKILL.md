---
name: load-testing
description: Scale targets and measurement discipline for Phase 10. Read before making any performance claim, or before starting load-test tooling.
---

# Load testing

## Purpose

Turn "100 / 1k / 5k / 10k vehicles" from an aspiration into an actually-measured result, and stop
unverified performance claims from creeping into `PROGRESS.md`/`CHANGELOG.md` before Phase 10 exists to
back them up.

## Current state

Not started — Phase 10, after Tests + CI (Phase 9) and before Hetzner deployment (Phase 11). No load-test
tooling, scripts, or dependencies should be added before then.

## Scale targets (`CLAUDE.md`)

100 / 1k / 5k / 10k simulated vehicles are **test goals**, not claims. Every number reported must come with
the command/tool that produced it — "should handle 10k vehicles" without a run is exactly the kind of
unverified claim `CLAUDE.md` bans.

## Conventions (when Phase 10 starts)

- Reuse `simulator` ([[simulator]]) as the load driver — it already speaks the real MQTT contract, so load
  results reflect the real ingestion path rather than a synthetic shortcut.
- Measure before optimizing (`CLAUDE.md` "Realtime & performance") — establish a baseline at each scale
  tier before changing anything, so a fix's effect is attributable.
- Watch the whole pipeline, not just one hop: MQTT ingest rate, Kafka consumer lag per consumer group
  ([[kafka]]), DB write throughput ([[database]]), WebSocket fan-out latency ([[websocket]]) — a bottleneck
  in one stage can hide problems in the others.
- Record results (throughput, latency percentiles, resource usage, and the exact scale tier + commit) in
  `PROGRESS.md`, not just "it worked" — future sessions need the numbers to know if a later change
  regressed something.

## Anti-patterns

- Load-testing against mocked Kafka/MQTT — defeats the purpose, same rule as [[testing]].
- Reporting a single successful run as proof of a scale target without repeatability or percentile data
  (p50 alone hides tail latency problems).
- Optimizing (adding caching, batching, etc.) before a baseline measurement shows where the actual
  bottleneck is.
- Building load-test tooling before Phase 9 (tests + CI) is in place — order matters per `PROGRESS.md`'s
  phase sequence.

## Verification

Phase 10 itself defines this: a documented load-test run (tool, scale tier, duration, results) checked
into `PROGRESS.md`, plus Prometheus/Grafana dashboards from [[observability]] (Phase 8) used to observe the
run rather than blind CLI output.

## Related

[[simulator]], [[observability]], [[testing]], [[kafka]], [[database]], [[websocket]].
