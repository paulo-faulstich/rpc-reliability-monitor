const $ = (selector) => document.querySelector(selector);

const elements = {
  primary: $("#primary"),
  primaryNote: $("#primaryNote"),
  healthy: $("#healthy"),
  healthyNote: $("#healthyNote"),
  answerConsistency: $("#answerConsistency"),
  answerNote: $("#answerNote"),
  blockConsistency: $("#blockConsistency"),
  blockNote: $("#blockNote"),
  feedTitle: $("#feedTitle"),
  feedDetails: $("#feedDetails"),
  error: $("#error"),
  results: $("#results"),
  startFetch: $("#startFetch"),
  stopFetch: $("#stopFetch"),
  refreshMeta: $("#refreshMeta"),
  nextRefresh: $("#nextRefresh"),
  progressBar: $("#progressBar"),
  history: $("#history"),
  recentChecks: $("#recentChecks"),
  providerList: $("#providerList"),
  feedFacts: $("#feedFacts"),
  chart: $("#chart"),
  chartLegend: $("#chartLegend"),
  chartSub: $("#chartSub"),
};

const views = ["overview", "providers", "activity", "about"];
const refreshIntervalMs = 10_000;
const maxChecks = 30;
const seriesColors = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

const history = []; // newest first, one entry per check
const samples = []; // oldest first: { time, primary, byProvider: { name: { ms, ok } } }
let providerOrder = [];
let lastReport = null;
let nextRefreshAt = null;
let isLoading = false;
let isFetching = false;
let refreshTimer = null;

elements.startFetch.addEventListener("click", startFetching);
elements.stopFetch.addEventListener("click", stopFetching);
window.addEventListener("hashchange", showView);
window.addEventListener("resize", renderChart);

setInterval(tickCountdown, 250);
showView();
setIdleState();

/* ── Navigation ─────────────────────────────────────────── */

