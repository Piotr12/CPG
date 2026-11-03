# MRP makes an intermediate a parent is short of (#369)

**Date:** 2026-11-03 10:17 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 369`, cezar task 122d83bd)
**Spec:** `.ai/specs/implemented/2026-11-01--2049UTC-mrp-at-risk-and-provisional-plans.md` (E17-S03, Q5), amended by this fix
**Status:** in progress

## Goal

Fix #369. After R is received, MRP still keeps I provisional (`provisional-demand`), because I's only demand comes from F, and F is infeasible only because it is short of I. So the F ← I ← R chain never becomes executable through MRP (E2E-002, E2E-021).

## Log

- 10:17 Concurrency check: #369 had no assignee, no `in-progress` label, no claim comment and no open PR. Classified as a bug.
- 10:17 Reproduced with a scratch `planMrp` test (deleted afterwards). Run 1 proposes R 20, with F `no-feasible-bom` and I `no-feasible-bom, provisional-demand`. Run 2, with 20 R on hand, proposes nothing: F `no-feasible-bom`, I `provisional-demand`.
- 10:17 Root cause in `plan-mrp.ts`: `keep()` explodes every infeasible proposal with `isProvisional = true`, so its needs go into `provisionalOf`. That one map did two jobs. It kept those needs out of the level's feasibility tests (E17-S02 Q4), and it made `replenishPair` size them as provisional only (E17-S03 Q6), so a Make component never got an executable proposal for them.
- 10:17 The issue leaves the rule to the owner, so I asked with the options and a recommendation.
- 10:30 Told to continue autonomously, so I took the recommended options: the rule below, recorded as an amendment of E17-S03 Q5 in the fix PR. Claimed #369 and branched `fix/issue-369-mrp-intermediate-stays-provisional` from `origin/main` (`c3325d75`).
- 10:40 Implemented. `chooseBom` returns the chosen BOM's `shortages`. `planMrp` keeps `excludedOf` (every infeasible proposal's needs, out of feasibility) apart from `provisionalOf` (the provisional part, sized apart). `canSupply` decides whether every shortage can get executable supply.
- 10:50 Seven existing `plan-mrp.test.ts` tests encoded the old carry-down. MRP-027/047 and MRP-028 now list I's and B's own No Feasible BOM. The carry-down tests (MRP-026, Q6, Q7, root ranking, shuffled snapshot) give the parent a second component with no planning parameter set, so they still exercise `provisional-demand`.
- 11:00 Updated the Help copy (EN/PL) and its test. Updated the service test, `mrp-run-api`, `mrp-report-api` and `mrp-report` (I's own No Feasible BOM). Changed the E2E-002 and E2E-021 journeys to make I through MRP, and deleted their `it.fails` tests.
- 11:20 `mrp-run-timing.test.ts`: the ten-times fixture's components can all be supplied, so no action is sized for a provisional parent any more. The `driven > 0` assertion is now `driven === 0`, with the reason.

## Rule (E17-S03 Q5 amendment)

An infeasible Make proposal sized for real demand passes **real** demand to its components when MRP can supply every component its chosen BOM is short of. A component can be supplied when its rows are readable and it has a usable set: not an invalid set, not raw Make. A Make component also needs to be off any BOM cycle and to have a usable BOM valid on the parent's planned start. Otherwise the needs stay provisional. Either way they count in no feasibility test of the parent's level.

## Changes

- `packages/core/src/domain/mrp/explosion/choose-bom.ts` (+ test): `BomChoice.shortages`.
- `packages/core/src/domain/mrp/plan-mrp.ts` (+ test): `NeedKind`, `excludedOf` / `provisionalOf`, `canSupply`; new describe "a parent's needs are real when MRP can supply all it is short of (#369)".
- `packages/core/src/services/mrp/mrp-run.service.test.ts`, `mrp-run-timing.test.ts`.
- `packages/app/src/help/topics.ts` (+ test).
- `tests/integration/e2e-planning.test.ts`, `e2e-automatic.test.ts`, `mrp-run-api.test.ts`, `mrp-report-api.test.ts`, `mrp-report.test.ts`.
- `.ai/specs/implemented/2026-11-01--2049UTC-mrp-at-risk-and-provisional-plans.md` (Q5 amendment, implementation note), `.ai/specs/research/CPG-acceptance.md` (E2E-002 and E2E-021 to Passed (automated), MRP-047's evidence), `.ai/lessons.md`.

## Verification

- The new tests fail on `main`'s `plan-mrp.ts` (5 failures). The feasibility-exclusion test also fails when real needs claim (`"claim"` instead of `"real"`).
- `vitest run packages/core/src/domain/mrp`: 430 passed. Coverage of `plan-mrp.ts` and `choose-bom.ts` was 100% statements; the remaining uncovered lines are untouched sort tie-breakers, covered elsewhere in the full suite.
- `npm run lint`: 0. `npm run typecheck`: 0. `npm run build`: 0.
- `npm run test:coverage`: every failure was a timeout or a stall bound. Other sessions' node processes held the machine at a load average of about 5–10, and the failing set changed from run to run: 24 tests, then 1, then 7 in unrelated files (auth throttle, glossary, workbook, test reset). Every file that failed passed when rerun alone. The CI-style shards plus the timing project, merged, left only `plan-mrp.ts` lines 352–353 uncovered: the sort tie-break between a real and a provisional-parent action on one day, which the old fixtures reached. A test now covers it ("lists a pair's action for real demand before…"), and `plan-mrp.ts` and `choose-bom.ts` are at 100% lines, statements and functions. CI's merged coverage is the gate of record.
- `mrp-run-timing.test.ts`, branch against `main` interleaved on one machine, `planMrp` alone: realistic 6/6 ms against 7 ms; ten times 67/69 ms against 73 ms; worst case ten times 203/223 ms against 239 ms. Stalls are comparable: realistic 32 ms (one run 738 ms during a load spike) against 47 ms; ten times 122–138 against 129 ms; worst case 212–244 against 268 ms. At ten times, 2,323 provisional actions against 2,872, none for a provisional parent.
- Integration, against a local standalone server (no Docker on this machine): `e2e-planning`, `e2e-automatic`, `mrp-run-api`, `mrp-report-api` and `mrp-report` all pass, 45 tests. `e2e-automatic`'s UX-023 floor on master-data requests went from > 40 to > 30, since the deleted `it.fails` test was the one that built a second hierarchy (36 requests now). It was rerun on a fresh server: 3 passed.

## Follow-ups

- none yet
