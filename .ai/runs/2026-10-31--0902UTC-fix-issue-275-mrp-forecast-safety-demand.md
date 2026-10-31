# om-auto-fix-issue #275 — MRP forecast netting and safety targets (E15-S01): spec

**Date:** 2026-10-31 09:02 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--0902UTC-mrp-forecast-safety-demand.md`
**Status:** in progress

## Goal

Take #275 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 275` writes the spec, and `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 09:02 Triage. #275 is labelled `feature`, is open and unassigned, and no PR mentions it. `SDLC.md` has no Definition of Ready. `MrpInputs` carries only stock and order lines, and nothing fills `forecastDemand` or `safetyTarget`. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-forecast-safety-demand` from `origin/main`.
- 09:05 Read the context: lessons, the #273 and #274 specs, `domain/mrp/`, `services/mrp/` (snapshot loader, run view, timing benchmark), `netForecasts`, `tallyDemand`, `DemandReviewService.cells`, `target-on.ts`, the `Forecast` and `SafetyStockTarget` entities, D08 and the DEM-007/025 and MRP-043/048 catalogue rows.
- 09:20 Wrote the spec and resolved nine open questions with reversible defaults. Three shape the most code:
  - Q1: D08 decides the same-month case of DEM-025 and MRP-048, and both rows get a note;
  - Q2: the safety gap is a pure helper, not a stored column, so no migration;
  - Q5: a second order-line read, by calendar month, takes the non-Open lines that consume forecasts.
- 09:21 Sent the spec to a fresh-context reviewer. It found the scope cohesive, with no Critical finding.
- 10:13 Folded in the review:
  - **High:** the integration test's day 10 and day 12 straddle a month end on some days, and D08 would then leave the residual at 100. It now uses the 2nd and the 4th of next month.
  - **Medium:** step 6 names the three snapshot tests the moved cut-off and the new read change.
  - **Medium:** closing early sets `abandoned` to the remainder, so the DEM-010 fixture can't catch a deleted status filter. A reversed-issue Closed Early fixture does, and the removed-line fixture has a quantity that moves the residual.
  - **Low:** the read fallback keeps the date range and splits off the order join; the benchmark prints `planMrp`'s synchronous time; MRP-048's due date is given; the catalogue notes reuse DEM-007's "Superseded by D08" wording.

## Changes

- `.ai/specs/2026-10-31--0902UTC-mrp-forecast-safety-demand.md`, this run log

## Verification

- Spec review by a fresh-context subagent: one High, two Medium and four Low findings, all folded in (10:13).
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 7 tests passed.

## Follow-ups
