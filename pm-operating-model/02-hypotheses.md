# 02 · Hypotheses

Each hypothesis is paired with how the prototype (or a named next iteration) tests it.

## H1 — Multi-provider comparison detects divergence before users do

**Belief:** reading the same feed through several providers surfaces block-height or answer
divergence that a single provider cannot reveal.
**Test:** compare `answer` and `blockNumber` across providers each cycle; flag when the sets
diverge. *(Implemented: answer/block consistency checks.)*

## H2 — Latency is a leading indicator of degradation

**Belief:** p95 latency rises before a provider starts returning errors.
**Test:** sample per-provider latency continuously and alert on a sustained p95 breach before
error rate climbs. *(Prototype measures per-call latency; continuous sampling is a next step.)*

## H3 — Feed freshness catches risk that liveness checks miss

**Belief:** a provider can be "up" (responds, current block) yet serve a feed whose
`updatedAt` is stale — the dangerous case for price-driven products.
**Test:** compute feed age = `now − updatedAt` and flag staleness past a threshold,
independent of provider liveness. *(Implemented.)*

## H4 — "Fastest healthy" is a good-enough default primary

**Belief:** choosing the lowest-latency provider among the healthy, non-stale set is a sane
default routing policy.
**Test:** recommend primary = fastest healthy; over time, check whether it correlates with the
fewest downstream errors. *(Implemented as the recommendation rule.)*

## H5 — Operators trust automated failover only with a visible signal

**Belief:** teams adopt automated routing only when the underlying health/consistency signal
is legible to them.
**Test:** surface the same signals in a human-readable dashboard and validate comprehension
with reviewers who are not RPC experts. *(Dashboard implemented.)*
