# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`glucose.review` is the **public, static dashboard** (GitHub Pages) for a personal T1D / AAPS / Nightscout
settings review. A separate private repo, `../glucose.review.agent` (Python), fetches Nightscout data
every day, computes metrics and commits them here with a template review. A Claude Code cloud
scheduled task then replaces the review text (`llm.ok` turns true; SPEC D34).

**Read `docs/SPEC.md` (the decision log in §2) and `docs/PLAN.md` before making changes.** `docs/` is
gitignored on purpose: it's local planning material and never published. When the implementation turns
out differently from the spec, update SPEC.md first. PLAN.md tracks milestones M0–M7 and which tasks
are done.

## Ownership boundary

- This repo owns the **site code**: `index.html`, `assets/`, `robots.txt`, `.nojekyll`, and later `CNAME`.
- `data/**` and `reports/**` are **written only by the agent**, with one data commit and one review commit per day. Don't edit them
  by hand. Change the agent instead, because its next run would overwrite manual edits.

## Architecture

- **No build step**: plain `index.html` + ES modules. Libraries (uPlot, marked, DOMPurify) are vendored
  and pinned in `assets/vendor/`. There are no runtime requests to third parties. Pages serves `main` from the root.
- The site reads three entry points with **relative URLs**, so it works under both
  `<user>.github.io/glucose.review/` and the future `glucose.review` domain:
  - `data/latest.json`: everything for the current view, i.e. windows 1d/14d/90d, AGP, hourly,
    yesterday's trace, profile, findings, changes and `llm.ok`.
  - `data/history.json`: one aggregate row per day, for the trend charts.
  - `reports/index.json`: listing of the daily (`reports/daily/YYYY/…md`) and weekly (`reports/weekly/YYYY/YYYY-Www.md`) reports.
- The JSON shapes are defined in SPEC §8, and the JSON Schemas live in the agent repo. The dashboard
  checks the **major** `schema_version` and shows a banner when it doesn't match.
- Markdown reports are LLM-written. They are rendered with marked and **always passed through DOMPurify**.
  Strip the YAML front matter before rendering.
- Hash routing: `#/`, `#/report/daily/YYYY-MM-DD`, `#/report/weekly/YYYY-Www`, `#/archive`.

## Domain rules the UI must respect

- Display in **mmol/L** to 1 decimal. Upstream data is mg/dL, converted with **18.0** (as AAPS and Nightscout do).
- Ranges: <3.0 / 3.0–3.8 / **3.9–10.0** (TIR) / 10.1–13.9 / >13.9, plus TITR 3.9–7.8. Colours: dark red,
  red, green, amber, orange. Values always carry a text label, so nothing depends on colour alone.
- Times use a 24h clock in the `timezone` from `latest.json` (Europe/Amsterdam). Timestamps in the data are epoch seconds (UTC).
- Findings express direction as `insulin_effect` (`more` / `less`). A *lower* ISF or IC number means *more* insulin, so don't reword this into "raise/lower ISF".
  The UI may show the AAPS number direction only from the agent's `value_direction` (never derive it), and always next to the insulin effect.
- Show a stale banner if `generated_at` is more than 36h old. Show an "auto-generated summary" badge when `llm.ok` is false.
- The footer disclaimer ("Personal data review, not medical advice.") stays on every view.

## Privacy constraints (the repo and the site are public)

- Every page carries `<meta name="robots" content="noindex, nofollow">`, and `robots.txt` contains `Disallow: /`.
- Never add the owner's name or email, the Nightscout URL, analytics or tracking.
- The site must never expect or show free-text notes, profile names or device identifiers. The agent
  doesn't publish them.

## Commands

There is no build, lint or test tooling. To preview locally:

```bash
python -m http.server 8000      # from the repo root
# http://localhost:8000/                  → real data (once the agent has published)
# http://localhost:8000/?base=dev/sample/ → synthetic sample data (safe to commit)
node --check assets/*.js        # quick syntax check
```

Regenerate the sample from the agent repo:
`uv run glucose-review sample --out ../glucose.review/dev/sample --date 2026-11-12`.

## Code map

- `assets/app.js`: boot, `?base=` data root (relative and same-origin only), banners, hash router.
- `assets/views.js`: Today / Trends / Archive / Report views. Each returns `{node, mount}`, and charts mount after the node is in the DOM.
- `assets/components.js`: hero, tiles, time-in-range bars, hourly strips, settings panel (next step,
  findings by setting, profile, changes with before→after).
- `assets/charts.js`: uPlot charts. Colours are read from CSS tokens at render time, and the router re-renders when the colour scheme flips.
- `assets/format.js`: the `h()` element builder (text only, never HTML), formatting, DST-safe `localMidnight`,
  `weekLabel("2026-W46")` → "Week 46 (9–15 Nov 2026)".
- `assets/vendor/`: pinned uPlot, marked and DOMPurify. See `VERSIONS.md`, and re-verify integrity when updating.

## Visual rules

- The range colours in `assets/styles.css` were chosen with the dataviz palette validator. Adjacent
  colour-blind ΔE is ≥ 10 in both light and dark mode. Don't change them without re-running it.
  Light: `#89312f #c1645b #006516 #d09a21 #d73e00`. Dark: `#c90019 #ce7067 #007617 #c28500 #c53e00`.
- Every chart has a "Show as table" twin, and tooltips only add detail, never gate it. Text uses the ink
  tokens, never series colours. Lines are 2px, grids are solid hairlines (the only dashed line is the
  7.8 threshold), and there's never a dual axis.
