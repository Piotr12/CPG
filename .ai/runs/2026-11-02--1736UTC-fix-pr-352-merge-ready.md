# Drive spec PR #352 to merge-ready (om-auto-fix-pr)

**Date:** 2026-11-02 17:36 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-pr 352`, dispatched by cezar
**Spec:** `.ai/specs/2026-11-02--1612UTC-mrp-late-requisition-warning.md` (the PR's only content; issue #322, implementation PR #354)
**Status:** done

## Goal

#352 is a spec-only PR. CI was red at `0d0f3277` (`unit-tests (2)`, `unit-coverage`). Bring it up to date with `main`, review the spec and fix what the review finds, get CI green, and leave it ready for a human approval.

## Log

- 17:36 Claimed #352 (no earlier claim signals). Checked out `spec/late-requisition-warning` in this cezar worktree.
- 17:37 The red jobs failed one test only: `tests/ai-filenames.test.ts` ("a spec is never active and implemented or archived at once"). The cause was on the base: #320's spec had an active copy on `main` at `2dc4ad75`, and #350 deleted it. Merged `origin/main` (`627b3b9a`) with no conflict, which made the merge commit `9218a234`. After `npm ci`, `npx vitest run tests/` passed (26 files, 449 tests).
- 17:38 `om-auto-review-pr 352 --autofix` ran a specification review. It checked the spec against the code at `main`: `scheduleProposal`'s late rule, `MrpSupply`'s fields, `invalidSets` against `parametersOf`, `compareWarnings`/`toStoredWarning`'s fall-through to Overdue Supply, `MrpRunService`'s `isMrpWarningCode` routing and the older image's fallback (the rollback note), `ICONS`, and the EN/PL mark texts. Every claim matched. No blocker or major.
- 17:39 It fixed three items in `8804f153`:
  - Minor: the plan names the integration seam a new mark kind opens (exact `marks` assertions in `mrp-report-api.test.ts`; lesson 2026-11-01).
  - Minor: the plan says the mark reuses `marks.documents.requisition`. #354 already does.
  - Nit: the Problem Statement's Late Supply example reads "Oct 3", as the English screen shows it.
- 17:39 The review went in as a comment, because the pipeline account can't approve its own PR (lesson 2026-10-17). `review` stays the pipeline label, with `skip-qa`. UI QA: n/a, since the PR is one spec document.

- 17:42 Posted the summary and the label rationale, then swapped `in-progress` for `ci-monitoring`. CI run 41493399904 on `fced907a` followed.
- 17:56 Every job passed except `integration-tests (2)`. It failed in `smoke.test.ts:39`, where `browser.title()` read `''` right after `signInAsAdmin`, in a file this PR doesn't touch. Reran the failed job once, and it passed at 18:05. A confirmed flake: filed #358, whose likely cause is a title read before the metadata streams in.

## Changes

- `9218a234`: merged `origin/main` (no conflict).
- `8804f153`: the spec's Implementation Plan steps 5 and 6, and the Problem Statement's date format.
- This run log.

## Verification

- `npx vitest run tests/` after the merge and again after the fixes: 26 files, 449 tests passed (`ai-filenames` and `spec-images` included).
- Not run: `npm run lint`, `typecheck`, `test:coverage` and `build`. The PR changes no code, so they would test only `main`'s code; CI runs them on the merged tree.
- CI at `fced907a`: 11 checks, 1 workflow run, all completed and green after the one rerun of `integration-tests (2)`. The final head, which carries only this run log's update, is reported in the PR's CI-result comment.

## Follow-ups

- #358: the `smoke.test.ts` title-read flake. Every review finding was fixed in the PR, so it needed no follow-up. Merge order: merge #352 first, then merge `main` into #354, which deletes the active copy, and wait for a fresh green run (lesson 2026-11-02).
