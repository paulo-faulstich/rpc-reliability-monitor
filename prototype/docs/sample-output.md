# Sample output

First successful local run on 2026-06-30 using the default public Ethereum Sepolia RPC endpoint.

```text
Chainlink RPC Reliability Monitor
Network target: Ethereum Sepolia
Feed: BTC/USD
Feed contract: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43

Provider  Status  Latency  Chain     Block     Answer        Updated                   Age   Stale
public    ok      220ms    11155111  11173409  58943.648789  2026-06-30 14:02:24 UTC  57m   no

Summary
- Providers checked: 1
- Healthy providers: 1
- Answer consistency: ok
- Block consistency: ok
- Stale threshold: 1d
- Recommended primary: public
- Fallback candidates: none
```

## Alchemy + public RPC comparison

Run on 2026-06-30 after enabling Ethereum Sepolia in Alchemy and adding the HTTPS endpoint to `.env`.

```text
Chainlink RPC Reliability Monitor
Network target: Ethereum Sepolia
Feed: BTC/USD
Feed contract: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43

Provider  Status  Latency  Chain     Block     Answer       Updated                   Age  Stale
alchemy   ok      256ms    11155111  11173483  58329.89274  2026-06-30 15:01:48 UTC  12m  no
public    ok      250ms    11155111  11173483  58329.89274  2026-06-30 15:01:48 UTC  12m  no

Summary
- Providers checked: 2
- Healthy providers: 2
- Answer consistency: ok
- Block consistency: ok
- Stale threshold: 1d
- Recommended primary: public
- Fallback candidates: alchemy
```
