# 07 · Tech spec

## What the prototype does

For each configured provider, per cycle, it issues three JSON-RPC calls concurrently:

- `eth_chainId` — confirm the provider is on the expected network.
- `eth_blockNumber` — current head, for block-lag and consistency.
- `eth_call` to the feed contract with selector `0xfeaf968c` (`latestRoundData()`) — the
  Chainlink round.

Latency is wall-clock around the batch. A per-call `AbortController` timeout (default 5s)
means a slow provider is recorded as an error instead of blocking the cycle.

## Decoding the feed

`latestRoundData()` returns `(roundId, answer, startedAt, updatedAt, answeredInRound)`. The
response is split into 32-byte words; `answer` is decoded as a signed integer and scaled by
the feed's decimals. `updatedAt` drives freshness:

```
age   = now − updatedAt
stale = age > STALE_AFTER_SECONDS
```

## Scoring & recommendation

- A provider is **healthy** if status is ok **and** it is **not stale**.
- **Answer consistency** = ok when the set of distinct answers across successful providers ≤ 1;
  otherwise mismatch.
- **Block consistency** = ok when the set of distinct block numbers ≤ 1.
- **Primary** = healthy provider with the lowest latency.
- **Fallbacks** = remaining healthy providers, ascending by latency.

Freshness gates health deliberately: a provider that responds quickly with stale feed data
must not be recommended.

## Configuration

`.env`: `RPC_PROVIDERS` (`name=url`, comma-separated), `FEED_ADDRESS`, `FEED_NAME`,
`FEED_DECIMALS`, `RPC_TIMEOUT_MS`, `STALE_AFTER_SECONDS`. Secrets are gitignored.

## Path to production

- Replace per-cycle snapshots with sampled time series (p95/p99).
- Move recommendation behind a routing layer with hysteresis and circuit-breaking.
- Add alerting and persistence; expose a read-only status API.
- Generalize beyond one feed to a set of critical reads per product.

## Default target

Network: Ethereum Sepolia · Feed: BTC/USD · Contract
`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43` · Method `latestRoundData()`.
