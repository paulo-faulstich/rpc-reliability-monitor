// Samples every configured provider repeatedly and writes a measured report.
// Usage: npm run benchmark            (30 cycles, 10s apart, about 5 minutes)
//        BENCH_SAMPLES=60 BENCH_INTERVAL_MS=5000 npm run benchmark
// Output: docs/benchmark-results.md and docs/benchmark-results.json
// Provider URLs (which carry API keys) are never written to the output.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, runMonitor } from "./rpc-monitor.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const docsDir = join(__dirname, "..", "docs");

const samples = positiveInt(process.env.BENCH_SAMPLES, 30);
const intervalMs = positiveInt(process.env.BENCH_INTERVAL_MS, 10000);

const config = loadConfig();

if (config.providers.length === 0) {
  console.error("No RPC providers configured. Set RPC_PROVIDERS in .env.");
  process.exit(1);
}

console.log(
  `Benchmarking ${config.providers.length} provider(s): ${samples} cycles, ${intervalMs}ms apart.`
);

const cycles = [];

for (let index = 0; index < samples; index += 1) {
  const report = await runMonitor(config);
  cycles.push(report);

  const line = report.results
    .map((r) => `${r.provider} ${r.status === "ok" ? `${r.latencyMs}ms` : "ERR"}`)
    .join(" | ");
  console.log(`[${index + 1}/${samples}] ${line}`);

  if (index < samples - 1) await sleep(intervalMs);
}

const analysis = analyze(cycles, config);

mkdirSync(docsDir, { recursive: true });
writeFileSync(
  join(docsDir, "benchmark-results.json"),
  `${JSON.stringify(analysis, null, 2)}\n`
);
writeFileSync(join(docsDir, "benchmark-results.md"), renderMarkdown(analysis));

console.log("");
console.log("Wrote docs/benchmark-results.md and docs/benchmark-results.json");

function analyze(allCycles, cfg) {
  const names = cfg.providers.map((provider) => provider.name);
  const perProvider = Object.fromEntries(
    names.map((name) => [
      name,
      { latencies: [], ok: 0, errors: {}, lags: [], stale: 0, primary: 0 },
    ])
  );

  let answerMismatchCycles = 0;
  let healthyPrimaryCycles = 0;
  let primaryChanges = 0;
  let previousPrimary;

  for (const cycle of allCycles) {
    const okResults = cycle.results.filter((r) => r.status === "ok");
    const leadBlock = okResults.reduce(
      (max, r) => Math.max(max, r.blockNumber),
      0
    );

    for (const result of cycle.results) {
      const stats = perProvider[result.provider];
      if (!stats) continue;

      if (result.status === "ok") {
        stats.ok += 1;
        stats.latencies.push(result.latencyMs);
        stats.lags.push(leadBlock - result.blockNumber);
        if (result.stale) stats.stale += 1;
      } else {
        const key = result.error || "unknown error";
        stats.errors[key] = (stats.errors[key] || 0) + 1;
      }
    }

    const answerMismatch = cycle.summary.answerConsistency !== "ok";
    if (answerMismatch) answerMismatchCycles += 1;

    const primary = cycle.summary.recommendedPrimary;
    if (primary) {
      perProvider[primary].primary += 1;
      if (!answerMismatch) healthyPrimaryCycles += 1;
    }
    if (previousPrimary !== undefined && primary !== previousPrimary) {
      primaryChanges += 1;
    }
    previousPrimary = primary;
  }

  const total = allCycles.length;
  const startedAt = allCycles[0].checkedAt;
  const endedAt = allCycles[total - 1].checkedAt;
  const durationSeconds = Math.round(
    (new Date(endedAt) - new Date(startedAt)) / 1000
  );

  return {
    network: cfg.networkName,
    feed: cfg.feedName,
    feedAddress: cfg.feedAddress,
    startedAt,
    endedAt,
    durationSeconds,
    cycles: total,
    intervalMs,
    timeoutMs: cfg.timeoutMs,
    staleAfterSeconds: cfg.staleAfterSeconds,
    overall: {
      healthyPrimaryCycles,
      healthyPrimaryShare: ratio(healthyPrimaryCycles, total),
      answerMismatchCycles,
      primaryChanges,
    },
    providers: names.map((name) => {
      const stats = perProvider[name];
      const sorted = [...stats.latencies].sort((a, b) => a - b);

      return {
        provider: name,
        cycles: total,
        successes: stats.ok,
        successRate: ratio(stats.ok, total),
        latencyP50Ms: percentile(sorted, 50),
        latencyP95Ms: percentile(sorted, 95),
        latencyMaxMs: sorted.length ? sorted[sorted.length - 1] : null,
        cyclesBehindLeadBlock: stats.lags.filter((lag) => lag > 0).length,
        maxBlockLag: stats.lags.length ? Math.max(...stats.lags) : null,
        staleCycles: stats.stale,
        cyclesAsPrimary: stats.primary,
        errors: stats.errors,
      };
    }),
  };
}