function showView() {
  const requested = location.hash.replace("#", "");
  const active = views.includes(requested) ? requested : "overview";

  for (const view of views) {
    $(`#view-${view}`).hidden = view !== active;
  }

  for (const link of document.querySelectorAll(".nav a")) {
    if (link.dataset.view === active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  if (active === "overview") renderChart();
}

/* ── Fetch loop ─────────────────────────────────────────── */

function startFetching() {
  if (isFetching) return;

  isFetching = true;
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
  tickCountdown();
}

async function loadMonitor() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  isLoading = true;
  setLoading(true);
  elements.error.hidden = true;

  try {
    const response = await fetch("/api/monitor", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`The monitor API returned HTTP ${response.status}. Check that the server is running.`);
    }

    const report = await response.json();
    record(report);
    render(report);
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

function record(report) {
  lastReport = report;
  providerOrder = report.config.providers?.length
    ? report.config.providers
    : report.results.map((result) => result.provider);

  const byProvider = {};
  for (const result of report.results) {
    byProvider[result.provider] = { ms: result.latencyMs, ok: isHealthy(result) };
  }

  samples.push({
    time: report.checkedAt,
    primary: report.summary.recommendedPrimary,
    byProvider,
  });
  if (samples.length > maxChecks) samples.shift();

  history.unshift({
    time: report.checkedAt,
    primary: report.summary.recommendedPrimary,
    healthy: report.summary.healthyProviders,
    checked: report.summary.providersChecked,
    consistent: report.summary.answerConsistency === "ok",
    fastest: fastest(report.results),
  });
  history.splice(maxChecks);
}

/* ── Rendering ──────────────────────────────────────────── */

function render(report) {
  const { config, results, summary, checkedAt } = report;
  const primaryResult = results.find((result) => result.provider === summary.recommendedPrimary);
  const allHealthy = summary.healthyProviders === summary.providersChecked;
  const answersOk = summary.answerConsistency === "ok";
  const blocksOk = summary.blockConsistency === "ok";
  const blocks = results.map((result) => result.blockNumber).filter((block) => block != null);

  elements.feedTitle.textContent = `${config.feedName} on ${config.networkName}`;
  elements.feedDetails.textContent = `Contract ${shortAddress(config.feedAddress)}, last checked at ${formatTime(checkedAt)}`;

  elements.primary.textContent = summary.recommendedPrimary || "None";
  elements.primary.classList.toggle("is-bad", !summary.recommendedPrimary);
  elements.primary.classList.toggle("provider", Boolean(summary.recommendedPrimary));
  elements.primaryNote.textContent = summary.recommendedPrimary
    ? summary.fallbackCandidates.length
      ? `Fallback: ${summary.fallbackCandidates.join(", ")}`
      : "No healthy fallback"
    : "No provider is healthy right now";

  elements.healthy.textContent = `${summary.healthyProviders} of ${summary.providersChecked}`;
  elements.healthy.classList.toggle("is-bad", summary.healthyProviders === 0);
  elements.healthyNote.textContent = allHealthy
    ? "All responding with fresh data"
    : `${summary.unhealthyProviders} failing or stale`;

  elements.answerConsistency.textContent = answersOk ? "In agreement" : "Mismatch";
  elements.answerConsistency.classList.toggle("is-bad", !answersOk);
  elements.answerNote.textContent = answersOk
    ? "Same price everywhere"
    : "Providers disagree on price";

  elements.blockConsistency.textContent = blocksOk ? "In sync" : "Heights differ";
  elements.blockNote.textContent = blocks.length
    ? blocksOk
      ? `Block ${formatNumber(Math.max(...blocks))}`
      : blockGap(Math.max(...blocks) - Math.min(...blocks))
    : "No block returned";

  renderProviderList(results, summary);
  renderFacts(config, primaryResult);
  renderTable(results);
  renderChecks(elements.recentChecks, history.slice(0, 4));
  renderChecks(elements.history, history);
  renderChart();
}

function renderProviderList(results, summary) {
  const slowest = Math.max(...results.map((result) => result.latencyMs), 1);

  elements.providerList.innerHTML = results
    .map((result) => {
      const failed = result.status !== "ok";
      const width = failed ? 100 : Math.max(6, (result.latencyMs / slowest) * 100);
      const color = failed ? "var(--bad)" : colorFor(result.provider);
      const detail = failed
        ? `<span class="is-bad">${escapeHtml(result.error || "Request failed")}</span>`
        : `<span>Block ${formatNumber(result.blockNumber)}</span><span>Feed updated ${escapeHtml(result.ageLabel ?? "-")} ago</span>`;

      return `
        <div class="prov">
          <div class="prov-top">
            <span class="swatch" style="--c:${colorFor(result.provider)}"></span>
            <span class="prov-name provider">${escapeHtml(result.provider)}</span>
            ${result.provider === summary.recommendedPrimary ? '<span class="prov-tag">Primary</span>' : ""}
            <span class="prov-ms">${failed ? statusPill(result) : `${result.latencyMs} ms`}</span>
          </div>
          <div class="bar" style="--c:${color}"><span style="width:${width}%"></span></div>
          <div class="prov-meta">${detail}</div>
        </div>`;
    })
    .join("");
}

function renderFacts(config, primaryResult) {
  const rows = [
    ["big", config.feedName, formatAnswer(primaryResult?.answer)],
    ["", "Last on-chain update", primaryResult?.ageLabel ? `${primaryResult.ageLabel} ago` : "-"],
    ["", "Counts as stale after", config.staleAfterLabel],
    ["", "Round", primaryResult?.roundId ? shortId(primaryResult.roundId) : "-"],
    ["", "Contract", shortAddress(config.feedAddress)],
  ];

  elements.feedFacts.innerHTML = rows
    .map(
      ([cls, term, value]) =>
        `<div class="${cls}"><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join("");
}

function renderTable(results) {
  elements.results.innerHTML = results
    .map((result) => {
      const stats = sessionStats(result.provider);
      return `
        <tr>
          <td>
            <div class="cell-provider">
              <span class="swatch" style="--c:${colorFor(result.provider)}"></span>
              <span class="provider">${escapeHtml(result.provider)}</span>
            </div>
            ${result.error ? `<div class="provider-error">${escapeHtml(result.error)}</div>` : ""}
          </td>
          <td>${statusPill(result)}</td>
          <td class="num">${result.latencyMs} ms</td>
          <td class="num">${stats.median == null ? "-" : `${stats.median} ms`}</td>
          <td class="num">${stats.success}</td>
          <td class="num">${result.blockNumber == null ? "-" : formatNumber(result.blockNumber)}</td>
          <td class="num">${escapeHtml(formatAnswer(result.answer))}</td>
          <td class="num">${escapeHtml(result.ageLabel ?? "-")}</td>
        </tr>`;
    })
    .join("");
}

function renderChecks(target, items) {
  if (items.length === 0) {
    target.innerHTML = `<div class="empty">No checks yet. Start monitoring and each check is logged here.</div>`;
    return;
  }

  target.innerHTML = items
    .map((item) => {
      const pill = !item.primary
        ? '<span class="pill bad">No primary</span>'
        : !item.consistent
          ? '<span class="pill warn">Mismatch</span>'
          : item.healthy < item.checked
            ? '<span class="pill warn">Degraded</span>'
            : '<span class="pill ok">Healthy</span>';

      return `
        <div class="check">
          <time>${formatTime(item.time)}</time>
          <span>Primary <b class="provider">${escapeHtml(item.primary || "none")}</b></span>
          <span class="opt"><b>${item.healthy}/${item.checked}</b> up</span>
          <span class="opt">Fastest <b><span class="provider">${escapeHtml(item.fastest.provider)}</span>${item.fastest.ms == null ? "" : `, ${item.fastest.ms} ms`}</b></span>
          ${pill}
        </div>`;
    })
    .join("");
}

/* ── Latency chart ──────────────────────────────────────── */

function renderChart() {
  const el = elements.chart;

  if (samples.length === 0) {
    elements.chartLegend.innerHTML = "";
    el.innerHTML = `<div class="empty">Start monitoring to plot how fast each provider answers.</div>`;
    return;
  }

  const width = el.clientWidth;
  const height = el.clientHeight;
  if (!width || !height) return;

  const pad = { left: 54, right: 10, top: 10, bottom: 24 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const count = samples.length;

  const values = samples.flatMap((sample) =>
    Object.values(sample.byProvider)
      .filter((point) => point.ok)
      .map((point) => point.ms)
  );
  const top = niceCeil(Math.max(...values, 50) * 1.08);
  const x = (index) => pad.left + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
  const y = (ms) => pad.top + plotH - (Math.min(ms, top) / top) * plotH;
  const baseline = pad.top + plotH;
  const primary = samples[count - 1].primary;

  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Response time per provider over the last ${count} checks">`;
  svg += `<defs><linearGradient id="primaryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cssColor(primary)}" stop-opacity="0.26"/><stop offset="1" stop-color="${cssColor(primary)}" stop-opacity="0"/></linearGradient></defs>`;

  for (const fraction of [0, 0.5, 1]) {
    const lineY = pad.top + plotH - fraction * plotH;
    svg += `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${lineY}" y2="${lineY}"/>`;
    svg += `<text x="${pad.left - 10}" y="${lineY + 4}" text-anchor="end">${Math.round(top * fraction)} ms</text>`;
  }

  svg += `<text x="${pad.left}" y="${height - 4}">${formatTime(samples[0].time)}</text>`;
  if (count > 1) {
    svg += `<text x="${width - pad.right}" y="${height - 4}" text-anchor="end">${formatTime(samples[count - 1].time)}</text>`;
  }

  // Primary goes last so its line and fill sit on top.
  const ordered = [...providerOrder].sort((a, b) => (a === primary) - (b === primary));

  for (const provider of ordered) {
    const color = cssColor(provider);
    const segments = [];
    let current = [];

    samples.forEach((sample, index) => {
      const point = sample.byProvider[provider];
      if (point?.ok) {
        current.push([x(index), y(point.ms)]);
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length) segments.push(current);

    for (const segment of segments) {
      const path = smoothPath(segment);
      if (provider === primary && segment.length > 1) {
        const first = segment[0];
        const last = segment[segment.length - 1];
        svg += `<path d="${path} L${last[0]},${baseline} L${first[0]},${baseline} Z" fill="url(#primaryFill)"/>`;
      }
      if (segment.length > 1) svg += `<path class="line" d="${path}" stroke="${color}"/>`;
      const end = segment[segment.length - 1];
      svg += `<circle cx="${end[0]}" cy="${end[1]}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    }
  }

  svg += "</svg>";
  el.innerHTML = svg;

  const latest = samples[count - 1].byProvider;
  elements.chartLegend.innerHTML = providerOrder
    .map((provider) => {
      const point = latest[provider];
      const value = point?.ok ? `${point.ms} ms` : "down";
      return `<span><i class="swatch" style="--c:${colorFor(provider)}"></i><span class="provider">${escapeHtml(provider)}</span><b>${value}</b></span>`;
    })
    .join("");
  elements.chartSub.textContent =
    count === 1 ? "First check of this session" : `Last ${count} checks, one every ${refreshIntervalMs / 1000}s`;
}

function smoothPath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = (x0 + x1) / 2;
    d += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
  }
  return d;
}

function niceCeil(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/* ── Status and helpers ─────────────────────────────────── */

function isHealthy(result) {
  return result.status === "ok" && !result.stale;
}

function statusPill(result) {
  if (isHealthy(result)) return '<span class="pill ok">Healthy</span>';
  if (result.status === "ok") return '<span class="pill warn">Stale</span>';
  return '<span class="pill bad">Error</span>';
}

function fastest(results) {
  const healthy = results.filter(isHealthy).sort((a, b) => a.latencyMs - b.latencyMs);
  return healthy[0]
    ? { provider: healthy[0].provider, ms: healthy[0].latencyMs }
    : { provider: "none", ms: null };
}

function sessionStats(provider) {
  const points = samples.map((sample) => sample.byProvider[provider]).filter(Boolean);
  const good = points.filter((point) => point.ok).map((point) => point.ms).sort((a, b) => a - b);
  const median = good.length ? good[Math.ceil(good.length / 2) - 1] : null;
  return { median, success: `${good.length}/${points.length}` };
}

function colorIndex(provider) {
  const index = providerOrder.indexOf(provider);
  return (index < 0 ? 0 : index) % seriesColors.length;
}

function colorFor(provider) {
  return seriesColors[colorIndex(provider)];
}

// SVG gradient stops need a resolved colour, not a var() reference.
function cssColor(provider) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--s${colorIndex(provider)}`)
    .trim();
}

function setLoading(loading) {
  elements.startFetch.disabled = loading || isFetching;
  elements.stopFetch.disabled = !isFetching;
}

function tickCountdown() {
  elements.refreshMeta.classList.toggle("is-live", isFetching);

  if (isLoading) {
    elements.nextRefresh.textContent = "Checking providers…";
    elements.progressBar.style.width = "100%";
    return;
  }

  if (!isFetching || !nextRefreshAt) {
    elements.nextRefresh.textContent = "Monitoring paused";
    elements.progressBar.style.width = "0%";
    return;
  }

  const remaining = Math.max(0, nextRefreshAt - Date.now());
  const elapsed = refreshIntervalMs - remaining;
  const progress = Math.min(100, Math.max(0, (elapsed / refreshIntervalMs) * 100));

  elements.nextRefresh.textContent = `Next check in ${Math.ceil(remaining / 1000)}s`;
  elements.progressBar.style.width = `${progress}%`;
}

function setIdleState() {
  const idle = `<div class="empty">Nothing checked yet. Start monitoring to query each configured provider.</div>`;
  elements.providerList.innerHTML = idle;
  elements.feedFacts.innerHTML = `<div class="empty">Feed price and age appear after the first check.</div>`;
  elements.results.innerHTML = `<tr><td colspan="8"><div class="empty">Nothing checked yet. Start monitoring to compare Alchemy, Infura, QuickNode or any configured provider.</div></td></tr>`;
  renderChecks(elements.recentChecks, []);
  renderChecks(elements.history, []);
  renderChart();
}

function shortAddress(address) {
  if (!address || address.length < 12) return address || "-";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function shortId(id) {
  return id.length > 12 ? `…${id.slice(-8)}` : id;
}

function formatAnswer(answer) {
  if (answer == null) return "-";
  const value = Number(answer);
  if (!Number.isFinite(value)) return answer;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function blockGap(gap) {
  return `Providers are ${formatNumber(gap)} ${gap === 1 ? "block" : "blocks"} apart`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
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
