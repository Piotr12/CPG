# Drive PR #199 (#189, Test reset proofs) to merge-ready

**Date:** 2026-10-23 23:12 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-pr 199`, dispatched by cezar
**Spec:** none (the PR's own run log is `2026-10-23--2200UTC-issue-189-reset-proofs.md`)
**Status:** done: re-review approved (as a comment), local gate green, CI running on the final head. Human approval still gates the merge.

## Goal
Bring PR #199 up to date with `main`, re-review it with autofix, get CI green, verify the UI if the diff needs it, and hand it off merge-ready without merging.

## Log
- Claimed the PR and checked out `fix/issue-189-test-reset-proofs` in this task's worktree.
- Merged `origin/main` (#193, #194, #198). Two conflicts, both in docs:
  - `.ai/specs/research/CPG-acceptance.md`: #193 had rewritten the TEN-025, TEN-029, E2E-018 and E2E-020 evidence as "Partially verified", naming #189 as the gap. This PR closes that gap, so its rows win. Also dropped #193's stale evidence lines that git had kept beside the PR's for E2E-010, E2E-018 and E2E-020, and moved the one fact only #193 recorded (the `test-reset.test.ts` screen-edit refusal) into E2E-020.
  - `.ai/lessons.md`: #194 regrouped the lessons by topic. Took main's file and added the PR's two lessons, shortened to the new style, under *Unit tests*.
  - Pushed as `0203d15d`.
- `om-auto-review-pr 199 --autofix`, with a fresh-context reviewer: **changes requested**. Major: the merge had dropped #193's note that TEN-025's "read-only state remain identical" was unasserted, and the PR promoted the row to Passed anyway. Both tests ran with Prod writable only. Minor: E2E-010 relies on the image's `KEEP_ALIVE_TIMEOUT` (#185) without saying so. Three nits: catalogue facts lost in the merge.
- Fixed in `b144fcb1`. Both tests' read-only variants now make Prod read-only as well, compare it, and restore it, in `afterAll` too. Breaking the reset so it cleared Prod's flag turned the unit test red. The first local integration run failed because restoring Prod logged a Global audit event ahead of the reset, so the restore moved after that check. Also added the keep-alive comment, put `KEEP_ALIVE_TIMEOUT` in the standalone-server lesson, and restored the lost facts. Re-review: **approve**.
- The first review's minor 6 (E2E-020 uses today's dataset in both generations) was never fixed. Filed as #200.
- UI QA: n/a. The PR is `skip-qa`, tests and docs only.

## Changes
- `0203d15d`: merge of `main`, resolving the two doc conflicts.
- `b144fcb1`: Prod read-only variants in `test-reset.service.test.ts` and `test-reset-api.test.ts`, the E2E-010 keep-alive note, and the catalogue, spec-note and lesson fixes.
- This run log.

## Verification
- Local gate on `0203d15d`: `npm run lint` (0 errors, 1 old warning), `typecheck`, `test:coverage` (3,550 tests, 100%) and `build` all exit 0.
- On `b144fcb1`: `lint` and `typecheck` pass, and `test:coverage` passes 3,550 tests at 100%. `build` was not re-run, because only tests and docs changed.
- Integration, on a fresh standalone server started with `KEEP_ALIVE_TIMEOUT` (Docker isn't available here): `test-reset-api.test.ts` 5/5, then `test-reset-realistic` and `test-reset` 10/10 on the same server.
- The CI result is in the PR's `om-auto-fix-pr` comments.

## Follow-ups
- #200: make the E2E-020 reset test independent of the run's date.
