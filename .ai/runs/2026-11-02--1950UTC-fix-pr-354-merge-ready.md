# Drive PR #354 to merge-ready (om-auto-fix-pr)

**Date:** 2026-11-02 19:50 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-pr 354`, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-11-02--1612UTC-mrp-late-requisition-warning.md` (issue #322, spec PR #352)
**Status:** done

## Goal

#354 implements #322's Late Requisition warning. Its CI was red at `d673a24c` only on `tests/ai-filenames.test.ts`, which `main`'s duplicate spec copies caused. Spec PR #352 has merged since. Merge `main`, delete the active spec copy, re-review the merged tree, get CI green, and leave it ready for QA and a human merge.

## Log

- 19:48 Claimed #354 (no earlier claim signals). The PR branch is checked out, clean, in the authoring task's worktree, so this run works on `cez/e17687ab` reset to the PR head (`d673a24c`) and pushes to `feat/mrp-late-requisition-warning`.
- 19:49 Merged `origin/main` (`fb574a24`) with no conflict, as `127d4dca`. It brings #349, #352, #355 and #356. #356 also edits `plan-mrp.ts`, `mrp-result.ts` and `plan-mrp.test.ts`; the hunks don't overlap.
- 19:49 `tests/ai-filenames.test.ts` failed on two specs:
  - #322's spec, active from #352 and implemented from this PR. The implemented copy was taken from an earlier draft of #352, which review then edited (Implementation Plan steps 5 and 6, "Oct 3"). Made the implemented copy #352's final text with `Status: implemented`, and deleted the active one.
  - #327's spec (`2026-11-02--1613UTC-mrp-root-requirement-ranking.md`): #355 merged its active copy after #356 had carried it into `implemented/`, so `main` fails this test at `fb574a24`. The implemented copy carries #356's implementation notes, so deleted the active copy here too. `main` stays red until this PR or another one deletes it there.
  - Committed as `0a53602b`. The test passed afterwards (5/5).
- 19:50 Seam check: `mrp-report-supply.test.ts` (new on `main`) reads no `marks`, so the new mark kind can't change its assertions.
- 19:51 The first gate run failed typecheck on module resolution only: this worktree had no install. Ran `npm ci` and reran the gate, which passed. Pushed `9503cfc7`.
- 19:55 `om-auto-review-pr 354 --autofix` re-reviewed the merge and the spec commits and found nothing. The PR's code is unchanged since the approved review of `d673a24c`. Approved as a comment, since this account authored the PR. Pipeline label `review` → `merge-queue`, `needs-qa` kept. Posted the manual-QA instructions.
- 19:58 `om-auto-qa-pr 354` ran while CI was queued. The UI stage comes after CI in the skill's order, but CI can only change the code if it fails, and here it didn't. Docker wasn't running, so instead of `test-env-up.sh`, the run started the production build with `next start` on a fresh data directory, as the author's evidence run had. `mrp-accept.test.ts` passed 3/3 against it. All 8 browser steps passed, and their screenshots are on `qa-evidence/pr-354`:
  - the mark in EN and PL, in the Day and Week views;
  - the requisition required on its need date, with unchanged figures;
  - the help topic;
  - a negative case: required on today + lead time, no mark;
  - a 390 px viewport.
- 20:20 Pitfall: in zsh, a loop variable named `path` overwrites `PATH`, so every command in the loop fails with "command not found".
- 20:28 Reported, then swapped `in-progress` for `ci-monitoring`. CI run 41515879689 on `139f8503` passed all 11 jobs.
- 21:05 #353 had merged meanwhile, with the PR showing `DIRTY`. It deleted #327's active copy on `main` and wrote the same incident into the spec-copy lesson, which conflicted with this run's line. Took `main`'s lesson. Merged with typecheck clean and the MRP unit tests passing (55 files, 735 tests).
- 21:05 Correction: this run had moved the pipeline label to `merge-queue`. Lesson 2026-10-17 keeps a self-authored PR in `review` and leaves approval to a human, so it went back to `review`.

## Changes

- `127d4dca`: merged `origin/main`.
- `0a53602b`: spec copies (#322's synced to #352's final text and its active copy deleted, #327's active copy deleted).
- A second merge of `origin/main` (`e6de7705`, #353). Its lesson replaced this run's own line.
- This run log.

## Verification

- Local gate on `9503cfc7` (merged tree):
  - `npm run lint`: pass.
  - `npm run typecheck`: pass.
  - `npm run test:coverage`: 673 files and 5594 tests pass (2 skipped), at 100% statements (13803/13803), branches (6387/6387), functions and lines.
  - `npm run build`: pass.
- `npx vitest run tests/ai-filenames.test.ts`: 5/5 after the spec cleanup.
- `CPG_BASE_URL=http://localhost:3217 npm run test:integration -- tests/integration/mrp-accept.test.ts`: 3/3 against the production build.
- Browser QA: PASS, 8/8 ([evidence](https://github.com/Piotr12/CPG/pull/354#issuecomment-6587181049)).
- CI on `9503cfc7` (run 41514429487): lint, typecheck, build, `unit-tests (2)` and `unit-timing` passed. The integration shards and `unit-tests (1)` were still running when this log was pushed. The final head, which carries only this log and the lesson, passed all 11 jobs (run 41515879689). The head after the #353 merge gets its own run, reported in the PR's CI-result comment.

## Follow-ups

- `main` failed `tests/ai-filenames.test.ts` at `fb574a24` because of #327's duplicate spec copy. #353 has since deleted it on `main`.
- No review findings to file. The QA reviewer still owes the `needs-qa` sign-off, and a human owns the merge (`om-approve-merge-pr`).
