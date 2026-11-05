# MRP timing benchmark forces the second sizing for a provisional parent's need again (#376)

**Date:** 2026-11-03 13:12 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (E17-S03 Q6 is the behaviour timed; no spec change)
**Status:** done

## Goal

Since #369 (PR #375), `mrp-run-timing.test.ts` sizes no action for a provisional parent's need (`driven` 0 at both sizes, 958 at ten times before), so E17-S03 Q6's second sizing of a Make pair (`replenishPair` with `provisional !== null`) is no longer timed at scale. Force it at ten times and assert `driven > 0` there, keeping "no pair is stopped".

## Log

- 13:00 Triage: issue open, unclaimed, no PR references it; #375's commit names #376 as the follow-up. Bug route (test-coverage regression, `refactor` label).
- Root cause: a parent's needs stay provisional only when `canSupply` (`plan-mrp.ts`) fails for a component it is short of, and every fixture component has a set and a usable BOM. `replenishPair` raises Missing Planning Parameters for a pair with no set only once its projection falls short, while a feasibility test counts stock and dependable supply only. So a part with no set and no stock, covered by an open requisition (tentative supply), is short for `chooseBom`, can't be supplied, and is never stopped.
- Decision: force the path with that part rather than excusing an exception code in the "no pair is stopped" assertion. The issue offered both; this keeps the assertion strict.
- Baseline on `main` (local, timing project alone): ten times 2834 ms, stall 119 ms, planMrp 74 ms; worst case ten times 3863 ms, stall 256 ms, planMrp 225 ms; `driven` 0 at both sizes.
- After: ten times 2700 ms, stall 110 ms, planMrp 76 ms, `driven` 958 (the pre-#369 figure); worst case ten times 4200–4247 ms, stall 281–317 ms, planMrp 268–282 ms (the Q6 path's cost, back in the timing). CI bounds are 6× the budgets (30 s, 1,500 ms).
- With one location `driven` stays 0: every top-third proposal falls back to a feasible priority 2 (98 fallbacks), so none is provisional. The assertion is `driven > 0` exactly when the size has more than one location.
- Mutation check: with `replenishPair`'s second sizing replaced by `[]`, the ten-times test fails at the new assertion (`expected false to be true`); restored.

## Changes

- `packages/core/src/services/mrp/mrp-run-timing.test.ts`: each location's unplanned part (material `mn<x>`, code `9990000x`), its open requisition of 100,000,000 today, and a fifth line of it on every top-third priority-1 revision; pairs bound raised by the locations; `driven` asserted.
- `.ai/lessons.md`: extended the 2026-11-01 benchmark-fixture lesson (now dated 2026-11-03).

## Verification

- `npx vitest run --project timing packages/core/src/services/mrp/mrp-run-timing.test.ts`: 10 passed, 2 skipped.
- Full gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (678 files, 5,667 passed, 2 skipped; 100% statements, branches, functions, lines), `npm run build`: all exit 0.
- No integration test: the change is a unit-test fixture only, with no page, route or migration.

- PR #377 opened; `om-auto-review-pr --autofix` approved it (0 findings; posted as a comment review, since GitHub refuses an author's approval). A probe of the realistic run confirmed No Feasible BOM falls only on middle-third materials, so `driven` stays 0 with one location by the fixture's shape. Labels `merge-queue`, `refactor`, `skip-qa`, `priority-low`, `risk-low`. UI QA skipped: no user-facing surface.

## Follow-ups

- None. CI on the PR is the remaining gate.
