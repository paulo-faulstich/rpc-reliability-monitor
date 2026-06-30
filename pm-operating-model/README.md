# PM operating model — RPC provider reliability

This folder reverse-engineers the [RPC Reliability Monitor prototype](../prototype) into the
product-management artifact chain behind it. The prototype was built first as a working,
on-chain proof; these documents show the product thinking it stands on.

The prototype is the **executable spec**: every behavior described here is demonstrated by
running code against a live Chainlink Data Feed on Ethereum Sepolia. The narrative runs
**prototype → evidence → spec**, never the reverse.

## Read order

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Problem frame](01-problem-frame.md) | What's broken, who it hurts, why it matters |
| 02 | [Hypotheses](02-hypotheses.md) | What we believe and how we test it |
| 03 | [PRD](03-prd.md) | Scope, requirements, trade-offs |
| 04 | [Epics & user stories](04-epics-user-stories.md) | The work as deliverable slices |
| 05 | [Metrics](05-metrics.md) | How reliability is measured and what success looks like |
| 06 | [Roadmap & prioritization](06-roadmap-prioritization.md) | Sequence and rationale |
| 07 | [Tech spec](07-tech-spec.md) | How the prototype works and the path to production |

## One-line thesis

RPC is an operational dependency, not a commodity API. Treat providers like any other
production dependency: measure them, compare them, and route around them with a fallback.
