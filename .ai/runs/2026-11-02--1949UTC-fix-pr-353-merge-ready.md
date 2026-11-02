# Drive PR #353 (#336, MRP Week view large figures) to merge-ready

**Date:** 2026-11-02 19:49 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr` → `om-auto-review-pr --autofix`, dispatched by cezar)
**Spec:** none (bug, issue #336)
**Status:** done

## Goal

Get PR #353 merge-ready: up to date with `main`, an approvable review, and all required checks green. Its only red checks were `unit-tests (2)` and `unit-coverage`. Both failed on `tests/ai-filenames.test.ts`, which `main` itself failed until #350 merged.

## Log

- 19:45 — Claimed #353. No foreign lock, and the earlier `ci-monitoring` label was already gone.
- 19:46 — Merged `origin/main` (7 commits, #350 included) into `fix/issue-336-mrp-week-large-figures`. No conflicts. None of the merged commits touch `weekly.ts`, `plan-summary.ts` or `signed-quantity.ts`; #349's snapshot reader changes are unrelated to the week fold.
- 19:49 — Re-review: there are new commits since the 16:17 review (the docs-only run-log commit and this merge). The code diff (`weekly.ts` now reads stored figures with `parseStoredFigure`, plus two regression tests) is unchanged and still correct. No inherited review or inline comments are open.
- 19:54 — `npm run test:coverage` on the merge: 671/672 files pass and the coverage thresholds hold, but `tests/ai-filenames.test.ts` fails again on `main`'s own state. #356 merged after its spec PR #355 without deleting the active copy, so `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md` is in both `.ai/specs/` and `implemented/`. No open PR fixes it. I deleted the active copy here, as #335 and #348 did for earlier copies, so #353 doesn't wait on another PR, and merging it repairs `main`. If a separate fix lands first, both delete the same file and the merge stays clean. The case is added to the existing spec-stacking lesson.

- 20:00 — Pushed `e98a5adf`. Posted the re-review (approve, as a comment, because the author can't approve their own PR). Swapped `in-progress` for `ci-monitoring`. Labels: `bug`, `merge-queue`, `skip-qa`, `priority-low`, `risk-low`.
- 20:25 — CI run 41514324377 on `e98a5adf`: all 11 checks pass, and the PR is `CLEAN` / `MERGEABLE`. This log is committed after that run, so CI runs once more on a docs-only commit.

## Changes

- Merge of `main` into the PR branch.
- Deleted `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md`, the active duplicate of the implemented copy.
- `.ai/lessons.md`: one sentence on #356/#355 added to the spec-stacking lesson.
- This run log.

## Verification

- `npm ci`, `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage` (before the deletion): 671/672 files, 5,583 tests pass, and no coverage threshold is missed. The one failure is `tests/ai-filenames.test.ts`, on the duplicate above.
- After the deletion: `npx vitest run tests/ --exclude 'tests/integration/**'` passes all 26 files (449 tests), `tests/ai-filenames.test.ts` included.
- `npm run build`: pass.
- No integration file is touched, so no local integration run.
- CI run 41514324377 (`e98a5adf`): lint, typecheck, build, `unit-tests (1)`, `unit-tests (2)`, `unit-timing`, `unit-coverage` and integration shards 1–4 pass.

## Follow-ups

- Merge through `om-approve-merge-pr` once the final head's CI is green. It also clears the duplicate spec on `main`.
- The spec-copy race keeps recurring, and #351 tracks a guard for it.
