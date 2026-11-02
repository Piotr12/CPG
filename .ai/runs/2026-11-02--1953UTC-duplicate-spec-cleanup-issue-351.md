# Issue #351: Deploy deletes a spec's active copy a squash merge re-added (om-auto-fix-issue, feature route)

**Date:** 2026-11-02 19:53 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 62cb60f1)
**Spec:** `.ai/specs/2026-11-02--1953UTC-duplicate-spec-cleanup.md`
**Status:** in progress

## Goal
Run `om-auto-fix-issue 351`: stop a spec PR's squash merge from leaving a duplicate active spec copy on `main`, by blocking the merge or by removing the copy automatically before `main`'s deploy runs.

## Log
- 19:50 Classified #351 as a feature (label `feature`). No PR references it and no spec covers it. The only guard today is `tests/ai-filenames.test.ts`, which fails after the fact. `SDLC.md` has no Definition of Ready. Route F3c: `om-auto-write-spec 351`, then `om-auto-implement-spec`.
- 19:51 `main` has no branch protection or rulesets (`gh api …/branches/main/protection` answers 404). Piotr12 merged every racing pair 10–30 s apart. A required check would block nothing without a settings change, so the spec defaults to automatic removal in Deploy (Q1).
- 19:52 Claimed #351 (`in-progress`, claim comment; already assigned to Piotr12). Branch `spec/duplicate-spec-cleanup` from `origin/main` (fb574a24) in the cezar worktree, `npm ci`.
- 19:53 Wrote the spec autonomously, with 8 resolved assumptions and none marked ⚠.
- 19:57 Fresh-context review: revise. Applied its fixes:
  - The deletion moved out of Deploy into its own `spec-copies.yml`. Deploy runs in one serial queue, so a pair's dirty second merge would have waited 15–25 min behind the first deploy. Deploy now only checks, and skips CI and the deploy.
  - The pure `activeCopies` is split from the command `delete-spec-copies.ts`, so importing it in a test can't delete files, and it reaches 100% without an `import.meta.main` branch.
  - Added `erasableSyntaxOnly`, a `node` child-process test, exact shell commands, a top-level `permissions: contents: read` on Deploy, the `ls-remote` check for "main moved on", and "no loop".
  - Filed #360: a hand-started Deploy on another branch deploys that branch.
- 19:58 `main` (fb574a24) fails `ai-filenames` right now. #355 and #356 raced at 19:46 (16 s apart), which is this issue again. Open PR #354 deletes the active copy of #327's spec, and this branch deletes it too.
- 20:02 Spec PR #359 opened, ready, with labels, the label rationale and the defaults comment (on #359 and #351). Filed #360.

## Changes

## Verification

## Follow-ups
