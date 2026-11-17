<p align="center">
  <img src="assets/favicon.svg" alt="" width="64" height="64">
</p>

<h1 align="center">glucose.review</h1>

<p align="center">
  A daily, public dashboard for a personal type 1 diabetes settings review<br>
  (AAPS closed loop + Nightscout). Static site, no build step, updated every morning.
</p>

> **Personal data review, not medical advice.** Nothing here changes any pump or loop settings.
> Suggestions are advice only, and a human decides.

The live site is linked under **About** on the right. It runs on GitHub Pages and will later move to
`glucose.review`.

## What it shows

- **Today**: the latest daily review (written by Claude), summary tiles for 1, 14 and 90 days (mean, GMI,
  CV, GRI, coverage), a time-in-range bar, yesterday's glucose trace with boluses, carbs and basal,
  the 14-day AGP, an hour-by-hour strip, and a settings panel with the one suggested next step.
- **Trends**: time in range and mean/CV over 30 days to all time, with a 7-day rolling line.
- **Archive**: every daily review, plus the weekly settings review written each Monday.

Glucose is shown in **mmol/L** (converted from mg/dL with 18.0), with the consensus ranges
<3.0 / 3.0–3.8 / **3.9–10.0** / 10.1–13.9 / >13.9 and time in tight range 3.9–7.8.

## How it gets updated

```
AAPS ──► Nightscout ──► agent (private repo) ──► this repo: data/ + reports/ ──► GitHub Pages
                         fetch 90 days,              │
                         compute metrics             └──► Claude Code scheduled task
                         and findings                     rewrites the review text
```

1. Each morning a separate, private agent fetches 90 days of data from Nightscout with a read-only
   token. It computes the metrics and settings evidence deterministically and commits `data/` plus a
   template review to this repo.
2. A Claude Code scheduled task then reads only those published files and replaces the template with
   a plain-language review. Claude never computes numbers.
3. Pages serves `main` as is. The site loads three files with relative URLs: `data/latest.json`,
   `data/history.json` and `reports/index.json`.

`data/**` and `reports/**` are written only by the agent and the review task. Edits by hand would be
overwritten by the next run.

## Privacy

The repo and the site are public, so only what the dashboard needs is published:

- No name, email, Nightscout URL, tokens, free-text notes, profile names or device identifiers.
- The current data has raw CGM readings for yesterday only, and aggregates for every other day.
  Earlier daily traces do remain in the git history.
- Every page has `noindex, nofollow`, `robots.txt` disallows everything, and a strict
  Content-Security-Policy is set.
- No analytics, no tracking, and no requests to third parties at runtime. All libraries are vendored.

## Running it locally

There is no build, lint or test tooling. Serve the repo root with any static server:

```bash
python -m http.server 8000
```

- <http://localhost:8000/> shows the real data in `data/` and `reports/`.
- <http://localhost:8000/?base=dev/sample/> shows the synthetic sample data in `dev/sample/`.

Quick syntax check: `node --check assets/*.js`.

## Repository layout

```
index.html             single page, hash routes #/, #/trends, #/archive, #/report/…
assets/
  app.js               boot, data root, banners (stale data, schema mismatch), router
  views.js             Today / Trends / Archive / Report views
  components.js        tiles, time-in-range bars, hourly strips, settings panel
  charts.js            uPlot charts, colours read from CSS tokens
  buddy.js             the ASCII buddy on Today
  format.js            element builder, mmol/L and date formatting
  styles.css           range colour tokens (light and dark), mobile-first layout
  vendor/              pinned uPlot, marked, DOMPurify (see VERSIONS.md)
data/                  written daily by the agent: latest.json, history.json
reports/               daily and weekly reviews (Markdown) and index.json
dev/sample/            synthetic data for local development (not real)
```

## Built with

- Plain HTML, CSS and ES modules, with no framework and no bundler.
- [uPlot](https://github.com/leeoniya/uPlot) for the charts, [marked](https://github.com/markedjs/marked)
  for Markdown and [DOMPurify](https://github.com/cure53/DOMPurify) to sanitise every rendered review.
  Versions, licences and checksums are listed in [`assets/vendor/VERSIONS.md`](assets/vendor/VERSIONS.md).
- Range colours were checked for colour-blind safety in both light and dark mode, and every chart
  has a "Show as table" view.
