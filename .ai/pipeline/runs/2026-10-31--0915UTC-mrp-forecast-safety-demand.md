# Execution plan — MRP demand: forecasts, overdue orders, safety targets (E15-S01, #275)

**Date:** 2026-10-31 09:15 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-31--0902UTC-mrp-forecast-safety-demand.md
Spec PR: #302 (design only; this branch is cut from `main` and carries the spec straight into `implemented/`, lesson 2026-10-23 "Close the paperwork")
Issue: #275
Status: in-progress

## Goal

Every MRP run nets forecasts against customer orders by calendar month through `netForecasts` (D08). It counts an earlier residual of the current month today, expires the forecasts of ended months, and carries each day's safety-stock target. The projection and its shortages reflect all of it, and `safetyGap` measures the shortfall against the target.

## Scope

As the spec's Implementation Plan says:
- the engine seams in `core/src/domain/mrp/`, and `targetInForce` widened;
- the snapshot loader's three new reads;
- the benchmark;
- one API integration test;
- the MRP help copy, EN and PL;
- the docs and the acceptance catalogue.

**Non-goals:**
- purchasing supply (E15-S02);
- production orders and transfers (E15-S03);
- proposals and the safety gap's sizing (E16-S01);
- the priority order and Late Supply (E16-S02);
- report columns (E18-S01, #284 / #305);
- any migration, route or screen.

## Implementation Plan

### Phase 1: Engine
1.1 Widen `targetInForce` to any `{ effectiveFrom: string }`, with a `bigint` test.
1.2 Types: add `MrpForecast`, `MrpSafetyTarget`, `MrpForecastDemand` and `MrpPlan.forecastDemand`; pass empty lists from the loader and the fixtures.
1.3 `demand/forecast-demand.ts` with its tests.
1.4 `demand/safety-levels.ts` and `projection/safety-gap.ts` with their tests.
1.5 Wire `planMrp`, with one test per acceptance criterion of #275.

### Phase 2: Loader
2.1 Move the Open read's cut-off, and add `readConsumingLines`, `readForecasts` and `readSafetyTargets` with their tests and plan tests; rewrite the existing snapshot tests the spec names.
2.2 Add the run-service test: a forecast-only pair's stored `forecastDemand` and `safetyTarget`.
2.3 Extend the benchmark: forecasts from the month start, safety targets, and `planMrp`'s own time printed.

### Phase 3: Evidence and close-out
3.1 Add the integration test in `tests/integration/mrp-run-api.test.ts`.
3.2 Rewrite the MRP help topic, EN and PL.
3.3 Update the docs: engineering standards, the acceptance catalogue (D08 notes, Evidence lines), lessons, and the spec carried into `implemented/`.
3.4 Run the full validation gate.

## Risks

- **Query plans of the new reads.** Pinned by plan tests, with the spec's Q5 fallback.
- **Event-loop stalls at ten times.** `planMrp` is synchronous; the benchmark prints its time.
- **Docker.** If it is unavailable, the integration file runs against a local standalone server (lesson 2026-10-23), and CI runs the image.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [ ] 1.1 Widen targetInForce
- [ ] 1.2 Types and empty inputs
- [ ] 1.3 Forecast demand seam
- [ ] 1.4 Safety levels and gap
- [ ] 1.5 Wire planMrp with acceptance tests

### Phase 2: Loader

- [ ] 2.1 Snapshot reads and plan tests
- [ ] 2.2 Run service stores forecast and safety figures
- [ ] 2.3 Benchmark extension

### Phase 3: Evidence and close-out

- [ ] 3.1 API integration test
- [ ] 3.2 MRP help copy
- [ ] 3.3 Docs, catalogue, lessons, spec to implemented
- [ ] 3.4 Full validation gate
