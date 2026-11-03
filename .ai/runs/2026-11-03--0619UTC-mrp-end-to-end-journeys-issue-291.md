# Issue #291: the twelve MRP cross-domain journeys, end to end (om-auto-fix-issue, feature route)

**Date:** 2026-11-03 06:19 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 0286a3f0)
**Spec:** `.ai/specs/2026-11-03--0626UTC-mrp-end-to-end-journeys.md`
**Status:** in progress

## Goal
Run `om-auto-fix-issue 291`: integration tests that run E2E-001, 002, 003, 005, 007, 008, 010 (MRP half), 012, 015, 016, 019 and 021 end to end through the screens and the bearer API, plus UX-023's planning half and an MRP run on the realistic Test dataset on screen; then promote the catalogue rows.

## Log
- 06:15 Classified #291 as a feature (label `feature`, test-only). No PR references it and no spec covers it; every dependency (#273–#289, #27, #81, #91, #92) is closed. `SDLC.md` has no Definition of Ready. Route F3c: `om-auto-write-spec 291`, then `om-auto-implement-spec`.
- 06:19 Claimed #291 (assignee, `in-progress`, claim comment). Branch `spec/mrp-end-to-end-journeys` from `origin/main` (89ffdd60) in the cezar worktree; `npm ci`, `npm run build` (0).
- 06:20 No Docker on this machine. A local standalone server (lesson 2026-10-23) runs `mrp-accept-api.test.ts` green (7/7), so the integration files can be checked locally.
- 06:22 Checked the code for facts the spec relies on: a Test reset deletes Test's MRP runs (`mrp-run-api.test.ts`); a completion reversal reopens a completed production order (`completion-reversal.ts`, `productionStatus`); a Make need whose BOM can't be supplied is a provisional plan, not a proposal; `plan.excess` is the measure of planned supply above need; E14-S02's realistic budget is 1 s and the timing tests' CI factor is 6. CI's slowest integration shard takes about 11 min (run 41521070098).
- 06:26 Wrote the spec autonomously: 12 resolved assumptions, none marked ⚠.
- 06:36 Fresh-context review: revise (1 critical, 3 high, 5 medium, 5 low). Applied:
  - Every manual journey's documents now start from a proposal accepted on the screen, with a table naming each journey's screen run and acceptance. Before, E2E-007, 008, 012, 016 and 019 had none.
  - E2E-002 asserts exact per-step counts and zero supply on provisional levels.
  - E2E-019 has demand, a future planned finish and the reopened order's supply.
  - E2E-012 compares the variance report.
  - The realistic run's 6 s is labelled a tolerance, and `/up` must answer before the run card updates.
  - E2E-010 compares every page of Prod's latest run, and is run on the screen.
  - `it.fails` is limited to one clause, and the finance check uses whole words.
  - Prod list headroom is recorded.
  - Kept one PR, not the suggested two (the catalogue and UX-023 span every file).
- 06:31 Prototyped `journeys.ts` and `e2e-supply-chain.test.ts` (E2E-001, E2E-015) on a local server: 3/3 pass in 7.4 s. Not on the spec branch.

## Changes
- Spec and this log (spec PR).

## Verification
- Pending.

## Follow-ups
- None yet.
