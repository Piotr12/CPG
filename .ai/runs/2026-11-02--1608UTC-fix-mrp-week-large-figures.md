# Fix #336: MRP Week view throws on stored figures past twelve integer digits

**Date:** 2026-11-02 16:08 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (bug, issue #336)
**Status:** done

## Goal

`GET …/mrp/runs/latest?bucket=week` and the Week view answer with exact figures for a plan whose stored balance has more than twelve integer digits, instead of throwing.

## Log

- 16:08 — Triage: real and unfixed on `main`. `foldWeeks` (`core/src/domain/mrp/report/weekly.ts`) read every stored figure with `parseSignedQuantity`, which applies the twelve-digit entry limit, while `summarizePlan` already reads them with `parseStoredFigure` (#288). No open PR references #336. Claimed the issue (the `gh issue edit` GraphQL call failed twice; assignee, label and comment went through the REST API).
- 16:09 — Root cause and fix: the shared helper the issue asks for already exists (`parseStoredFigure`, `domain/stock/signed-quantity.ts`). `weekly.ts` drops its own `micro` wrapper and imports it, as `plan-summary.ts` does. The defect message changes from "An MRP daily figure…" to the helper's "A stored figure…"; it is an internal `Error` (a 500), not an API message.
- 16:09 — Tests: a `foldWeeks` unit test with 13-digit flows, levels and shortage; a service test that runs two lines of 999,999,999,999 and reads the plan by day and by week. Both fail without the fix with the issue's error (checked by reverting `weekly.ts`).
- The worktree had no `node_modules` of its own, so tests resolved the main checkout's stale install and every DB test failed in `beforeEach`; `npm ci` in the worktree fixed it. Lesson of 2026-10-27 (cezar worktree needs its own `npm ci`) already covers that trap, so no new lesson.

## Changes

- `packages/core/src/domain/mrp/report/weekly.ts` — read stored figures with `parseStoredFigure`.
- `packages/core/src/domain/mrp/report/weekly.test.ts` — #336 regression test; refusal test follows the helper's message.
- `packages/core/src/services/mrp/mrp-run.service.test.ts` — #336 day and week read test.
- `.ai/lessons.md` — the stored-figure lesson no longer lists `weekly.ts` as open.

## Verification

- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 667/668 files pass; the one failure, `tests/ai-filenames.test.ts`, is `main`'s duplicate active copy of #320's spec, fixed by open PR #350. With that copy removed in the working tree only (not committed), 668/668 files, 5,542 tests, coverage thresholds (100%) met.
- `npm run build`: pass.
- Without the `weekly.ts` change, both #336 tests fail with `An MRP daily figure isn't a six-decimal quantity: "1999999999998.000000".`
- PR #353 CI (run 41479860567, head f3f6f921): lint, typecheck, build, `unit-tests (1)` and all four integration shards pass. `unit-tests (2)` and `unit-coverage` fail only on `tests/ai-filenames.test.ts` (667/668 files, no coverage threshold missed), `main`'s duplicate spec that #350 removes.
- No integration file touched: the HTTP route only calls the service, which the service test covers.

## Follow-ups

- Re-run #353's CI once #350 is on `main`; it should then be fully green.
