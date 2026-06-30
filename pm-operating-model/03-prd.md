# 03 · PRD — RPC provider reliability monitor

## Summary

A lightweight capability that treats RPC providers as monitored operational dependencies. It
reads one on-chain data source through multiple providers, scores their health, checks
consistency and freshness, and recommends a primary provider with ranked fallbacks.

## Goals

- Make RPC degradation visible **before** it becomes a user-facing incident.
- Express provider health as a single, defensible recommendation.
- Stay legible to both engineers (CLI) and product/ops audiences (dashboard).

## Non-goals

- Replace full observability stacks (Grafana/Datadog); this is a focused reliability lens.
- Operate nodes or submit transactions in this slice.

## Users

- **Product engineer** — wants to know which provider to route to, and why.
- **Product / ops stakeholder** — wants reliability legible without reading code.
- **Node / infra operator** — wants an early, shared signal for failover.

## Functional requirements

- **FR1** — read the same feed (`latestRoundData()`) through N configured providers per cycle.
- **FR2** — capture status, latency, chain ID, block number, decoded answer, and feed `updatedAt`.
- **FR3** — compute answer consistency and block consistency across providers.
- **FR4** — compute feed age and flag staleness against a configurable threshold.
- **FR5** — recommend primary = fastest healthy (ok ∧ not stale); fallbacks = remaining healthy, by latency.
- **FR6** — provide a CLI run and an auto-refreshing dashboard.

## Non-functional requirements

- **NFR1** — no Web3 SDK; raw JSON-RPC so infrastructure behavior stays visible.
- **NFR2** — rate-limit aware; explicit Start/Stop to avoid burning free-tier quota.
- **NFR3** — per-call timeout; a slow provider degrades gracefully and never blocks the cycle.
- **NFR4** — configuration via `.env`; secrets never committed.

## Key trade-offs

- **Single vs multi-provider** — single is cheaper and simpler but a single point of failure;
  multi adds selection, monitoring, consistency checks, routing, rate-limit handling, and cost.
- **External provider vs self-hosted node** — external accelerates delivery and gives managed
  scale; self-hosted gives control and reduces vendor lock-in but demands operational depth
  (client upgrades, storage growth, archive access, monitoring, incident response, regional
  redundancy, security hardening).
- **Full vs archive node** — full nodes cover current and recent state; archive nodes are
  needed for deep historical queries but are costlier and operationally heavier.

## Open questions

- What latency/error thresholds should define "unhealthy", per network?
- How stale is too stale, per feed and per product use?
- When should the system recommend self-hosting over external providers?
