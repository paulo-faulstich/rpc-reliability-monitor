# 05 · Metrics

## Reliability metrics (per provider)

- Availability — success rate of cycles.
- Latency — p50 / p95 / p99.
- Error rate and timeout rate.
- Latest-block lag vs the leading provider.
- Answer/response consistency across providers.
- Feed freshness — age vs threshold / stale-read rate.
- Provider failover success rate.
- *(Write path, next)* successful transaction submission rate.

## Product success metrics

- **North Star:** share of cycles in which a healthy, fresh, consistent primary is available.
- Time-to-detect a degraded provider (lower is better).
- RPC-attributable incidents that were **caught before** user impact.

## Guardrails

- Free-tier request budget respected (Start/Stop usage).
- No false "healthy" while the feed is stale — freshness must gate health.
- Recommendation stability — no routing flap, measured as primary changes per hour.
