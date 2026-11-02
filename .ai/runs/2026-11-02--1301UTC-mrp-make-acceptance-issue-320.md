# Issue #320: MRP Make acceptance (om-auto-fix-issue, feature route)

**Date:** 2026-11-02 13:01 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 72159ee4)
**Spec:** `.ai/specs/2026-11-02--1304UTC-mrp-make-proposal-acceptance.md`
**Status:** done

## Goal
Run `om-auto-fix-issue 320`: a feasible Make proposal becomes an Open production order pinned to its BOM revision and tagged with the run (E19-S01, Make half).

## Log
- 13:01 Classified #320 as a feature (label `feature`). Dependencies #281 and #282 are closed. No open PR references #320. #287's spec (`implemented/2026-11-01--0737UTC-mrp-proposal-acceptance.md`) deferred Make (its Q1), so no spec covers the story → feature route F3c: `om-auto-write-spec 320`, then `om-auto-implement-spec`.
- 13:03 Claimed #320 (assignee, `in-progress`, claim comment). Branch `spec/mrp-make-proposal-acceptance` from `origin/main` in the cezar worktree.
- 13:04 Wrote the spec autonomously: 11 resolved assumptions, none marked ⚠ NEEDS HUMAN CONFIRMATION. The date question is tied to #322 (Q1). Two mockups adapted from #287's.
- 13:10 Fresh-context review: proceed. Applied its fixes: the stale rule also compares a production order's lead time (Q3); `createWith`/`insertOrder` take an origin; a set of race codes; the tests and comments to update.
- 13:10 `tests/ai-filenames.test.ts` failed on `main`: #340 left the active copy of #289's spec beside its `implemented/` copy. Deleted it on this branch (lesson 2026-10-23, extended).

- 13:20 Spec PR #344 opened, ready, with labels, the defaults comment and the mockups.
- 13:12–16:25 Implementation PR #345 (`om-auto-implement-spec` → `om-auto-create-pr`, plan `.ai/pipeline/runs/2026-11-02--1312UTC-mrp-make-proposal-acceptance.md`). Review: approve, with the findings fixed. UI QA: PASS against a standalone build. Ready, with CI followed up.
- 16:30 Released the #320 lock. #345 closes it on merge; #344 merges first.

## Changes
- Spec, mockups, the stray active copy of `2026-11-02--1031UTC-mrp-automatic-mode.md` removed, lesson extended.

## Verification
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 7 passed after the deletion (1 failed before it).

## Follow-ups
- Merge #344 before #345 (lesson 2026-10-23).
- #322 (the date of a document accepted from a late proposal) now covers production orders too.
- RUN-007's browser half for Make (choosing Automatic for a Make pair in the dialog) has no browser test yet; recorded in `CPG-acceptance.md`.
