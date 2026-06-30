# Chainlink RPC Reliability Monitor

Small prototype to demonstrate practical understanding of:

- blockchain RPC providers;
- Chainlink Data Feeds;
- RPC latency and error handling;
- basic provider failover thinking;
- product framing for node/RPC infrastructure reliability.

This is intentionally lightweight. It uses raw JSON-RPC calls instead of a Web3 SDK so the infrastructure behavior is visible.

> The product thinking behind this prototype — problem frame, PRD, metrics, roadmap, and tech spec — lives in [`../pm-operating-model`](../pm-operating-model). This prototype is its executable spec.

## What it does

The prototype calls the same Chainlink Data Feed contract through multiple RPC providers and compares:

- provider availability;
- request latency;
- chain ID;
- latest block number;
- Chainlink feed answer;
- feed update timestamp;
- feed staleness;
- consistency across providers.

It includes two interfaces:

- a CLI monitor for quick technical checks;
- a local dashboard for a product- and stakeholder-friendly walkthrough.

Default feed:

- **Network:** Ethereum Sepolia
- **Feed:** BTC/USD
- **Contract:** `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`
- **Method:** `latestRoundData()`

## Why this matters

For Web3 products, RPC is not “just an API.” It is the access layer between the product and blockchain state. A weak RPC strategy can create outages, stale reads, high latency, failed transactions, or dependency on a single provider.

For Chainlink-style infrastructure, the same reliability mindset matters around node operators, data feeds, monitoring, failover, and operational standards.

## Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add whichever RPC provider URLs you have:

```bash
RPC_PROVIDERS="alchemy=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY,infura=https://sepolia.infura.io/v3/YOUR_KEY,quicknode=https://YOUR-ENDPOINT.quiknode.pro/YOUR_KEY,public=https://ethereum-sepolia-rpc.publicnode.com"
```

You can run with only one provider, but the point of the prototype is comparing multiple providers.

## Run the CLI

```bash
npm run monitor
```

No dependencies are required.

## Run the dashboard

```bash
npm run dashboard
```

Then open:

```text
http://localhost:4173
```

The dashboard shows:

- live auto-refresh every 10 seconds;
- Start Fetch and Stop Fetch controls to avoid burning through free-tier RPC requests;
- recommended primary RPC provider;
- healthy provider count;
- answer consistency;
- block consistency;
- provider latency;
- feed freshness;
- stale-data warning;
- recent check history;
- product-friendly explanation of why RPC reliability matters.

This is the preferred walkthrough format for mixed technical and product audiences.

## Example output

See [`docs/sample-output.md`](docs/sample-output.md) for a real local run.

```text
Chainlink RPC Reliability Monitor
Network target: Ethereum Sepolia
Feed: BTC/USD

Provider   Status  Latency  Block     Answer      Updated                  Stale?
alchemy    ok      184ms    6234123   104231.55   2026-06-30 13:12:24     no
infura     ok      231ms    6234123   104231.55   2026-06-30 13:12:24     no
quicknode  error   5000ms   -         -           -                       -

Recommended primary: alchemy
Fallback candidates: infura
```

## Product questions this prototype surfaces

- Do we depend on one provider or use multi-provider failover?
- What latency/error thresholds define an unhealthy RPC?
- How stale can feed data become before we block product behavior?
- Do we need full nodes, archive nodes, dedicated clusters, or external providers?
- How do we monitor consistency between providers?
- How do we expose reliability to internal teams and operators?

## Source references

- Chainlink Data Feeds docs: https://docs.chain.link/data-feeds
- Chainlink “Using Data Feeds” docs: https://docs.chain.link/data-feeds/using-data-feeds
- Ethereum JSON-RPC docs: https://ethereum.org/en/developers/docs/apis/json-rpc/
