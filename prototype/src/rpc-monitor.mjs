import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");

export function loadConfig() {
  loadDotEnv(join(rootDir, ".env"));

  return {
    networkName: process.env.NETWORK_NAME || "Ethereum Sepolia",
    providers: parseProviders(
      process.env.RPC_PROVIDERS ||
        "public=https://ethereum-sepolia-rpc.publicnode.com"
    ),
    feedAddress:
      process.env.FEED_ADDRESS ||
      "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    feedName: process.env.FEED_NAME || "BTC/USD",
    feedDecimals: Number.parseInt(process.env.FEED_DECIMALS || "8", 10),
    timeoutMs: Number.parseInt(process.env.RPC_TIMEOUT_MS || "5000", 10),
    staleAfterSeconds: Number.parseInt(
      process.env.STALE_AFTER_SECONDS || "86400",
      10
    ),
  };
}

export async function runMonitor(config = loadConfig()) {
  if (config.providers.length === 0) {
    throw new Error("No RPC providers configured. Set RPC_PROVIDERS in .env.");
  }

  const checkedAt = new Date();
  const results = await Promise.all(
    config.providers.map((provider) => inspectProvider(provider, config))
  );
  const summary = summarize(results, config);

  return {
    checkedAt: checkedAt.toISOString(),
    config: publicConfig(config),
    results,
    summary,
  };
}

export function printReport(report) {
  const { config, results, summary } = report;

  console.log("");
  console.log("Chainlink RPC Reliability Monitor");
  console.log(`Network target: ${config.networkName}`);
  console.log(`Feed: ${config.feedName}`);
  console.log(`Feed contract: ${config.feedAddress}`);
  console.log("");

  const rows = results.map((result) => ({
    Provider: result.provider,
    Status: result.status,
    Latency: `${result.latencyMs}ms`,
    Chain: result.chainId ?? "-",
    Block: result.blockNumber ?? "-",
    Answer: result.answer ?? "-",
    Updated: result.updatedAt ? formatDate(result.updatedAt) : "-",
    Age: result.ageSeconds !== null ? formatAge(result.ageSeconds) : "-",
    Stale: result.stale === null ? "-" : result.stale ? "yes" : "no",
    Error: result.error ?? "",
  }));

  console.table(rows);

  console.log("");
  console.log("Summary");
  console.log(`- Providers checked: ${summary.providersChecked}`);
  console.log(`- Healthy providers: ${summary.healthyProviders}`);
  console.log(`- Answer consistency: ${summary.answerConsistency}`);
  console.log(`- Block consistency: ${summary.blockConsistency}`);
  console.log(`- Stale threshold: ${formatAge(config.staleAfterSeconds)}`);
  console.log(`- Recommended primary: ${summary.recommendedPrimary || "none"}`);
  console.log(
    `- Fallback candidates: ${
      summary.fallbackCandidates.join(", ") || "none"
    }`
  );

  const errors = results.filter((result) => result.status === "error");
  if (errors.length > 0) {
    console.log("");
    console.log("Errors");
    for (const error of errors) {
      console.log(`- ${error.provider}: ${error.error}`);
    }
  }
}

