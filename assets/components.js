// Non-chart components: hero + tiles, time-in-range bars, hourly strips, settings panel.

import { RANGES, fmt, h, shortDate, tableView } from "./format.js";

const WINDOW_LABELS = { "1d": "Yesterday", "14d": "14 days", "90d": "90 days" };

function tile(label, value, unit, context) {
  return h(
    "div",
    { class: "tile" },
    h("div", { class: "label" }, label),
    h("div", { class: "value" }, value, unit ? h("small", {}, ` ${unit}`) : null),
    context ? h("div", { class: "context" }, context) : null,
  );
}

export function summaryCard(latest) {
  const day = latest.windows["1d"];
  const two = latest.windows["14d"];
  const tir = day.time_pct?.in_range;
  const tir14 = two.time_pct?.in_range;
  const delta = tir != null && tir14 != null ? tir - tir14 : null;
  const below = (w) => (w.time_pct ? w.time_pct.very_low + w.time_pct.low : null);

  const hero = h(
    "div",
    { class: "hero" },
    h("div", { class: "label" }, "Time in range yesterday"),
    h("div", { class: "value" }, tir == null ? "–" : tir.toFixed(0), h("small", {}, "%")),
    h(
      "div",
      { class: "context" },
      delta == null ? "" : `${fmt.signed(delta, 1)} pp vs 14-day ${fmt.pct(tir14, 0)} · goal >70%`,
    ),
  );
  const tiles = h(
    "div",
    { class: "tiles" },
    tile("Mean glucose", fmt.mmol(day.mean), "mmol/L", `14 days ${fmt.mmol(two.mean)}`),
    tile("Below 3.9", fmt.pct(below(day)), null, `14 days ${fmt.pct(below(two))} · goal <4%`),
    tile("Variability (CV)", fmt.pct(day.cv_pct, 0), null, `14 days ${fmt.pct(two.cv_pct, 0)} · goal ≤36%`),
    tile("GMI (14 days)", fmt.pct(two.gmi_pct), null, `${fmt.num(two.gmi_mmol_mol, 0)} mmol/mol`),
    tile("Tight range 3.9–7.8", fmt.pct(day.time_pct?.tight, 0), null, `14 days ${fmt.pct(two.time_pct?.tight, 0)}`),
    tile("CGM coverage", fmt.pct(day.coverage_pct, 0), null, `14 days ${fmt.pct(two.coverage_pct, 0)}`),
  );
  return h("section", { class: "card", "aria-label": "Summary" }, h("div", { class: "summary" }, hero, tiles));
}

function segBar(window) {
  const t = window.time_pct;
  if (!t) return h("div", { class: "empty" }, "No CGM data");
  const bar = h("div", { class: "segbar", role: "img", "aria-label": RANGES.map((r) => `${r.label} ${fmt.pct(t[r.key])}`).join(", ") });
  for (const r of RANGES) {
    const share = t[r.key];
    if (!share) continue; // a part at zero draws nothing
    const label = `${share.toFixed(0)}%`;
    const seg = h("div", {
      class: `seg ${r.key}`,
      style: { flex: `${share} 1 0` },
      tabindex: "0",
      title: `${r.label} (${r.range}): ${fmt.pct(share)}`,
    });
    // Only print a share inside the block when it fits (≈ 9px per character + padding).
    seg.dataset.label = label;
    bar.append(seg);
  }
  requestAnimationFrame(() => {
    for (const seg of bar.children) {
      if (seg.getBoundingClientRect().width >= seg.dataset.label.length * 8 + 12) seg.textContent = seg.dataset.label;
    }
  });
  return bar;
}

export function timeInRangesCard(latest) {
  const rows = ["1d", "14d", "90d"].map((key) => {
    const w = latest.windows[key];
    return h(
      "div",
      { class: "tir-row" },
      h("div", { class: "row-label" }, WINDOW_LABELS[key]),
      segBar(w),
      h("div", { class: "row-note" }, `Tight range 3.9–7.8: ${fmt.pct(w.time_pct?.tight, 0)} · ${w.hypos.l1} low${w.hypos.l1 === 1 ? "" : "s"}`),
    );
  });
  const legend = h(
    "ul",
    { class: "legend" },
    RANGES.map((r) => h("li", {}, h("span", { class: `swatch ${r.key}` }), `${r.label} ${r.range}`)),
  );
  const table = tableView(
    "Show as table",
    ["Window", ...RANGES.map((r) => r.label), "Tight", "Lows"],
    ["1d", "14d", "90d"].map((k) => {
      const w = latest.windows[k];
      return [WINDOW_LABELS[k], ...RANGES.map((r) => fmt.pct(w.time_pct?.[r.key])), fmt.pct(w.time_pct?.tight), String(w.hypos.l1)];
    }),
  );
  return h(
    "section",
    { class: "card" },
    h("h2", {}, "Time in ranges"),
    h("p", { class: "sub" }, "mmol/L, share of time with CGM data"),
    h("div", { class: "tir-rows" }, rows),
    legend,
    h("p", { class: "goals" }, "Consensus goals: in range >70%, below 3.9 <4%, below 3.0 <1%, above 10.0 <25%, above 13.9 <5%."),
    table,
  );
}

