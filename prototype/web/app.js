const elements = {
  primary: document.querySelector("#primary"),
  healthy: document.querySelector("#healthy"),
  answerConsistency: document.querySelector("#answerConsistency"),
  blockConsistency: document.querySelector("#blockConsistency"),
  feedTitle: document.querySelector("#feedTitle"),
  feedDetails: document.querySelector("#feedDetails"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error"),
  emptyState: document.querySelector("#emptyState"),
  results: document.querySelector("#results"),
  startFetch: document.querySelector("#startFetch"),
  stopFetch: document.querySelector("#stopFetch"),
  nextRefresh: document.querySelector("#nextRefresh"),
  progressBar: document.querySelector("#progressBar"),
  history: document.querySelector("#history"),
};

const refreshIntervalMs = 10_000;
const history = [];
let nextRefreshAt = null;
let isLoading = false;
let isFetching = false;
let refreshTimer = null;

elements.startFetch.addEventListener("click", () => {
  startFetching();
});

elements.stopFetch.addEventListener("click", () => {
  stopFetching();
});

setInterval(tickCountdown, 250);
setIdleState();

function startFetching() {
  if (isFetching) return;

  isFetching = true;
  elements.emptyState.hidden = true;
  elements.error.hidden = true;
  elements.startFetch.disabled = true;
  elements.stopFetch.disabled = false;
  loadMonitor();
}

function stopFetching() {
  isFetching = false;
  clearTimeout(refreshTimer);
  refreshTimer = null;
  nextRefreshAt = null;
  elements.startFetch.disabled = false;
  elements.stopFetch.disabled = true;
  elements.nextRefresh.textContent = "Auto-refresh paused";
  elements.progressBar.style.width = "0%";
}

async function loadMonitor() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  isLoading = true;
  setLoading(true);
  elements.error.hidden = true;

  try {
    const response = await fetch("/api/monitor", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Monitor API returned HTTP ${response.status}`);
    }

    const report = await response.json();
    render(report);
    pushHistory(report);
  } catch (error) {
    elements.error.textContent = error.message;
    elements.error.hidden = false;
  } finally {
    isLoading = false;
    setLoading(false);

    if (isFetching) {
      nextRefreshAt = Date.now() + refreshIntervalMs;
      refreshTimer = setTimeout(() => {
        if (isFetching && !isLoading) loadMonitor();
      }, refreshIntervalMs);
    }
  }
}

function render(report) {
  const { config, results, summary, checkedAt } = report;

  elements.primary.textContent = summary.recommendedPrimary || "None";
  elements.healthy.textContent = `${summary.healthyProviders}/${summary.providersChecked}`;
  elements.answerConsistency.textContent = summary.answerConsistency;
  elements.blockConsistency.textContent = summary.blockConsistency;

  elements.feedTitle.textContent = `${config.feedName} on ${config.networkName}`;
  elements.feedDetails.textContent = `Contract ${shortAddress(
    config.feedAddress
  )} · stale threshold ${config.staleAfterLabel} · checked ${formatTime(
    checkedAt
  )}`;

  elements.results.innerHTML = "";
  for (const result of results) {
    const row = document.createElement("tr");
    row.className = "result-row updated";
    row.innerHTML = `
      <td>
        <div class="provider-name">${escapeHtml(result.provider)}</div>
        ${result.error ? `<div class="provider-error">${escapeHtml(result.error)}</div>` : ""}
      </td>
      <td>${statusPill(result)}</td>
      <td>${result.latencyMs}ms</td>
      <td>${result.blockNumber ?? "-"}</td>
      <td>${result.answer ?? "-"}</td>
      <td>${result.ageLabel ?? "-"}</td>
      <td>${result.stale === null ? "-" : result.stale ? "yes" : "no"}</td>
    `;
    elements.results.appendChild(row);
  }
}

function pushHistory(report) {
  history.unshift({
    time: report.checkedAt,
    primary: report.summary.recommendedPrimary || "none",
    healthy: `${report.summary.healthyProviders}/${report.summary.providersChecked}`,
    consistency: report.summary.answerConsistency,
    fastestLatency: fastestLatency(report.results),
  });

  history.splice(5);
  renderHistory();
}

function renderHistory() {
  elements.history.innerHTML = "";

  for (const item of history) {
    const entry = document.createElement("div");
    entry.className = "history-entry";
    entry.innerHTML = `
      <span class="history-time">${formatTime(item.time)}</span>
      <span>primary <strong>${escapeHtml(item.primary)}</strong></span>
      <span>healthy <strong>${escapeHtml(item.healthy)}</strong></span>
      <span>fastest <strong>${escapeHtml(item.fastestLatency)}</strong></span>
      <span>consistency <strong>${escapeHtml(item.consistency)}</strong></span>
    `;
    elements.history.appendChild(entry);
  }
}

function fastestLatency(results) {
  const healthy = results
    .filter((result) => result.status === "ok" && !result.stale)
    .sort((a, b) => a.latencyMs - b.latencyMs);

  return healthy[0] ? `${healthy[0].provider} ${healthy[0].latencyMs}ms` : "none";
}

function statusPill(result) {
  const className =
    result.status === "ok" && !result.stale
      ? "pill ok"
      : result.status === "ok"
        ? "pill warn"
        : "pill bad";
  const label =
    result.status === "ok" && result.stale
      ? "stale"
      : result.status;

  return `<span class="${className}">${escapeHtml(label)}</span>`;
}

function setLoading(isLoading) {
  elements.loading.hidden = !isLoading;
  elements.startFetch.disabled = isLoading || isFetching;
  elements.stopFetch.disabled = !isFetching;
}

function tickCountdown() {
  if (isLoading) {
    elements.nextRefresh.textContent = "Querying RPC providers...";
    elements.progressBar.style.width = "100%";
    return;
  }

  if (!isFetching || !nextRefreshAt) {
    elements.nextRefresh.textContent = "Auto-refresh paused";
    elements.progressBar.style.width = "0%";
    return;
  }

  const remaining = Math.max(0, nextRefreshAt - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  const elapsed = refreshIntervalMs - remaining;
  const progress = Math.min(100, Math.max(0, (elapsed / refreshIntervalMs) * 100));

  elements.nextRefresh.textContent = `Auto-refresh in ${seconds}s`;
  elements.progressBar.style.width = `${progress}%`;
}

function setIdleState() {
  elements.healthy.textContent = "-";
  elements.answerConsistency.textContent = "-";
  elements.blockConsistency.textContent = "-";
  elements.results.innerHTML = `
    <tr>
      <td colspan="7" class="empty-table">
        No RPC checks yet. Click Start Fetch to query Alchemy, Infura, QuickNode, or any configured provider.
      </td>
    </tr>
  `;
  elements.history.innerHTML = `
    <div class="history-entry muted-entry">
      No live checks yet. Activity will appear here after fetching starts.
    </div>
  `;
}

function shortAddress(address) {
  if (!address || address.length < 12) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
