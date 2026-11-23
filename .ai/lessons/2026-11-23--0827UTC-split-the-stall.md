# Find what a stall is, then split it rather than only speed it up (#400)

## What happened

`mrp-run-timing.test.ts`'s ten-times worst case failed CI at 1,645 ms against its 1,500 ms stall bound (`CI_FACTOR × STALL_BUDGET_MS`).
The same run printed `planMrp alone 1661 ms`: the engine, one synchronous call, was the stall. Locally it was 293 ms against the engine's
303 ms, already over the spec's 250 ms budget.

## What worked

- **Measure the engine against `main` on a loaded machine** by dumping the case's `MrpInputs` once (bigints as `{ $b: "…" }`), copying
  `packages/core/src/domain` to a scratch folder with symlinks for its siblings, and timing both engines in interleaved rounds from a scratch
  Vitest file. Assert that the serialized results are equal in every round.
- **Profile** with `node:inspector/promises` inside that scratch test (lesson 2026-11-02). `scheduleProposal` was ~19% of the engine:
  about 80,000 calls, each parsing and formatting dates, over a few hundred need-date and lead-time keys. A per-run `proposalScheduler`
  made the engine 0.77–0.82× `main`'s.
- **A speedup alone wasn't enough** (CI's margin would have stayed about 20%), so `planMrpSteps` pauses after reading inputs and three
  times per level, and the services drive it with `runYielding`. The engine's longest step fell to about 50 ms locally.
- **Then find the next-longest stretch.** A scratch `yieldToEventLoop` that writes every gap over a threshold with
  `new Error().stack` showed the previous run's ~98,000-row delete. With the attempts back to back, it ran in the same stretch as the
  previous attempt's commit.

## Pitfalls

- A `nativeDelete` on a range of random UUIDs is found through the tenant index (`EXPLAIN QUERY PLAN`: `USING INDEX …tenant_code_index`),
  so every range reads every row left. Measured totals for 4, 8 and 16 ranges: +90, +190 and +400 ms. Use few ranges. Raw SQL on `rowid` is
  lint-forbidden in core.
- With no event-loop turn between `measure`'s attempts, one attempt's commit and the next attempt's first statement count as one stall, which
  a server serving two requests never has. Yield between attempts. The commit's own stall still counts.
- A module mock that returns only `yieldToEventLoop` breaks every importer of another export from that module (`runYielding`). Spread the
  actual module.
