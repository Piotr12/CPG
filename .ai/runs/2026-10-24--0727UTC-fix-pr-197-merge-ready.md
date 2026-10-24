# Drive PR #197 (#187, paged requisition list) to merge-ready

**Date:** 2026-10-24 07:27 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-pr 197`, dispatched by cezar
**Spec:** none (the PR's own run log covers #187)
**Status:** done: re-review approves (as a comment) and UI evidence passes. CI on the final head, human approval and QA sign-off still gate the merge.

## Goal
Bring PR #197 up to date with `main`, re-review it with autofix, get CI green, verify the UI, and hand it off merge-ready without merging.

## Log
- Claimed the PR. Its branch is checked out in another, finished cezar worktree (`abcbc29f`), so the work runs on a local `pr-197` branch tracking the PR head and pushes with `HEAD:fix/issue-187-page-requisitions`.
- Merged `origin/main` (#193, #194, #198, #199). Two doc-only conflicts. `.ai/lessons.md`: #194 had regrouped the lessons, so took main's file and re-added #187's paging lesson under *Integration tests and agent-browser*, after the pager-QA lesson. `BACKWARD_COMPATIBILITY.md`: main had already described the lifecycle states on the requisition list, so kept main's wording and re-added #187's `?page=` contract to the route and API bullets. Pushed `6d82635b`.
- `om-auto-review-pr 197 --autofix`: re-review approves with no fixes needed ([review](https://github.com/Piotr12/CPG/pull/197#pullrequestreview-5637346426)). Checked that nothing merged from `main` reads the requisition list whole. #199's Test reset restarts the requisition sequence, so `requisitionHref`'s ⌈N/100⌉ still holds. One nit: `test-reset-api.test.ts`'s `prodState()` snapshots each paged Prod list through its first page only. That holds for every paged kind, so it is filed as #201, not fixed here. Comment review, since GitHub refuses approval of one's own PR.
- `om-auto-qa-pr 197`: the earlier UI evidence predates the `LoadingMessage` commit (8073afa4). Docker isn't available, so it ran on the standalone fallback. The streamed HTML shows the loading shell first and the table in a later hidden boundary. The pager, the clamp to the last page, the 404 for page 0 and the 390 px width all PASS ([evidence](https://github.com/Piotr12/CPG/pull/197#issuecomment-6381529467)).

## Changes
- `6d82635b`: merge of `main`, resolving `.ai/lessons.md` and `BACKWARD_COMPATIBILITY.md`.
- This run log.

## Verification
- Local gate on `6d82635b`: `npm run lint` (0 errors, 1 old warning), `typecheck` 0, `test:coverage` 0 (3,558 tests, 100%), `build` 0.
- Integration on the standalone build, fresh `DATA_DIR`: `purchasing-api`, `purchasing` and `document-lifecycle`, 31/31.
- CI run 40074416262 on `6d82635b`: lint, typecheck, build, unit-tests and integration shards 2 and 4 passed. Shards 1 and 3 were still running when this log was pushed, and the push supersedes the run, so the final head gets its own.

## Follow-ups
- #201: make the Test-reset Prod snapshot read every page of each paged list.
