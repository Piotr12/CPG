# Demand review and statistical unit: mockups, decision issues and specs

**Date:** 2026-10-25 08:49 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, headless)
**Spec:** none (decision issues come before a spec)
**Status:** done

## Goal

Owner request: three mockups of a screen showing past orders/shipments and future demand, with time bucketing
(day/week/month) and multiselect location and material filters, plus a statistical unit (SU) so several
finished products add up (more than one product ⇒ SU only; one product ⇒ any of its units). End state: two
GitHub issues (demand review, SU) with screenshots, questions and recommendations. No further work.

## Log

- 08:49 Read lessons (Database, Services sections and the agent-browser ones), the demand entities (customer
  order lines, shipments, goods issues, forecasts), DEM-001…018, the earlier design-proposal run
  (`2026-10-24--1950UTC-table-and-entry-proposals.md`) and its publishing recipe.
- Approach: same as the proposals run. A throwaway prototype in the real app (`next dev` on 3221, fresh
  `DATA_DIR`, Test reset to the realistic dataset), screenshots with agent-browser at 1440×900, images on
  `qa-evidence`. The three mockups are one page with `?v=a|b|c`, computed from the live dataset by a
  prototype function in `core` (float maths, `em` reads, no tests: never merged).
- Mockups: A Timeline (stacked columns, past grey, Today rule, bucket table), B Planner grid (products ×
  buckets, past columns tinted, expandable rows, total in SU), C Overview by location (KPI tiles plus one
  chart per plant on a shared scale). Plus a Statistical units master-data page.
- Chart palette: dataviz reference slots 1–3 (blue/orange/aqua), validated with `validate_palette.js`
  (all checks pass; aqua below 3:1, so forecast is hatched and every view has a table).
- Finding: every realistic-dataset forecast is dated on the 1st of a month (120 = 10 products × 12 months).
  With DEM-007's same-date netting, orders later in the month never consume it, so demand double counts
  (Cabinet, red, Nov 2026: about 2.8 pallets ordered plus 3.2 forecast against about 3 shipped a month).
  Raised as Q3 of #240, with a recommendation to net within the forecast's period (decision row superseding
  DEM-007), because MRP (#14) will hit the same problem.
- Corrections made before posting: the KPI tile first claimed "on time and in full" but computed shipped ÷
  ordered, so it was relabelled honestly. Q11 first said reports have no API, but `reports/stock` and
  `reports/variance` routes exist, so the recommendation changed to API parity.
- Hit the documented zsh `path` trap (lesson 2026-10-24) with the `attach-image-evidence` snippet. Uploads
  then succeeded from a POSIX `sh` script.

- 09:10 Second session. The owner answered both issues and accepted every recommendation. #239 also says
  "single Stat Unit across the app altogether": one SU in every tenant, so the name and definition are
  fixed registry text with no per-tenant settings record (Q8 dropped), and the factors stay per material, so
  per tenant. Asked for implementation-ready spec PRs referenced from the issues.
- 09:13 Branched `docs/specs-demand-review-statistical-unit` from `origin/main` (`3ae6dd8c`, which already
  has #222's `FilterAutocomplete`) and cherry-picked this log. One PR, two specs, one decision row (D08),
  because the screen depends on SU and both rely on the same D08. That also matches the owner's
  one-PR preference.
- Design choices made while specifying:
  - SU entered on a line answers the existing `UNIT_NOT_CONVERTIBLE` from `convertToBaseQuantity`, the
    one choke point of 16 services, so there is no new error code or translation;
  - entry pickers filter SU in `listUnits`, the completion units map, the Stock page and the demo
    `unitsOf`;
  - a read-only Statistical units page replaces the issue's "no SU factor" Materials filter;
  - D08 nets forecasts by calendar month, allocating consumption in date order; a residual dated before
    today lands today, and ended months expire;
  - the unused greyscale `--chart-1…5` become a categorical palette validated in both themes;
  - the UI integration test runs on the tiny dataset (lesson: only `test-reset-realistic` switches Test).

## Changes

- GitHub: #239 (Statistical unit, 1 mockup + 2 shared, Q1–Q10) and #240 (Demand review, 6 mockups, Q1–Q13),
  label `enhancement`, cross-linked. Screenshots on `qa-evidence` under `demand-review-mockups/` and
  `statistical-unit-mockup/`.
- Prototype code: local branch `cez/dedfe518-demand-mockups` (`cdedf9a4`), not pushed, not for merging.
- This run log. No product code changed on this branch.

## Verification

- Every screenshot viewed before upload. All 9 embedded raw URLs in #239/#240 answer HTTP 200, no
  placeholders left, and each issue links the other.
- `tsc --noEmit` on `packages/app` and `packages/core` was clean for the prototype files (route `PageProps`
  types need `next typegen`, so they were ignored). No lint/test/build run: no product code changed.
- Dev server on 3221 stopped and the browser session closed.

- Spec PR: `.ai/specs/2026-10-25--0913UTC-statistical-unit.md`, `.ai/specs/2026-10-25--0913UTC-demand-review.md`,
  `research/decisions/D08-statistical-unit-and-demand-review.md`, the D08 row in `product-brief.md`, and the
  DEM-007 erratum in `CPG-acceptance.md`.

## Follow-ups

- The owner decides #240 and #239. Then a spec covering both and one decision row (SU, the screen, and the
  Q3 netting rule).
- Rename `path=` in the `attach-image-evidence` snippet of `.ai/trackers/github.md` so the zsh trap goes away
  instead of relying on the lesson. It has caught two runs now (#228 and this one).
