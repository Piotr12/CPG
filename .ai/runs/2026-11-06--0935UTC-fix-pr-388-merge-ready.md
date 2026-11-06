# Drive PR #388 (automatic runs and reruns tests) to merge-ready

**Date:** 2026-11-06 09:35 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr`, dispatched by cezar)
**Spec:** none (test-only PR for #381)
**Status:** in progress

## Goal

Bring #388 up to date with `main`, run the review-autofix, CI and UI stages, and leave it merge-ready (never merge).

## Log

- 09:28 Claimed #388 (assignee, `in-progress`, claim comment). The PR branch is checked out in another cezar worktree, so this run points its own task branch at the PR head and pushes to `fix/issue-381-automatic-rerun-tests`.
- 09:30 Merged `origin/main` (#378, #379, #380, #382, #384–#389). One conflict: the acceptance catalogue's `Last updated` line. Kept #381's entry first and recomputed its counts against `main`'s 529/6: all 535 rows Passed (automated); the row tally agrees.
- 09:32 After `npm ci`, one merged test failed for real: RUN-015's failed-batch test expected `mrp_run_exception` to hold only `MISSING_BOM`, but since #380 a run also stores each short pair's ranked shortages there as a `SHORTAGE` row. The test now expects both rows in position order and the plan's `shortages`, a stronger statement of "the savepoint takes back documents only". The RUN-015 Evidence line names the shortage. The ten-times timing test failed once (stall 2,841 ms) while 15 MRP files ran in parallel. Run alone, it passed with a 656 ms stall against its 1,500 ms bound. That code comes from `main`, so this was load, not a regression. Pushed `8a383c45`.
- 09:35 Review stage (`om-auto-review-pr --autofix`, chain lock retained). No inline review comments. The one earlier low finding (Prod masters left in the gate file's database) was already declined with a reason. Review of the merged diff: test-only, and every assertion is on outcomes.

## Changes

- `ede32e4e` merge of `origin/main`: acceptance-catalogue conflict resolved.
- `8a383c45` RUN-015 test and Evidence line updated for #380's stored shortages.
- This run log, the catalogue header and a lesson.

## Verification

- (filled in at the end)

## Follow-ups
