// Boot, data loading, banners and hash routing. No build step; ES modules only.

import { h, longDate } from "./format.js";
import { archiveView, reportView, todayView, trendsView } from "./views.js";

const SUPPORTED_SCHEMA_MAJOR = "1";
const STALE_AFTER_S = 36 * 3600;

/** `?base=dev/sample/` switches the data root (relative, same origin only). */
function dataBase() {
  const raw = new URLSearchParams(location.search).get("base") ?? "";
  const ok = /^[A-Za-z0-9_\-./]*$/.test(raw) && !raw.includes("..") && !raw.startsWith("/") && !raw.includes("//");
  if (!ok || !raw) return "./";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

async function getJSON(base, path) {
  const response = await fetch(base + path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function banners(latest) {
  const area = document.getElementById("banners");
  area.replaceChildren();
  const major = String(latest.schema_version ?? "").split(".")[0];
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    area.append(h("p", { class: "banner", role: "alert" }, h("strong", {}, "Data format changed. "), `This page expects version ${SUPPORTED_SCHEMA_MAJOR}.x and got ${latest.schema_version}. Some parts may not display correctly.`));
  }
  const age = Date.now() / 1000 - Date.parse(latest.generated_at) / 1000;
  if (age > STALE_AFTER_S) {
    area.append(h("p", { class: "banner", role: "alert" }, h("strong", {}, "Data is stale. "), `Last update was ${Math.floor(age / 3600)} hours ago; the daily run may have failed.`));
  }
}

function statusLine(latest) {
  const updated = new Intl.DateTimeFormat("en-GB", {
    timeZone: latest.timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(latest.generated_at));
  document.getElementById("status-line").textContent = `Report for ${longDate(latest.report_date)} · updated ${updated}`;
}

const state = { trendsRange: "90d", archiveFilter: "all" };
let ctx;

function route({ focus = true } = {}) {
  const app = document.getElementById("app");
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const name = parts[0] ?? "today";
  let view;
  if (name === "trends") {
    view = trendsView(ctx, state.trendsRange, (key) => {
      state.trendsRange = key;
      route({ focus: false });
    });
  } else if (name === "archive") {
    view = archiveView(ctx, state.archiveFilter, (key) => {
      state.archiveFilter = key;
      route({ focus: false });
    });
  } else if (name === "report") {
    view = reportView(ctx, parts[1], parts[2]);
  } else {
    view = todayView(ctx);
  }
  const current = name === "report" ? "archive" : ["trends", "archive"].includes(name) ? name : "today";
  for (const link of document.querySelectorAll(".tabs a")) {
    if (link.dataset.route === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  app.replaceChildren(view.node);
  view.mount();
  if (focus) app.focus({ preventScroll: false });
}

async function boot() {
  const base = dataBase();
  const app = document.getElementById("app");
  try {
    const [latest, history, index] = await Promise.all([
      getJSON(base, "data/latest.json"),
      getJSON(base, "data/history.json").catch(() => []),
      getJSON(base, "reports/index.json").catch(() => []),
    ]);
    ctx = { base, latest, history, index };
  } catch {
    app.replaceChildren(h("p", { class: "empty" }, "No data has been published yet."));
    return;
  }
  banners(ctx.latest);
  statusLine(ctx.latest);
  window.addEventListener("hashchange", () => route());
  // Charts read colours from CSS tokens: re-render when the colour scheme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => route({ focus: false }));
  route({ focus: false });
}

boot();
