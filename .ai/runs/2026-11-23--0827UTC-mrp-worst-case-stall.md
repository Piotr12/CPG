# Fix the MRP ten-times worst-case stall flake (#400)

**Date:** 2026-11-23 08:27 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 400` dispatched by cezar
**Spec:** none (bug; budget from `.ai/specs/implemented/2026-10-27--0556UTC-mrp-runs.md`, Risks: ten-times stall under 250 ms)
**Status:** done (PR open, CI pending)

## Goal

`mrp-run-timing.test.ts`'s worst-case stall bound (6 × 250 ms) flaked on CI at 1,645 ms. Make the longest stall drop well below the bound
without loosening it, and keep the test failing on a real regression.

## Log

- Triage: issue open, unclaimed, no PR references it. CI job 137137984146 printed `longest event-loop stall 1645 ms, planMrp alone 1661 ms`:
  the engine, one synchronous call, is the stall. Locally the same case printed 293 ms against `planMrp alone` 303 ms, already over the
  spec's 250 ms budget.
- The machine was heavily loaded (load average up to 52 on 18 cores), so I dumped the worst case's `MrpInputs` once and benchmarked `main`'s
  engine (a copy of `domain/`) against the branch in interleaved rounds, asserting identical serialized results each time (lesson 2026-11-02).
- Profile (inspector, inside Vitest): `scheduleProposal` was ~19% of the engine (date parsing in `plannedStart`, about 80,000 calls over a
  few hundred keys), `canSupply` ~13% (mostly the same scheduling). A per-run `proposalScheduler` made the engine 0.77–0.82× `main`'s, with
  identical output. A `canSupply` cache on top changed nothing measurable, so it was dropped. Reusing the pair key in `explode` was within noise,
  so it was reverted.
- A 20% speedup leaves CI's margin at about 20%, so the fix splits the stall: `planMrpSteps` (generator) pauses after reading inputs and three
  times per level, `planMrp` runs it synchronously as before, and the run and accept services drive it with `runYielding`. The engine's
  longest step is now 35–60 ms locally.
- The worst case then still stalled ~250 ms. A scratch `yieldToEventLoop` that logs gaps over 60 ms with their stacks showed that the
  previous attempt's commit plus deleting the previous run's ~98,000 rows ran as one stretch. The deletes go in four UUID ranges, yielding
  between them. A range delete is found through the tenant index, so each range reads every remaining row (EXPLAIN QUERY PLAN); 4/8/16
  ranges cost +90/+190/+400 ms in total, so I chose four, because the worst case's fastest-of-three is also near its CI bound (27.6 s of 30 s).
  Raw SQL (rowid ranges) is lint-forbidden in core.
- The test ran its attempts back to back without an event-loop turn, so one attempt's commit and the next one's first delete counted as one
  stall, which a server never sees: `measure` now yields between attempts. The commit's own stall still counts.

## Changes

- `domain/mrp/plan-mrp.ts`: `planMrpSteps`, with `planMrp` running it; the per-run scheduler.
- `domain/mrp/sizing/schedule-proposal.ts`: `proposalScheduler`; `replenish-pair.ts` takes `schedule` instead of `today`.
- `http/yield-to-event-loop.ts`: `runYielding`.
- `services/mrp/mrp-run.service.ts`: `runYielding(planMrpSteps(…))`, deletes in `MRP_DELETE_RANGES`; `mrp-acceptance.service.ts`: `runYielding`.
- `services/mrp/mrp-run-timing.test.ts`: prints the engine's longest step, yields between attempts. Bounds unchanged.
- Tests: `planMrpSteps` pauses and result, `runYielding`, range edges of the deletes.

## Verification

- Timing test alone, locally, before → after (fastest of 3 / longest event-loop stall): ten-times run 3,437 ms / ~129 ms → 2,967 ms / 87 ms;
  ten-times worst case 4,633 ms / 293 ms (engine alone 303 ms, one stretch) → 4,442–4,845 ms / 151–156 ms (engine's longest step 47–59 ms);
  ten-times accept 1,556 ms / 104 ms → 1,660 ms / 81 ms. The machine was loaded, so totals vary ±10%.
- Same case under the parallel coverage run: worst-case stall 144 ms, engine's longest step 85 ms (CI measured 1,645 ms there before).
- Interleaved engine benchmark on the dumped worst-case inputs, 10–15 rounds: branch 0.77–0.82× `main`, results serialized identically.
- `npm run lint` clean; `npm run typecheck` clean; `npm run test:coverage`: 687 files, 5,760 tests passed, thresholds met (the first run
  failed `mrp-batch-yield.test.ts` and `mrp-run-yield.test.ts`, whose module mocks returned only `yieldToEventLoop`; they now spread the
  actual module). `npm run build`: the first attempt compiled, then exited on Next.js's known-vulnerability check, unrelated to this change;
  the second passed. No integration file is touched and there is no migration; the integration suite runs in CI.
- Not proven locally: that the timing test now passes on CI's runner every time. The stall bound (1,500 ms) is unchanged, so a stall several
  times today's still fails it.

## Follow-ups

- The ten-times worst case's fastest-of-three is 27.6 s on CI against a 30 s bound (8% margin), mostly the result writes, not the engine.
