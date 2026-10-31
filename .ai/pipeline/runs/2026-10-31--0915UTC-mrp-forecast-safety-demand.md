# Execution plan — MRP demand: forecasts, overdue orders, safety targets (E15-S01, #275)

**Date:** 2026-10-31 09:15 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-31--0902UTC-mrp-forecast-safety-demand.md
Spec PR: #302 (design only; this branch is cut from `main` and carries the spec straight into `implemented/`, lesson 2026-10-23 "Close the paperwork")
Issue: #275
Status: complete

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

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build`: exit 0.
- `npm run test:coverage`: exit 0, 619 files and 4,795 tests, every threshold at 100%.
- Benchmark, run alone: 181 ms realistic, 1,751 ms at ten times, longest stall 103 ms, `planMrp` alone 33 ms. Under the parallel coverage run the figures were 764 ms and 8,658 ms, with a 721 ms stall, inside the CI bounds.
- `npm run test:integration -- tests/integration/mrp-run-api.test.ts` against a standalone build (`node packages/app/server.js`, fresh `DATA_DIR`), since Docker is unavailable on this machine: 7 tests passed. CI runs the full suite on the image.
- Code review (fresh-context, `om-auto-review-pr --autofix`): one major and seven minors and nits, all fixed in a79439f2. The major was that no test read from the first of today's month. The new mid-month loader and run tests fail when `from = monthStart(today)` becomes `from = today`. The gate re-ran green: 4,797 tests at 100%, lint, typecheck and build.
- `om-auto-fix-pr 308` (after #306, E15-S02, merged): merged `main` (5f13de05) and resolved eleven conflicts by keeping both seams. A new `planMrp` test checks the seam: forecast, safety target and purchasing supply in one balance. A fresh-context review of the resolution approved it with four nits, fixed in 6b22e336 with the help paragraph reordered demand first. On the merged tree the gate is green: 4,828 tests at 100%, lint, typecheck and build. `mrp-run-api.test.ts` (8 tests) passed against a standalone build, and the EN and PL help evidence was re-captured.
- Mutation checks: removing the engine's `removed` filter before netting, or the firm-demand status filter, fails tests (`plan-mrp.test.ts`, `forecast-demand.test.ts`).

## Progress

PR: #308

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 Widen targetInForce — 99b33e36
- [x] 1.2 Types and empty inputs — a2b34f09
- [x] 1.3 Forecast demand seam — a2b34f09
- [x] 1.4 Safety levels and gap — a2b34f09
- [x] 1.5 Wire planMrp with acceptance tests — a2b34f09, 49e47ddf

### Phase 2: Loader

- [x] 2.1 Snapshot reads and plan tests — 32e6616d
- [x] 2.2 Run service stores forecast and safety figures — acab27aa
- [x] 2.3 Benchmark extension — 731e002f

### Phase 3: Evidence and close-out

- [x] 3.1 API integration test — 7fa49f39
- [x] 3.2 MRP help copy — bb1ef724
- [x] 3.3 Docs, catalogue, lessons, spec to implemented — 3674b111
- [x] 3.4 Full validation gate — 3674b111