// Nearest-rank percentile on an ascending array.
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function renderMarkdown(a) {
  const lines = [];
  const pct = (value) => (value === null ? "-" : `${(value * 100).toFixed(1)}%`);
  const ms = (value) => (value === null ? "-" : `${value}ms`);

  lines.push("# Benchmark results");
  lines.push("");
  lines.push(
    "Generated by `npm run benchmark`. Every number below was measured in this run; nothing is estimated."
  );
  lines.push("");
  lines.push(`- **Network:** ${a.network}`);
  lines.push(`- **Feed:** ${a.feed} (\`${a.feedAddress}\`)`);
  lines.push(`- **Window:** ${a.startedAt} to ${a.endedAt} (${a.durationSeconds}s)`);
  lines.push(`- **Cycles:** ${a.cycles}, one every ${a.intervalMs}ms`);
  lines.push(`- **Timeout per call:** ${a.timeoutMs}ms`);
  lines.push("");
  lines.push("## Per provider");
  lines.push("");
  lines.push(
    "| Provider | Success | p50 | p95 | Max | Cycles behind lead block | Max block lag | Stale cycles | Cycles as primary |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const p of a.providers) {
    lines.push(
      `| ${p.provider} | ${pct(p.successRate)} (${p.successes}/${p.cycles}) | ${ms(
        p.latencyP50Ms
      )} | ${ms(p.latencyP95Ms)} | ${ms(p.latencyMaxMs)} | ${
        p.cyclesBehindLeadBlock
      } | ${p.maxBlockLag ?? "-"} | ${p.staleCycles} | ${p.cyclesAsPrimary} |`
    );
  }
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push(
    `- **Cycles with a healthy, fresh, consistent primary (North Star):** ${pct(
      a.overall.healthyPrimaryShare
    )} (${a.overall.healthyPrimaryCycles}/${a.cycles})`
  );
  lines.push(`- **Cycles with an answer mismatch across providers:** ${a.overall.answerMismatchCycles}`);
  lines.push(
    `- **Primary recommendation changes (routing flap):** ${a.overall.primaryChanges}`
  );

  const withErrors = a.providers.filter((p) => Object.keys(p.errors).length > 0);
  if (withErrors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    lines.push("");
    for (const p of withErrors) {
      for (const [message, count] of Object.entries(p.errors)) {
        lines.push(`- ${p.provider}: ${message} (${count})`);
      }
    }
  }

  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "- Latency is the wall time for one cycle against a provider: `eth_chainId`, `eth_blockNumber` and the feed `eth_call` sent in parallel. It includes the network path from the machine that ran the benchmark."
  );
  lines.push(
    "- Percentiles use the nearest-rank method over successful cycles only."
  );
  lines.push(
    "- Block lag compares each provider with the highest block any provider returned in the same cycle. A lag of one block is normal propagation, not a fault."
  );
  lines.push(
    "- This is a short sample from a single location on a testnet. It supports comparing providers during the window above and says nothing about long-run reliability."
  );
  lines.push("");

  return lines.join("\n");
}

function ratio(part, whole) {
  return whole === 0 ? null : part / whole;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
