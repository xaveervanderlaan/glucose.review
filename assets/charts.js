// uPlot charts: yesterday's glucose, insulin & carbs, AGP, trends.
// Specs: 2px lines, ≥8px markers with a 2px surface ring, hairline solid grid, washes for bands,
// crosshair + tooltip listing every series, and a table view next to every chart (in views.js).

import uPlot from "./vendor/uplot/uPlot.esm.js";
import { clockFormatter, cssVar, fmt, h, localMidnight, nextDay } from "./format.js";

const GAP_S = 15 * 60;

function alpha(hex, a) {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.replace(/./g, "$&$&") : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function theme() {
  return {
    ink: cssVar("--ink"),
    ink2: cssVar("--ink-2"),
    muted: cssVar("--muted"),
    grid: cssVar("--grid"),
    axis: cssVar("--axis"),
    surface: cssVar("--surface"),
    s1: cssVar("--series-1"),
    s2: cssVar("--series-2"),
    s3: cssVar("--series-3"),
    s7: cssVar("--series-7"),
    rIn: cssVar("--r-in"),
    rLow: cssVar("--r-low"),
  };
}

function axis(t, extra = {}) {
  return {
    stroke: t.muted,
    font: "12px system-ui, -apple-system, 'Segoe UI', sans-serif",
    grid: { stroke: t.grid, width: 1 },
    ticks: { stroke: t.axis, width: 1, size: 4 },
    ...extra,
  };
}

/** Mount a uPlot that follows its container's width. */
function mount(container, opts, data) {
  const plot = new uPlot({ ...opts, width: Math.max(280, container.clientWidth) }, data, container);
  const observer = new ResizeObserver(() => {
    const width = Math.max(280, container.clientWidth);
    if (Math.abs(plot.width - width) > 1) plot.setSize({ width, height: plot.height });
  });
  observer.observe(container);
  return plot;
}

/** One tooltip per chart; `render(u, t)` returns a Node for the hovered x value, or null. */
function tooltip(render) {
  let tip;
  const hide = () => {
    if (tip) tip.style.display = "none";
  };
  return {
    hooks: {
      init: (u) => {
        tip = h("div", { class: "tooltip", role: "status" });
        u.over.appendChild(tip);
        u.over.addEventListener("mouseleave", hide);
      },
      setCursor: (u) => {
        const { left, top } = u.cursor;
        if (left == null || left < 0) return hide();
        const content = render(u, u.posToVal(left, "x"));
        if (!content) return hide();
        tip.replaceChildren(content);
        tip.style.display = "block";
        const width = tip.offsetWidth;
        const x = left + 14 + width > u.over.clientWidth ? left - 14 - width : left + 14;
        tip.style.left = `${Math.max(0, x)}px`;
        tip.style.top = `${Math.max(0, Math.min((top ?? 0) - 8, u.over.clientHeight - tip.offsetHeight))}px`;
      },
    },
  };
}

function tipRow(color, value, label, kind = "line") {
  return h(
    "div",
    { class: "t-row" },
    color ? h("span", { class: kind === "dot" ? "key-dot" : "key-line", style: { background: color } }) : null,
    h("strong", {}, value),
    h("span", {}, label),
  );
}

/** Index of the last element of sorted `xs` that is ≤ x (or -1). */
function lastAtOrBefore(xs, x) {
  let lo = 0;
  let hi = xs.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function withGaps(points) {
  const xs = [];
  const ys = [];
  points.forEach(([t, v], i) => {
    if (i > 0 && t - points[i - 1][0] > GAP_S) {
      xs.push(points[i - 1][0] + 300);
      ys.push(null);
    }
    xs.push(t);
    ys.push(v);
  });
  return [xs, ys];
}

function dayRange(latest) {
  // Local midnight → next local midnight (23h or 25h on DST days).
  return [localMidnight(latest.report_date, latest.timezone), localMidnight(nextDay(latest.report_date), latest.timezone)];
}

function timeOpts(tz, end) {
  const clock = clockFormatter(tz);
  return {
    tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), tz),
    values: (u, splits) => splits.map((s) => (end != null && s >= end ? "" : clock(s))),
    clock,
  };
}

// -- yesterday: glucose ------------------------------------------------------------------