/** `scale(v)` maps a value to 0..1 on an absolute scale, so colours mean the same every day. */
function stripRow(label, hours, value, scale, color, describe) {
  return h(
    "div",
    { class: "strip-row" },
    h("div", { class: "row-label" }, label),
    h(
      "div",
      { class: "strip", role: "img", "aria-label": `${label} by hour` },
      hours.map((x) => {
        const v = value(x);
        const strength = v == null ? 0 : Math.round(100 * Math.max(0, Math.min(1, scale(v))));
        return h("div", {
          class: "cell",
          tabindex: "0",
          title: `${String(x.hour).padStart(2, "0")}:00 · ${describe(x)}`,
          style: strength ? { background: `color-mix(in oklch, ${color} ${strength}%, var(--surface-2))` } : {},
        });
      }),
    ),
  );
}

export function hourlyStrips(hourly) {
  const hours = h("div", { class: "hours", "aria-hidden": "true" }, [0, 6, 12, 18].map((x) => h("span", {}, `${String(x).padStart(2, "0")}:00`)));
  return h(
    "div",
    {},
    stripRow("In range", hourly, (x) => x.in_range, (v) => (v - 40) / 60, "var(--series-1)", (x) => `in range ${fmt.pct(x.in_range, 0)}, mean ${fmt.mmol(x.mean)}`),
    stripRow("Below 3.9", hourly, (x) => x.below, (v) => (v > 0 ? 0.15 + v / 10 : 0), "var(--series-2)", (x) => `below 3.9 ${fmt.pct(x.below)}, ${x.hypos} low${x.hypos === 1 ? "" : "s"}`),
    h("div", { class: "strip-row" }, h("div"), hours),
    h("p", { class: "goals" }, "Darker blue: more time in range (40% → 100%). Darker orange: more time below 3.9 (up to 10%+)."),
    tableView(
      "Show hours as table",
      ["Hour", "Mean", "In range", "Below 3.9", "Above 10.0", "Lows"],
      hourly.map((x) => [`${String(x.hour).padStart(2, "0")}:00`, fmt.mmol(x.mean), fmt.pct(x.in_range, 0), fmt.pct(x.below), fmt.pct(x.above, 0), String(x.hypos)]),
    ),
  );
}

function blockTable(title, unit, blocks, value) {
  return h(
    "div",
    {},
    h("h3", {}, title, h("span", { class: "badge" }, unit)),
    h("table", {}, h("tbody", {}, blocks.map((b) => h("tr", {}, h("td", {}, b.t), h("td", {}, value(b)))))),
  );
}

const SETTING_LABEL = { basal: "Basal", isf: "ISF", ic: "IC", target_low: "Target low", target_high: "Target high" };
const SETTING_UNIT = { basal: "U/h", isf: "mmol/L/U", ic: "g/U", target_low: "mmol/L", target_high: "mmol/L" };

export function settingsCard(latest) {
  const p = latest.profile;
  const findings = latest.findings.length
    ? h(
        "ul",
        { class: "changes" },
        latest.findings.map((f) =>
          h(
            "li",
            {},
            h("strong", {}, `${SETTING_LABEL[f.setting] ?? f.setting} ${f.block}`),
            ` · ${f.insulin_effect} insulin, ~${f.change_pct}% · ${f.confidence} confidence${f.status === "deferred" ? " · deferred (lows first)" : ""}`,
            h("div", { class: "sub" }, f.summary),
          ),
        ),
      )
    : h("p", { class: "empty" }, "Settings analysis arrives with the weekly review.");
  const changes = latest.changes.length
    ? h(
        "ul",
        { class: "changes" },
        [...latest.changes].reverse().map((c) =>
          h(
            "li",
            {},
            h("span", { class: "when" }, shortDate(c.date)),
            `${SETTING_LABEL[c.setting] ?? c.setting} ${c.block}: ${c.from} → ${c.to} ${SETTING_UNIT[c.setting] ?? ""}`,
          ),
        ),
      )
    : h("p", { class: "empty" }, "No setting changes in the last 90 days.");
  return h(
    "section",
    { class: "card" },
    h("h2", {}, "Settings review"),
    h("p", { class: "sub" }, "Current AAPS profile, recent changes and findings. Advice only, never applied automatically."),
    h("h3", {}, "Findings"),
    findings,
    h(
      "div",
      { class: "profile-grid" },
      blockTable("Basal", "U/h", p.basal, (b) => b.v.toFixed(2)),
      blockTable("ISF", "mmol/L/U", p.isf, (b) => b.v.toFixed(2)),
      blockTable("IC", "g/U", p.ic, (b) => b.v.toFixed(1)),
      blockTable("Target", "mmol/L", p.target, (b) => (b.low === b.high ? b.low.toFixed(1) : `${b.low.toFixed(1)}–${b.high.toFixed(1)}`)),
    ),
    h("h3", {}, "Recent changes"),
    changes,
  );
}
