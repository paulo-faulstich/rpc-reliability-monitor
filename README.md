# RPC Reliability Monitor

**A Web3 product can serve stale or inconsistent on-chain data long before its RPC provider
looks "down".** This project reads one Chainlink Data Feed through several RPC providers at
once, compares what each returns, and recommends a primary provider with ranked fallbacks.

> **Status:** working prototype on Ethereum Sepolia (testnet). A self-directed study project,
> not production software. Built to understand RPC infrastructure from the product side:
> what to measure, what "healthy" means, and when to route around a provider.

![Live dashboard comparing Alchemy, Infura and a public node on the same Chainlink BTC/USD feed](prototype/docs/dashboard.png)

Walkthrough of the interface, replaying real readings captured from the three providers (28 Nov 2026):

https://github.com/user-attachments/assets/9e2a751c-d79b-4629-8321-3da93f34a30f

## The problem

Teams usually treat RPC as a commodity API: pick a provider, add the URL, move on. The failure
that hurts is rarely a clean outage. It is a provider that still answers but is a few blocks
behind, slow at the tail, or serving a price feed that has not updated. A liveness check
passes, and the product makes decisions on old data.

Seeing that requires comparison. One provider alone cannot tell you it is behind.

## What it does

Each cycle sends the same three calls to every provider (`eth_chainId`, `eth_blockNumber`, and
`latestRoundData()` on the feed contract) and derives:

| Signal | Question it answers |
|---|---|
| Latency | Is this provider slow right now? |
| Block height vs the others | Is it behind the chain tip? |
| Feed answer vs the others | Do providers agree on the data? |
| Feed age vs a threshold | Is the data fresh, even if the provider is "up"? |
| Recommended primary + fallbacks | Who should we route to, and who is next? |

The recommendation rule is deliberately simple: the fastest provider among those that are
healthy **and** not stale. Freshness gates health, so a fast provider serving old data is never
picked.

It uses raw JSON-RPC with zero dependencies, so the infrastructure behavior stays visible
instead of hidden behind an SDK.

## What it showed

Measured on 24 November 2026: 30 cycles, 10 seconds apart, reading BTC/USD on Sepolia through
Alchemy, Infura and a public node from a single location. Full report in
[`prototype/docs/benchmark-results.md`](prototype/docs/benchmark-results.md).

| Provider | Success | p50 | p95 | Max | Cycles behind lead block | Cycles as primary |
|---|---|---|---|---|---|---|
| Alchemy | 30/30 | 212ms | 284ms | 301ms | 2 | 0 |
| Infura | 30/30 | 208ms | 278ms | 279ms | 2 | 0 |
| Public node | 30/30 | 155ms | 223ms | 229ms | 1 | 30 |

- **The free public endpoint was the fastest in every cycle.** Its median was about 25% lower
  than either keyed provider, and its p95 (223ms) was close to their median.
- **Nobody failed and nobody disagreed.** No errors, no timeouts, no answer mismatch, no stale
  read, and the recommended primary never changed.
- **Every provider fell one block behind at least once**, and never more than one. That is
  normal propagation, which is why a production version needs a lag tolerance instead of
  flagging any difference.
- **Same pattern five months earlier.** The runs recorded on 30 June 2026
  ([sample output](prototype/docs/sample-output.md)) also had the public node ahead.

What this does and does not support: on a quiet testnet, from one vantage point, a keyed
provider bought no latency advantage. It says nothing about rate limits, behavior under load,
mainnet, or what happens during an incident, which are the reasons teams pay for a provider.
The useful output is the method: measure side by side, then decide.

## Product thinking behind it

The prototype came first. The product artifacts were then written from what it demonstrated:
**prototype → evidence → spec**.

| Document | What it answers |
|---|---|
| [Problem frame](pm-operating-model/01-problem-frame.md) | What is broken, who it hurts, why it matters |
| [Hypotheses](pm-operating-model/02-hypotheses.md) | What we believe and how the prototype tests it |
| [PRD](pm-operating-model/03-prd.md) | Scope, requirements, trade-offs |
| [Epics & user stories](pm-operating-model/04-epics-user-stories.md) | The work as deliverable slices |
| [Metrics](pm-operating-model/05-metrics.md) | How reliability is measured and what success looks like |
| [Roadmap & prioritization](pm-operating-model/06-roadmap-prioritization.md) | Sequence and rationale |
| [Tech spec](pm-operating-model/07-tech-spec.md) | How it works and the path to production |

## Quick start

Requires Node.js 18 or later. No install step.

```bash
cd prototype
cp .env.example .env   # add your RPC provider URLs
npm run dashboard      # live dashboard at http://localhost:4173
npm run monitor        # one-off CLI check
npm run benchmark      # sampled run, writes docs/benchmark-results.md
```

It runs with only the default public endpoint, but the point is comparing several. See
[`prototype/README.md`](prototype/README.md) for configuration and details.

## Limitations

- Read path only. Transaction submission and confirmation are not measured.
- One vantage point. Latency includes the network path from the machine running it.
- Testnet. Sepolia traffic and provider behavior differ from mainnet.
- Any difference in block height is flagged, including the one-block lag that is normal
  propagation. A production version needs a tolerance.
- No alerting or persistence. Results live in memory and in the benchmark report.

---

Built by [Paulo Faulstich](https://github.com/paulo-faulstich) · 2026 · [MIT License](LICENSE)
