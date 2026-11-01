# Drive spec PR #325 (mrp-bom-explosion) to merge-ready

**Date:** 2026-11-01 15:04 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr 325`, dispatched by cezar)
**Spec:** `.ai/specs/2026-11-01--1107UTC-mrp-bom-explosion.md` (the PR's subject; design-only)
**Status:** in progress

## Goal

Bring #325 up to date with `main`, get its review approvable and its required checks green, and hand it to `om-approve-merge-pr`. Don't merge it.

## Log

- 15:00 Claimed #325 (assignee, `in-progress`, claim comment). Checks on `ea1524f0`: everything green except `unit-tests`. The only failure is `tests/ai-filenames.test.ts`, "a spec is never active and implemented or archived at once", on `implemented/2026-11-01--1105UTC-mrp-report-weeks.md`.
- 15:02 Root cause is on `main`, not in this PR. #323 (the spec PR for #285) merged after #324 (its implementation) had already carried the spec into `implemented/`, so `main` at `ee6f9f00` has both copies. `main`'s Deploy for `ee6f9f00` failed for the same reason. Lesson 2026-11-01 ("Don't stack the implementation PR…") describes exactly this, and #315 and #317 fixed the earlier case by deleting the active copy in their own branch. I did the same: the active copy differs from the implemented one only by `Status`, its image links and the implementation notes, so the deletion loses nothing.
- 15:04 Merged `origin/main` (`ee6f9f00`) with no conflicts, then deleted `.ai/specs/2026-11-01--1105UTC-mrp-report-weeks.md` (`480501b0`).

## Changes

- Merge of `main` into `spec/mrp-bom-explosion`.
- `480501b0`: deleted the active copy of the mrp-report-weeks spec.

## Verification

## Follow-ups

- When #325 merges, #326 (the implementation, branched from `main`) must merge `main` and delete the active copy of this spec before it merges itself (lesson 2026-11-01).