export function glucoseChart(container, latest) {
  const t = theme();
  const [x0, x1] = dayRange(latest);
  const { tzDate, values, clock } = timeOpts(latest.timezone, x1);
  const [xs, ys] = withGaps(latest.trace_1d.sgv);
  const lanes = [
    { items: latest.trace_1d.temp_targets, color: t.s7, label: (s) => `Temp target ${fmt.mmol(s.low)} (${s.reason})` },
    { items: latest.trace_1d.temporary_profiles, color: t.s3, label: (s) => `Profile ${s.pct}%` },
    { items: latest.trace_1d.suspends, color: t.muted, label: () => "Pump suspended" },
  ];

  const drawBand = (u) => {
    const { ctx, bbox } = u;
    const yHi = u.valToPos(10, "y", true);
    const yLo = u.valToPos(3.9, "y", true);
    ctx.save();
    ctx.fillStyle = alpha(t.rIn, 0.1);
    ctx.fillRect(bbox.left, yHi, bbox.width, yLo - yHi);
    ctx.strokeStyle = alpha(t.rIn, 0.7);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // a threshold, not a gridline
    const yTight = Math.round(u.valToPos(7.8, "y", true)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(bbox.left, yTight);
    ctx.lineTo(bbox.left + bbox.width, yTight);
    ctx.stroke();
    ctx.restore();
  };
  const drawLanes = (u) => {
    const { ctx, bbox } = u;
    const dpr = devicePixelRatio || 1;
    lanes.forEach((lane, i) => {
      ctx.fillStyle = lane.color;
      for (const s of lane.items) {
        const a = u.valToPos(s.start, "x", true);
        const b = u.valToPos(s.end, "x", true);
        ctx.beginPath();
        ctx.roundRect(a, bbox.top + i * 6 * dpr, Math.max(b - a, 3 * dpr), 4 * dpr, 2 * dpr);
        ctx.fill();
      }
    });
  };

  const plot = mount(
    container,
    {
      height: 240,
      tzDate,
      legend: { show: false },
      padding: [8, 8, 0, 0],
      cursor: { sync: { key: "yesterday" }, drag: { x: false, y: false }, points: { size: 8, width: 2, stroke: t.surface, fill: t.ink } },
      scales: {
        x: { time: true, range: () => [x0, x1] },
        y: { range: (u, min, max) => [Math.min(2, Math.floor(min ?? 2)), Math.max(14, Math.ceil((max ?? 14) + 0.5))] },
      },
      axes: [axis(t, { values }), axis(t, { size: 36, values: (u, v) => v.map((x) => x.toFixed(0)) })],
      series: [{}, { label: "Glucose", stroke: t.ink, width: 2, points: { show: false } }],
      hooks: { drawClear: [drawBand], draw: [drawLanes] },
      plugins: [
        tooltip((u, x) => {
          const i = lastAtOrBefore(xs, x + 150);
          if (i < 0 || ys[i] == null) return null;
          const rows = [h("div", { class: "t-head" }, clock(xs[i])), tipRow(t.ink, `${fmt.mmol(ys[i])} mmol/L`, "glucose")];
          lanes.forEach((lane) => {
            for (const s of lane.items) if (s.start <= x && x < s.end) rows.push(tipRow(lane.color, "", lane.label(s)));
          });
          return h("div", {}, rows);
        }),
      ],
    },
    [xs, ys],
  );
  return { plot, lanes: lanes.filter((l) => l.items.length) };
}

// -- yesterday: insulin & carbs ----------------------------------------------------------

export function insulinChart(container, latest) {
  const t = theme();
  const [x0, x1] = dayRange(latest);
  const { tzDate, values, clock } = timeOpts(latest.timezone, x1);
  const basal = latest.trace_1d.basal;
  const xs = [...basal.map((b) => b[0]), x1];
  const delivered = [...basal.map((b) => b[1]), basal.length ? basal[basal.length - 1][1] : null];
  const scheduled = [...basal.map((b) => b[2]), basal.length ? basal[basal.length - 1][2] : null];
  const maxBasal = Math.max(1, ...delivered.filter((v) => v != null), ...scheduled.filter((v) => v != null));
  const { boluses, carbs } = latest.trace_1d;
  const meals = boluses.filter((b) => b.kind !== "smb");
  const smbs = boluses.filter((b) => b.kind === "smb");
  const maxSmb = Math.max(0.1, ...smbs.map((b) => b.u));

  const drawMarkers = (u) => {
    const { ctx, bbox } = u;
    const dpr = devicePixelRatio || 1;
    const font = `${12 * dpr}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const laneCarbs = bbox.top + 9 * dpr;
    const laneBolus = bbox.top + 31 * dpr;
    const laneSmb = bbox.top + 62 * dpr; // tick baseline; ticks grow upwards to at most 14px
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "left"; // uPlot leaves "center" behind after drawing axes
    ctx.textBaseline = "middle";
    // SMBs: thin ticks, height ∝ units (dozens per day, so no labels).
    ctx.fillStyle = t.s1;
    for (const b of smbs) {
      const x = u.valToPos(b.t, "x", true);
      const hgt = (4 + 10 * (b.u / maxSmb)) * dpr;
      ctx.fillRect(x - dpr, laneSmb - hgt, 2 * dpr, hgt);
    }
    const ringed = (draw) => {
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = t.surface;
      draw();
      ctx.fill();
      ctx.stroke();
    };
    // Meal/correction boluses: downward triangles, labelled (a few per day).
    for (const b of meals) {
      const x = u.valToPos(b.t, "x", true);
      const r = 6 * dpr;
      ctx.fillStyle = t.s1;
      ringed(() => {
        ctx.beginPath();
        ctx.moveTo(x - r, laneBolus - r * 0.8);
        ctx.lineTo(x + r, laneBolus - r * 0.8);
        ctx.lineTo(x, laneBolus + r * 0.8);
        ctx.closePath();
      });
      ctx.fillStyle = t.ink2;
      ctx.fillText(`${b.u.toFixed(1)}U`, x + r + 3 * dpr, laneBolus);
    }
    // Carbs: circles, labelled with grams.
    for (const c of carbs) {
      const x = u.valToPos(c.t, "x", true);
      ctx.fillStyle = t.s2;
      ringed(() => {
        ctx.beginPath();
        ctx.arc(x, laneCarbs, 5 * dpr, 0, 2 * Math.PI);
      });
      ctx.fillStyle = t.ink2;
      ctx.fillText(`${c.g}g${c.duration_min ? " ext" : ""}`, x + 9 * dpr, laneCarbs);
    }
    ctx.restore();
  };

  const near = (items, x) => items.filter((b) => Math.abs(b.t - x) <= 150);
  const plot = mount(
    container,
    {
      height: 200,
      tzDate,
      legend: { show: false },
      padding: [8, 8, 0, 0],
      cursor: { sync: { key: "yesterday" }, drag: { x: false, y: false }, points: { show: false } },
      scales: { x: { time: true, range: () => [x0, x1] }, y: { range: () => [0, maxBasal * 2.4] } },
      axes: [
        axis(t, { values }),
        axis(t, { size: 36, values: (u, v) => v.map((x) => (x <= maxBasal * 1.05 ? x.toFixed(1) : "")) }),
      ],
      series: [
        {},
        { label: "Delivered basal", stroke: t.s1, width: 2, fill: alpha(t.s1, 0.1), paths: uPlot.paths.stepped({ align: 1 }), points: { show: false } },
        { label: "Scheduled basal", stroke: t.muted, width: 1, paths: uPlot.paths.stepped({ align: 1 }), points: { show: false } },
      ],
      hooks: { draw: [drawMarkers] },
      plugins: [
        tooltip((u, x) => {
          const i = lastAtOrBefore(xs, x);
          if (i < 0) return null;
          const rows = [
            h("div", { class: "t-head" }, clock(x)),
            tipRow(t.s1, `${fmt.num(delivered[i], 2)} U/h`, "delivered basal"),
            tipRow(t.muted, `${fmt.num(scheduled[i], 2)} U/h`, "scheduled"),
          ];
          for (const b of near(meals, x)) rows.push(tipRow(t.s1, `${b.u.toFixed(2)} U`, `${b.kind} bolus at ${clock(b.t)}`, "dot"));
          const smbNear = near(smbs, x);
          if (smbNear.length) rows.push(tipRow(t.s1, `${smbNear.reduce((a, b) => a + b.u, 0).toFixed(2)} U`, `SMB (${smbNear.length})`, "dot"));
          for (const c of near(carbs, x)) rows.push(tipRow(t.s2, `${c.g} g`, `carbs at ${clock(c.t)}${c.duration_min ? `, over ${c.duration_min} min` : ""}`, "dot"));
          return h("div", {}, rows);
        }),
      ],
    },
    [xs, delivered, scheduled],
  );
  return plot;
}

// -- AGP ---------------------------------------------------------------------------------

export function agpChart(container, latest) {
  const t = theme();
  const bins = latest.agp_14d.bins;
  const minutes = bins.map((b) => {
    const [hh, mm] = b.t.split(":").map(Number);
    return hh * 60 + mm;
  });
  const keys = ["p5", "p25", "p50", "p75", "p95"];
  const series = keys.map((k) => bins.map((b) => b[k]));
  // wrap to 24:00 so the profile closes the day
  minutes.push(1440);
  series.forEach((s) => s.push(s[0]));
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const hairline = (u) => {
    const { ctx, bbox } = u;
    ctx.save();
    ctx.strokeStyle = alpha(t.rIn, 0.8);
    ctx.lineWidth = 1;
    for (const v of [3.9, 10]) {
      const y = Math.round(u.valToPos(v, "y", true)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(bbox.left, y);
      ctx.lineTo(bbox.left + bbox.width, y);
      ctx.stroke();
    }
    ctx.restore();
  };
  const quiet = { stroke: "transparent", width: 0, points: { show: false } };
  return mount(
    container,
    {
      height: 240,
      legend: { show: false },
      padding: [8, 8, 0, 0],
      cursor: { drag: { x: false, y: false }, points: { show: false } },
      scales: {
        x: { time: false, range: () => [0, 1440] },
        y: { range: (u, min, max) => [Math.min(2, Math.floor(min ?? 2)), Math.max(14, Math.ceil((max ?? 14) + 0.5))] },
      },
      axes: [
        axis(t, {
          splits: (u) => (u.width < 560 ? [0, 360, 720, 1080, 1440] : [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]),
          values: (u, v) => v.map((m) => (m >= 1440 ? "" : hhmm(m))),
        }),
        axis(t, { size: 36, values: (u, v) => v.map((x) => x.toFixed(0)) }),
      ],
      series: [
        {},
        { label: "5th", ...quiet },
        { label: "25th", ...quiet },
        { label: "Median", stroke: t.s1, width: 2, points: { show: false } },
        { label: "75th", ...quiet },
        { label: "95th", ...quiet },
      ],
      bands: [
        { series: [5, 1], fill: alpha(t.s1, 0.1) },
        { series: [4, 2], fill: alpha(t.s1, 0.22) },
      ],
      hooks: { draw: [hairline] }, // on top of the bands, so both target lines stay visible
      plugins: [
        tooltip((u, x) => {
          const i = Math.max(0, Math.min(bins.length - 1, Math.round(x / 15)));
          const b = bins[i];
          if (b.p50 == null) return null;
          return h(
            "div",
            {},
            h("div", { class: "t-head" }, `${b.t}–${hhmm(minutes[i] + 15)}`),
            tipRow(alpha(t.s1, 0.35), `${fmt.mmol(b.p95)}`, "95th"),
            tipRow(alpha(t.s1, 0.6), `${fmt.mmol(b.p75)}`, "75th"),
            tipRow(t.s1, `${fmt.mmol(b.p50)} mmol/L`, "median"),
            tipRow(alpha(t.s1, 0.6), `${fmt.mmol(b.p25)}`, "25th"),
            tipRow(alpha(t.s1, 0.35), `${fmt.mmol(b.p5)}`, "5th"),
          );
        }),
      ],
    },
    [minutes, ...series],
  );
}

// -- trends ------------------------------------------------------------------------------

/** One y-scale per chart (never dual-axis). `lines`: [{label, color, values, digits, unit}] */
export function trendChart(container, { xs, lines, tz, height = 180, yRange, format }) {
  const t = theme();
  const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz });
  return mount(
    container,
    {
      height,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), tz),
      legend: { show: false },
      padding: [8, 8, 0, 0],
      cursor: { sync: { key: "trends" }, drag: { x: false, y: false }, points: { size: 8, width: 2, stroke: t.surface } },
      scales: { x: { time: true }, y: { range: yRange } },
      axes: [axis(t, { values: (u, v) => v.map((x) => dateFmt.format(new Date(x * 1000))) }), axis(t, { size: 40 })],
      series: [{}, ...lines.map((l) => ({ label: l.label, stroke: l.color, width: l.width ?? 2, points: { show: false }, fill: l.fill }))],
      plugins: [
        tooltip((u, x) => {
          const i = lastAtOrBefore(xs, x + 43200);
          if (i < 0) return null;
          return h(
            "div",
            {},
            h("div", { class: "t-head" }, dateFmt.format(new Date(xs[i] * 1000))),
            lines.map((l) => tipRow(l.color, format(l.values[i], l), l.label)),
          );
        }),
      ],
    },
    [xs, ...lines.map((l) => l.values)],
  );
}

export function seriesColor(name) {
  return cssVar(name);
}
