# Drive spec PR #386 to merge-ready (om-auto-fix-pr)

**Date:** 2026-11-05 13:29 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-pr 386`, dispatched by cezar
**Spec:** `.ai/specs/2026-11-05--1056UTC-mrp-typed-shortages.md` (issue #380, implementation PR #387)
**Status:** done

## Goal

#386 is the design-only spec PR for #380, typed MRP shortages. Bring it up to date with `main`, review the spec, get CI green, and leave it labeled and reported. It stays a draft until the owner answers Q1 ⚠, which asks whether a typed shortage list is wanted at all.

## Log

- 13:25 Claimed #386. There were no earlier claim signals, and the authoring run had released its lock. The PR branch isn't checked out anywhere else, so this run works on `cez/06867d25`, reset to the PR head (`8575c092`), and pushes to `spec/mrp-typed-shortages`.
- 13:26 Merged `origin/main` (`94b34ffb`) with no conflict, as `46c9ff65`. The PR still changes one file, the spec. `npx vitest run tests/` passed 29 files and 498 tests. Pushed.
- 13:28 `om-auto-review-pr 386 --autofix` ran the specification review, since every changed file is under `.ai/specs`. The spec matched the code at every point checked:
  - `withShortages` and `rankShortages`;
  - the `MrpShortage` fields and `MRP_SHORTAGE_KINDS`;
  - how `exceptionsOf` separates rows by code;
  - `MRP_ROW_CHUNK` (500) and `MRP_LATEST_PAGE_SIZE` (25);
  - the #316 rule for an unreadable material;
  - the `BOM_REJECTIONS` rollback note in `BACKWARD_COMPATIBILITY.md` §4.
  
  Q7's claim also holds against `rankShortages`: an entry with no Shortage figure can only be the safety gap. The review had no findings, so there was nothing to fix and nothing to file as a follow-up. It was posted as a comment, because GitHub rejects approving your own PR. Pipeline label `review` → `merge-queue`; `skip-qa` kept.
- 13:28 #387's `implemented/` copy of the spec is identical to this PR's copy, apart from `Status:` and its implementation notes, so the two copies haven't drifted. Merge order: #386 first, then #387 merges `main` and deletes the active copy (lessons.md, spec PR first).
- UI: n/a. The PR changes no app code.
- The PR stays a draft on purpose, because of the ⚠ NEEDS HUMAN CONFIRMATION guard on Q1. This run doesn't promote it.

## Changes

- `46c9ff65`: merged `origin/main`.
- This run log.

## Verification

- `npx vitest run tests/` passed 29 files and 498 tests, among them `ai-filenames` and `spec-images`.
- `lint`, `typecheck`, `test:coverage` and `build` were not run locally, because the diff is one Markdown document. CI runs them, and its result is posted on #386 as the `om-auto-fix-pr` CI-result comment.

## Follow-ups

- The owner answers Q1 on #386. If the answer is yes, mark the PR ready and merge it, then #387. If it is no, close #386 and #387, and restate the six acceptance rows or record exceptions for them.
