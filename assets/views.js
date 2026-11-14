// Views: Today (dashboard), Trends, Archive, Report. Each returns { node, mount } where mount()
// runs after the node is in the DOM (charts need a measured width).

import DOMPurify from "./vendor/dompurify/purify.es.mjs";
import { marked } from "./vendor/marked/marked.esm.js";
import { agpChart, glucoseChart, insulinChart, seriesColor, trendChart } from "./charts.js";
import { hourlyStrips, settingsCard, summaryCard, timeInRangesCard } from "./components.js";
import { clockFormatter, fmt, h, localMidnight, longDate, shortDate, tableView, weekLabel } from "./format.js";

const DAILY_ID = /^\d{4}-\d{2}-\d{2}$/;
const WEEKLY_ID = /^\d{4}-W\d{2}$/;

/** LLM-written Markdown is untrusted: strip front matter, parse, then always sanitize. */
export function renderMarkdown(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  const node = h("div", { class: "report" });
  node.innerHTML = DOMPurify.sanitize(marked.parse(body, { gfm: true, async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["img", "style", "form", "input", "iframe"],
  });
  for (const a of node.querySelectorAll("a")) a.rel = "noopener noreferrer";
  return node;
}

async function fetchText(ctx, path) {
  const response = await fetch(ctx.base + path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function legend(items) {
  return h(
    "ul",
    { class: "legend" },
    items.map(([kind, color, label]) =>
      h(
        "li",
        {},
        h("span", {
          class: kind,
          style: kind === "swatch" ? { background: color, opacity: "0.35" } : kind === "dashed" ? { borderTop: `2px dashed ${color}`, width: "16px", height: "0" } : { background: color },
        }),
        label,
      ),
    ),
  );
}

// -- Today -------------------------------------------------------------------------------

export function todayView(ctx) {
  const { latest } = ctx;
  const clock = clockFormatter(latest.timezone);

  const review = h(
    "section",
    { class: "card" },
    h("h2", {}, "Daily review", latest.llm.ok ? null : h("span", { class: "badge" }, "auto-generated summary")),
    h("p", { class: "loading" }, "Loading review…"),
  );

  const glucoseEl = h("div", { class: "chart", role: "img", "aria-label": "Glucose yesterday; values in the table below" });
  const insulinEl = h("div", { class: "chart", role: "img", "aria-label": "Basal, boluses and carbs yesterday; values in the table below" });
  const sgv = latest.trace_1d.sgv;
  const quarterHours = sgv.filter(([t]) => Math.round(t / 60) % 15 === 0);
  const treatments = [
    ...latest.trace_1d.boluses.filter((b) => b.kind !== "smb").map((b) => [b.t, `${b.kind} bolus`, `${b.u.toFixed(2)} U`]),
    ...latest.trace_1d.carbs.map((c) => [c.t, "carbs", `${c.g} g${c.duration_min ? ` over ${c.duration_min} min` : ""}`]),
  ].sort((a, b) => a[0] - b[0]);
  const smbTotal = latest.trace_1d.boluses.filter((b) => b.kind === "smb").reduce((a, b) => a + b.u, 0);

  const yesterday = h(
    "section",
    { class: "card" },
    h("h2", {}, `Yesterday · ${longDate(latest.report_date)}`),
    h("p", { class: "sub" }, "Glucose in mmol/L. Shaded: target 3.9–10.0. Dashed: tight range 7.8."),
    glucoseEl,
    h("div", { "data-legend": "glucose" }),
    h("div", { class: "chart-title" }, "Insulin & carbs (basal in U/h)"),
    insulinEl,
    legend([
      ["key-line", seriesColor("--series-1"), "Delivered basal"],
      ["key-line", seriesColor("--muted"), "Scheduled basal"],
      ["key-dot", seriesColor("--series-1"), "Bolus (▼) / SMB (tick)"],
      ["key-dot", seriesColor("--series-2"), "Carbs"],
    ]),
    tableView(
      "Show treatments as table",
      ["Time", "What", "Amount"],
      [...treatments.map(([t, what, amount]) => [clock(t), what, amount]), ["", "SMB total", `${smbTotal.toFixed(2)} U`]],
    ),
    tableView("Show glucose as table (every 15 min)", ["Time", "mmol/L"], quarterHours.map(([t, v]) => [clock(t), fmt.mmol(v)])),
  );

  const agpEl = h("div", { class: "chart", role: "img", "aria-label": "Ambulatory glucose profile, 14 days; values in the table below" });
  const agp = h(
    "section",
    { class: "card" },
    h("h2", {}, "Daily pattern · 14 days"),
    h("p", { class: "sub" }, "Ambulatory glucose profile (mmol/L): median with 25–75% and 5–95% bands. Lines: 3.9 and 10.0."),
    agpEl,
    legend([
      ["key-line", seriesColor("--series-1"), "Median"],
      ["swatch", seriesColor("--series-1"), "25–75% / 5–95%"],
    ]),
    tableView(
      "Show profile as table (hourly)",
      ["Time", "5th", "25th", "Median", "75th", "95th"],
      latest.agp_14d.bins.filter((_, i) => i % 4 === 0).map((b) => [b.t, fmt.mmol(b.p5), fmt.mmol(b.p25), fmt.mmol(b.p50), fmt.mmol(b.p75), fmt.mmol(b.p95)]),
    ),
    h("h3", {}, "By hour of day"),
    hourlyStrips(latest.hourly_14d),
  );

  const node = h("div", {}, summaryCard(latest), review, timeInRangesCard(latest), yesterday, agp, settingsCard(latest));

  const mount = () => {
    const { lanes } = glucoseChart(glucoseEl, latest);
    const glucoseLegend = [
      ["key-line", seriesColor("--ink"), "Glucose"],
      ["swatch", seriesColor("--r-in"), "Target 3.9–10.0"],
      ["dashed", seriesColor("--r-in"), "7.8"],
      ...lanes.map((lane) => ["key-line", lane.color, lane.items === latest.trace_1d.temp_targets ? "Temp target" : lane.items === latest.trace_1d.suspends ? "Pump suspended" : "Temporary profile"]),
    ];
    yesterday.querySelector("[data-legend=glucose]").replaceWith(legend(glucoseLegend));
    insulinChart(insulinEl, latest);
    agpChart(agpEl, latest);
    fetchText(ctx, latest.reports.daily)
      .then((text) => {
        const rendered = renderMarkdown(text);
        rendered.querySelector("h1")?.remove(); // the card already has a title
        review.querySelector(".loading").replaceWith(rendered);
        if (latest.reports.weekly_latest) {
          const week = latest.reports.weekly_latest.split("/").pop().replace(".md", "");
          review.append(h("p", {}, h("a", { href: `#/report/weekly/${week}` }, `Weekly settings review, ${weekLabel(week)} →`)));
        }
      })
      .catch(() => review.querySelector(".loading")?.replaceWith(h("p", { class: "empty" }, "The review for this day isn't available.")));
  };
  return { node, mount };
}

// -- Trends ------------------------------------------------------------------------------

const RANGE_DAYS = { "30d": 30, "90d": 90, "1y": 365, all: Infinity };

function rolling(rows, key, days = 7) {
  return rows.map((row, i) => {
    const values = [];
    for (let j = i; j >= 0 && row.x - rows[j].x < days * 86400; j--) if (key(rows[j]) != null) values.push(key(rows[j]));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
}

export function trendsView(ctx, rangeKey, setRange) {
  const tz = ctx.latest.timezone;
  const all = ctx.history.map((r) => ({ ...r, x: localMidnight(r.date, tz) + 43200 }));
  const cutoff = all.length ? all[all.length - 1].x - RANGE_DAYS[rangeKey] * 86400 : 0;
  // Roll over everything, then cut, so the first days of a range still have a full 7-day mean.
  const series = {
    tir: rolling(all, (r) => r.in_range),
    tight: rolling(all, (r) => r.tight),
    mean: rolling(all, (r) => r.mean),
    below: rolling(all, (r) => (r.very_low ?? 0) + (r.low ?? 0)),
  };
  const keep = all.map((r) => r.x > cutoff);
  const pick = (values) => values.filter((_, i) => keep[i]);
  const rows = all.filter((_, i) => keep[i]);
  const xs = rows.map((r) => r.x);

  const filters = h(
    "div",
    { class: "filters", role: "group", "aria-label": "Date range" },
    Object.keys(RANGE_DAYS).map((key) =>
      h("button", { type: "button", "aria-pressed": String(key === rangeKey), onclick: () => setRange(key) }, key === "all" ? "All" : key.replace("d", " days").replace("1y", "1 year")),
    ),
  );
  if (rows.length < 2) {
    return { node: h("div", {}, filters, h("p", { class: "empty" }, "Not enough history yet.")), mount: () => {} };
  }

  const tirEl = h("div", { class: "chart", role: "img", "aria-label": "Time in range trend; values in the table below" });
  const meanEl = h("div", { class: "chart", role: "img", "aria-label": "Mean glucose trend" });
  const belowEl = h("div", { class: "chart", role: "img", "aria-label": "Time below 3.9 trend" });
  const pctFormat = (v) => fmt.pct(v, 1);
  const node = h(
    "div",
    {},
    filters,
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Time in range"),
      h("p", { class: "sub" }, "7-day average, % of time"),
      tirEl,
      legend([
        ["key-line", seriesColor("--series-1"), "In range 3.9–10.0"],
        ["key-line", seriesColor("--series-3"), "Tight range 3.9–7.8"],
      ]),
    ),
    h("section", { class: "card" }, h("h2", {}, "Mean glucose"), h("p", { class: "sub" }, "7-day average, mmol/L"), meanEl),
    h("section", { class: "card" }, h("h2", {}, "Time below 3.9"), h("p", { class: "sub" }, "7-day average, % of time · goal <4%"), belowEl),
    h(
      "section",
      { class: "card" },
      h("h2", {}, "Daily values"),
      tableView(
        "Show as table",
        ["Date", "In range", "Tight", "Below 3.9", "Mean", "CV", "TDD", "Lows"],
        [...rows].reverse().map((r) => [shortDate(r.date), fmt.pct(r.in_range, 0), fmt.pct(r.tight, 0), fmt.pct((r.very_low ?? 0) + (r.low ?? 0)), fmt.mmol(r.mean), fmt.pct(r.cv, 0), fmt.num(r.tdd, 1), String(r.hypos_l1)]),
      ),
    ),
  );
  const mount = () => {
    trendChart(tirEl, {
      xs,
      tz,
      yRange: () => [0, 100],
      format: pctFormat,
      lines: [
        { label: "in range (7-day)", color: seriesColor("--series-1"), values: pick(series.tir) },
        { label: "tight range (7-day)", color: seriesColor("--series-3"), values: pick(series.tight) },
      ],
    });
    trendChart(meanEl, {
      xs,
      tz,
      height: 150,
      yRange: (u, min, max) => [Math.floor((min ?? 5) - 0.5), Math.ceil((max ?? 10) + 0.5)],
      format: (v) => `${fmt.mmol(v)} mmol/L`,
      lines: [{ label: "mean (7-day)", color: seriesColor("--series-1"), values: pick(series.mean) }],
    });
    trendChart(belowEl, {
      xs,
      tz,
      height: 150,
      yRange: (u, min, max) => [0, Math.max(5, Math.ceil(max ?? 5))],
      format: pctFormat,
      lines: [{ label: "below 3.9 (7-day)", color: seriesColor("--series-2"), values: pick(series.below) }],
    });
  };
  return { node, mount };
}

// -- Archive -----------------------------------------------------------------------------

export function archiveView(ctx, filter, setFilter) {
  const entries = ctx.index.filter((e) => filter === "all" || e.type === filter);
  const filters = h(
    "div",
    { class: "filters", role: "group", "aria-label": "Report type" },
    [
      ["all", "All"],
      ["daily", "Daily"],
      ["weekly", "Weekly"],
    ].map(([key, label]) => h("button", { type: "button", "aria-pressed": String(key === filter), onclick: () => setFilter(key) }, label)),
  );
  const list = entries.length
    ? h(
        "ul",
        { class: "archive-list" },
        entries.map((e) =>
          h(
            "li",
            {},
            h(
              "a",
              { href: e.type === "daily" ? `#/report/daily/${e.date}` : `#/report/weekly/${e.week}` },
              h("span", {}, e.type === "daily" ? longDate(e.date) : `Weekly review, ${weekLabel(e.week)}`, e.llm_ok ? null : h("span", { class: "badge" }, "auto")),
              h("span", { class: "meta" }, e.tir == null ? "" : `TIR ${fmt.pct(e.tir, 0)}`),
            ),
          ),
        ),
      )
    : h("p", { class: "empty" }, "No reports yet.");
  return { node: h("div", {}, filters, h("section", { class: "card" }, list)), mount: () => {} };
}

// -- Report ------------------------------------------------------------------------------

export function reportView(ctx, type, id) {
  const valid = (type === "daily" && DAILY_ID.test(id)) || (type === "weekly" && WEEKLY_ID.test(id));
  const card = h("section", { class: "card" }, h("p", { class: "loading" }, "Loading report…"));
  const node = h("div", {}, h("a", { class: "back", href: "#/archive" }, "← Archive"), card);
  const mount = () => {
    const entry = ctx.index.find((e) => e.type === type && (e.date === id || e.week === id));
    if (!valid || !entry) {
      card.replaceChildren(h("p", { class: "empty" }, "Report not found."));
      return;
    }
    fetchText(ctx, entry.path)
      .then((text) => card.replaceChildren(renderMarkdown(text)))
      .catch(() => card.replaceChildren(h("p", { class: "empty" }, "This report couldn't be loaded.")));
  };
  return { node, mount };
}
