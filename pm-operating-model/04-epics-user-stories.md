# 04 · Epics & user stories

## Epic A — Provider health check

- **As a product engineer, I want each provider's status and latency per cycle** so I know who
  is responsive.
  - *AC:* each provider returns ok/error plus latency in ms; a timeout is reported as an error,
    not a hang.
- **As an operator, I want a slow provider not to block the others.**
  - *AC:* providers are queried concurrently, each with an independent per-call timeout.

## Epic B — Consistency & freshness

- **As an engineer, I want to know if providers disagree on the answer or block height.**
  - *AC:* answer consistency and block consistency are reported as ok vs mismatch each cycle.
- **As a product owner, I want stale feed data caught even when the provider looks healthy.**
  - *AC:* feed age is computed from `updatedAt`; the stale flag is raised past the threshold
    regardless of liveness.

## Epic C — Recommendation & failover

- **As an engineer, I want a recommended primary provider and ranked fallbacks.**
  - *AC:* primary = fastest healthy (ok ∧ not stale); fallbacks listed by ascending latency.
- **(Next) As an operator, I want routing to fail over automatically when the primary degrades.**
  - *AC:* hysteresis so routing does not flap on a single slow cycle.

## Epic D — Surfacing

- **As a mixed product/technical audience, I want a dashboard that explains the signals.**
  - *AC:* live table, KPI summary, recent-check log, and a plain-language framing of why it
    matters.
- **(Next) As an operator, I want alerting when health or consistency breaches thresholds.**
  - *AC:* configurable thresholds; an alert fires on sustained breach, not a single cycle.
