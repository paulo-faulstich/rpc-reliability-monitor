# 06 · Roadmap & prioritization

Prioritized by reliability impact vs effort.

## Now (shipped in the prototype)

- Multi-provider read of a Chainlink Data Feed via raw JSON-RPC.
- Latency, consistency, freshness, and staleness signals.
- Primary + fallback recommendation.
- CLI and dashboard.

## Next (high impact / low–medium effort)

1. Historical latency/error sampling with local persistence → real p95/p99.
2. Alerting on threshold breach (health, consistency, staleness).
3. Failover hysteresis so routing does not flap.
4. Public vs Alchemy vs Infura vs QuickNode comparison under sustained load.

## Later (higher effort / strategic)

5. Self-hosted node comparison vs external providers.
6. Write path — signed testnet transaction submission and confirmation tracking.
7. Multi-region redundancy and a regional latency view.
8. Validator/staking ecosystem map and a "primary RPC degrades" runbook.

## Why this order

Detection and legibility come before automation: you earn the right to auto-route by first
proving the signal is trustworthy and visible. Persistence and alerting (Next) convert the
live snapshot into trend-based decisions. The write path and self-hosting (Later) are heavier
and depend on the reliability foundation already being in place.
