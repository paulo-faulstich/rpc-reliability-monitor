# 01 · Problem frame

## The problem

RPC — the JSON-RPC access layer to a blockchain — is often treated as a commodity API, but
it is an **operational dependency**. A product can only read state, submit transactions, and
confirm them as reliably as its RPC path allows. When a provider degrades (latency spikes,
falls behind on block height, returns stale feed data, or fails outright), the failure
surfaces as product symptoms long before it looks like an "outage":

- reads return old or inconsistent data;
- transactions fail or hang unconfirmed;
- a price/feed read drives a decision on stale information;
- the entire product inherits a single provider's availability.

## Who it affects

- **End users** — degraded or wrong data, failed actions.
- **Product teams** — incidents that look like application bugs but are infrastructure.
- **Node / infra operators** — no shared signal for *when* to fail over.

## Why it matters for node and data-feed infrastructure

The discipline that makes a product's RPC strategy reliable — health scoring, consistency
checks, freshness detection, failover — is the same discipline that runs node operations and
data-feed delivery. Reliability is a **product surface**, not a background concern.

## In scope

- Reading one on-chain data source through multiple RPC providers.
- Comparing latency, block height, answer, and feed freshness.
- Detecting inconsistency and staleness.
- Recommending a primary provider and ranked fallbacks.

## Out of scope (for this slice)

- Operating Chainlink nodes, validators, or staking infrastructure.
- Production routing, persistence, alerting, and multi-region (see roadmap).
- The write path / transaction submission (a named follow-on).

## Why a Chainlink Data Feed is the test target

A Chainlink Data Feed is an ideal probe:

- it is an on-chain contract, so reading it exercises the full RPC path;
- its `latestRoundData()` return carries freshness metadata (`updatedAt`), so staleness is
  directly measurable;
- the identical call can be issued across providers, so consistency is directly comparable.
