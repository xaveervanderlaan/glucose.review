// Formatting and DOM helpers. All text goes in via textContent: data is untrusted.

export const RANGES = [
  { key: "very_low", label: "Very low", range: "<3.0" },
  { key: "low", label: "Low", range: "3.0–3.8" },
  { key: "in_range", label: "In range", range: "3.9–10.0" },
  { key: "high", label: "High", range: "10.1–13.9" },
  { key: "very_high", label: "Very high", range: ">13.9" },
];

/** Tiny element builder. Strings become text nodes; never parses HTML. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const fmt = {
  mmol: (v) => (v == null ? "–" : v.toFixed(1)),
  pct: (v, digits = 1) => (v == null ? "–" : `${v.toFixed(digits)}%`),
  num: (v, digits = 1) => (v == null ? "–" : v.toFixed(digits)),
  signed: (v, digits = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`),
};

export function clockFormatter(tz) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (epochSeconds) => f.format(new Date(epochSeconds * 1000));
}

/** "Thu 12 Nov 2026" from an ISO date (a local calendar date, no time zone involved). */
export function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Days between two ISO dates (b − a). */
export function daysBetween(a, b) {
  const utc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** "Week 46 (9–15 Nov 2026)" from an ISO week such as "2026-W46" (Monday to Sunday). */
export function weekLabel(week) {
  const [year, number] = week.split("-W").map(Number);
  const jan4 = Date.UTC(year, 0, 4);
  const monday = new Date(jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86400000 + (number - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const f = (date, opts) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(date);
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const span =
    monday.getUTCMonth() === sunday.getUTCMonth()
      ? `${monday.getUTCDate()}–${f(sunday, { day: "numeric", month: "short", year: "numeric" })}`
      : `${f(monday, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${f(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
  return `Week ${number} (${span})`;
}

function tzOffsetMs(epochMs, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - epochMs;
}

/** Epoch seconds of local 00:00 on an ISO date in `tz` (DST-safe). */
export function localMidnight(iso, tz) {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t / 1000;
}

export function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A "Show as table" disclosure: the accessible twin of every chart. */
export function tableView(summary, headers, rows) {
  return h(
    "details",
    { class: "table-view" },
    h("summary", {}, summary),
    h(
      "div",
      { class: "table-scroll" },
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, headers.map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, rows.map((r) => h("tr", {}, r.map((cell) => h("td", {}, cell))))),
      ),
    ),
  );
}