export function formatDate(timestampSeconds) {
  return new Date(timestampSeconds * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
}

export function formatAge(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

async function inspectProvider(provider, cfg) {
  const started = Date.now();

  try {
    const [chainIdHex, blockNumberHex, roundDataHex] = await Promise.all([
      rpc(provider.url, "eth_chainId", [], cfg.timeoutMs),
      rpc(provider.url, "eth_blockNumber", [], cfg.timeoutMs),
      rpc(
        provider.url,
        "eth_call",
        [
          {
            to: cfg.feedAddress,
            data: "0xfeaf968c", // latestRoundData()
          },
          "latest",
        ],
        cfg.timeoutMs
      ),
    ]);

    const latencyMs = Date.now() - started;
    const roundData = decodeLatestRoundData(roundDataHex);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds =
      Number(roundData.updatedAt) > 0
        ? nowSeconds - Number(roundData.updatedAt)
        : null;

    return {
      provider: provider.name,
      status: "ok",
      latencyMs,
      chainId: Number.parseInt(chainIdHex, 16),
      blockNumber: Number.parseInt(blockNumberHex, 16),
      answer: formatAnswer(roundData.answer, cfg.feedDecimals),
      roundId: roundData.roundId.toString(),
      updatedAt: Number(roundData.updatedAt),
      ageSeconds,
      ageLabel: typeof ageSeconds === "number" ? formatAge(ageSeconds) : null,
      stale:
        typeof ageSeconds === "number"
          ? ageSeconds > cfg.staleAfterSeconds
          : true,
      error: null,
    };
  } catch (error) {
    return {
      provider: provider.name,
      status: "error",
      latencyMs: Date.now() - started,
      chainId: null,
      blockNumber: null,
      answer: null,
      roundId: null,
      updatedAt: null,
      ageSeconds: null,
      ageLabel: null,
      stale: null,
      error: error.message,
    };
  }
}

async function rpc(url, method, params, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (payload.error) {
      throw new Error(
        payload.error.message || `JSON-RPC error ${payload.error.code}`
      );
    }

    return payload.result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(results, config) {
  const successful = results.filter((result) => result.status === "ok");
  const healthy = successful
    .filter((result) => !result.stale)
    .sort((a, b) => a.latencyMs - b.latencyMs);
  const answerSet = new Set(successful.map((result) => result.answer));
  const blockSet = new Set(successful.map((result) => result.blockNumber));

  return {
    providersChecked: results.length,
    healthyProviders: healthy.length,
    unhealthyProviders: results.length - healthy.length,
    answerConsistency: answerSet.size <= 1 ? "ok" : "mismatch",
    blockConsistency:
      blockSet.size <= 1 ? "ok" : "different block heights",
    staleThresholdSeconds: config.staleAfterSeconds,
    staleThresholdLabel: formatAge(config.staleAfterSeconds),
    recommendedPrimary: healthy[0]?.provider ?? null,
    fallbackCandidates: healthy.slice(1).map((result) => result.provider),
  };
}

function decodeLatestRoundData(hex) {
  if (!hex || hex === "0x") {
    throw new Error("Empty eth_call response");
  }

  const clean = hex.replace(/^0x/, "");
  const words = clean.match(/.{1,64}/g) || [];

  if (words.length < 5) {
    throw new Error(`Unexpected latestRoundData response: ${hex}`);
  }

  return {
    roundId: unsigned(words[0]),
    answer: signed(words[1]),
    startedAt: unsigned(words[2]),
    updatedAt: unsigned(words[3]),
    answeredInRound: unsigned(words[4]),
  };
}

function unsigned(word) {
  return BigInt(`0x${word}`);
}

function signed(word) {
  const value = BigInt(`0x${word}`);
  const maxInt = 1n << 255n;
  const maxUint = 1n << 256n;

  return value >= maxInt ? value - maxUint : value;
}

function formatAnswer(answer, decimals) {
  const negative = answer < 0n;
  const value = negative ? -answer : answer;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const trimmedFraction = fractionText.replace(/0+$/, "").slice(0, 6);

  return `${negative ? "-" : ""}${whole.toString()}${
    trimmedFraction ? `.${trimmedFraction}` : ""
  }`;
}

function parseProviders(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("=");

      if (separator === -1) {
        return {
          name:
            entry.replace(/^https?:\/\//, "").split(/[/.]/)[0] || "provider",
          url: entry,
        };
      }

      return {
        name: entry.slice(0, separator).trim(),
        url: entry.slice(separator + 1).trim(),
      };
    })
    .filter((provider) => provider.url && !provider.url.includes("YOUR_KEY"));
}

function publicConfig(config) {
  return {
    networkName: config.networkName,
    feedName: config.feedName,
    feedAddress: config.feedAddress,
    staleAfterSeconds: config.staleAfterSeconds,
    staleAfterLabel: formatAge(config.staleAfterSeconds),
    providers: config.providers.map((provider) => provider.name),
  };
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

