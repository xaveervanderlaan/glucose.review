# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`glucose.review` is the **public, static dashboard** (GitHub Pages) for a personal T1D / AAPS / Nightscout
settings review. A separate private repo, `../glucose.review.agent` (Python), fetches Nightscout data
every day, computes metrics, has Claude write a review, and commits the results here.

**Read `docs/SPEC.md` (the decision log in §2) and `docs/PLAN.md` before making changes.** `docs/` is
gitignored on purpose: it's local planning material and never published. When the implementation turns
out differently from the spec, update SPEC.md first. PLAN.md tracks milestones M0–M7 and which tasks
are done.

## Ownership boundary

- This repo owns the **site code**: `index.html`, `assets/`, `robots.txt`, `.nojekyll`, and later `CNAME`.
- `data/**` and `reports/**` are **written only by the agent**, with one commit per day. Don't edit them
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
- Show a stale banner if `generated_at` is more than 36h old. Show an "auto-generated summary" badge when `llm.ok` is false.
- The footer disclaimer ("Personal data review, not medical advice.") stays on every view.

## Privacy constraints (the repo and the site are public)

- Every page carries `<meta name="robots" content="noindex, nofollow">`, and `robots.txt` contains `Disallow: /`.
- Never add the owner's name or email, the Nightscout URL, analytics or tracking.
- The site must never expect or show free-text notes, profile names or device identifiers. The agent
  doesn't publish them.

## Commands

The site has no build, lint or test tooling. To preview locally:

```bash
python -m http.server 8000   # from the repo root, then open http://localhost:8000/
```
