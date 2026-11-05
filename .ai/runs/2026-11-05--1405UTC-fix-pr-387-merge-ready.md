# Drive PR #387 (MRP typed shortages) to merge-ready

**Date:** 2026-11-05 14:05 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr`, dispatched by cezar)
**Spec:** `.ai/specs/implemented/2026-11-05--1056UTC-mrp-typed-shortages.md`
**Status:** in progress

## Goal

Bring #387 up to date with `main`, run the review-autofix, CI and UI stages, and leave it merge-ready (never merge).

## Log

- 14:05 Claimed #387 (assignee, `in-progress`, claim comment). The PR branch is checked out, clean, in another cezar worktree, so this run works on its own task branch pointed at the PR head and pushes to `feat/issue-380-mrp-typed-shortages`.
- 14:08 Merged `origin/main` (#378, #379, #382, #386). One conflict: the acceptance catalogue's `Last updated` line, where both sides prepend an entry. Kept #380's entry first and recomputed its counts against `main`'s 523/12: 529 Passed (automated), 6 Partially verified (row tally agrees). The merge also re-added the active copy of the spec #386 landed; deleted it, since this branch moves the spec to `implemented/` (the implemented copy only adds the status and Implementation notes). Typecheck and the merged-in MRP tests pass; pushed `fa863303`.

## Changes

- `fa863303` merge of `origin/main`.

## Verification

## Follow-ups
