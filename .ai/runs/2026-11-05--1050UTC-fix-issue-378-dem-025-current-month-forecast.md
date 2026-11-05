# Fix issue #378 — DEM-025: an overdue line of an ended month leaves the current month's forecast whole

**Date:** 2026-11-05 10:50 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (issue #378, E15-S04; netting per D08, `.ai/specs/implemented/2026-10-31--0902UTC-mrp-forecast-safety-demand.md`)
**Status:** done

## Goal

Close DEM-025's last gap: assert that on 2 September the overdue 31 August line consumes August's forecast, not September's, and move the row to Passed (automated). Tests only. The issue rules netting changes out of scope.

## Log

- 10:50 — Issue unclaimed and not in flight. Classified as a test gap (`refactor`) and run through the bug chain. Triage: the gap is real. The existing "DEM-025 per D08" test has no forecast in the run's month, so consumption keyed on the run's month would still pass it.
- Claimed #378 (assignee, `in-progress`, claim comment).
- Added one `planMrp` case (`plan-mrp.test.ts`) and one `netForecasts` case (`forecast-netting.test.ts`). They use DEM-025's fixture plus a forecast of 100 on 10 September.
- Mutation check: keyed an overdue line's consumption on today's month in `forecast-netting.ts`. Both new tests failed and the old DEM-025 test still passed. Restored the file.
- Moved DEM-025 to Passed (automated) in `CPG-acceptance.md`: Evidence line rewritten, the status note added at the top, counts now 517 / 18 (checked with `grep -c`). Engine-only evidence follows MRP-048, which the closing pass (#292) promoted on the same kind of evidence. The issue's scope and acceptance criteria ask for exactly this.

## Changes

- `packages/core/src/domain/mrp/plan-mrp.test.ts`
- `packages/core/src/domain/demand/forecast-netting.test.ts`
- `.ai/specs/research/CPG-acceptance.md`

## Verification

- `npm run lint`: clean. `npm run typecheck`: clean. `npm run test:coverage`: 678 files, 5669 tests passed, 100% statements (13840/13840) and branches (6412/6412). `npm run build`: succeeded.
- The first typecheck failed in `tests/test-reset-coverage.test.ts`, which this change doesn't touch. The worktree had no `node_modules`, so `@cpg/*` resolved through the main checkout's stale links. `npm ci` in the worktree fixed it.
- No integration test was run: no route, UI or migration changed.

## Follow-ups

- None.
