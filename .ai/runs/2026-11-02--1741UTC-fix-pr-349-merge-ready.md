# Drive PR #349 (MRP snapshot reads, #321) to merge-ready, after #350

**Date:** 2026-11-02 17:41 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr 349`, dispatched by cezar)
**Spec:** none for this run (#349 implements #321's known limits, recorded in `.ai/specs/implemented/2026-11-01--0737UTC-mrp-planning-exceptions.md`)
**Status:** done (pending CI)

## Goal

Finish the [previous run](2026-11-02--1604UTC-fix-pr-349-merge-ready.md), which was blocked by `main`'s duplicate spec. #350 has fixed that on `main` now. Merge `main` in, re-review, and get the required checks green.

## Log

- 17:30 Claimed #349. It was already assigned to Piotr12, with no foreign lock. The newest CI run ([41481591022](https://github.com/Piotr12/CPG/actions/runs/41481591022), on be0f54eb) still failed only on `tests/ai-filenames.test.ts`, because the branch didn't yet have #350.
- 17:32 Merged `origin/main` (627b3b9a, with #350, #357 and #348). No conflicts. `main` changed nothing under `core/src/services/mrp/snapshot/` or `packages/db/src`. The PR adds no test that times itself, so #357's `timing` project doesn't need it. Pushed 6764bb67.
- 17:40 Re-review (`om-auto-review-pr --autofix`): approved, with no findings. The earlier findings were already settled, and no other reviewer's feedback is open.

## Changes

- Merge commit 6764bb67 (`main` into the PR branch).
- This run log.

## Verification

- At 6764bb67: `npm run lint` ✅, `npm run typecheck` ✅, `npm run test:coverage` ✅ (670 files, 5,551 passed, 2 skipped, 100% thresholds met, exit 0), `npm run build` ✅.
- Integration tests: not run locally. The PR changes no page or flow, and CI runs all four shards.
- CI on the final head: see the PR's CI-result comment.

## Follow-ups

- Once CI is green: `om-approve-merge-pr 349`.
