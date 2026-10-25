# Fix the red Deploy on main: demand review budget test timed out

**Date:** 2026-10-25 16:17 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task 371d7b58)
**Spec:** none
**Status:** done

## Goal

Deploy run 40196042641 (push of 7810c40c, #244) failed; find out why and fix it.

## Log

- Every job but `ci / unit-tests` was green; `deploy` was skipped. One test failed:
  `demand-review-reads.test.ts > reads every product per month within the budget` — `Test timed out in 5000ms`.
- The test reads three times and asserts the fastest under `CI_BOUND_MS` (3 s). CI printed the fastest reads under the
  coverage run: day 294 ms, week 913 ms, month 1,564 ms. Three month reads (≥ 4.7 s plus slower runs) overran Vitest's
  default 5 s `testTimeout`, so the test died before its own bound could judge it. Alone, locally: day 50, week 88,
  month 146 ms. The code under test is fine; the test's harness limit was too tight.
- Fix: pass `TEST_TIMEOUT_MS = 2 × RUNS × CI_BOUND_MS` (18 s) to the budget tests, so only the bound can fail them.
- Also dropped the unused `lineError` import in `bom.service.ts` (lint warning on the same run, left by #248).

## Changes

- `packages/core/src/services/reports/demand-review-reads.test.ts` — explicit timeout derived from the bound.
- `packages/core/src/services/boms/bom.service.ts` — unused import removed.
- `.ai/lessons.md` — lesson under "Unit tests".

## Verification

- `npx vitest run packages/core/src/services/reports/demand-review-reads.test.ts` — 6 passed (50 / 88 / 146 ms).
- `npm run lint` — clean, no warnings. `npm run typecheck` — passes.
- `npm run test:coverage` — 578 files, 4395 tests passed, thresholds met (exit 0); the budget test printed
  186 / 302 / 514 ms under the local parallel coverage run.
- `npm run build` — succeeds.
- No integration files touched; CI runs the full suite on the PR.

## Follow-ups

- Merge the PR once CI is green; the merge redeploys `main` (7810c40c never deployed).
