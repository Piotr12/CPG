# om-auto-fix-pr 297 — quantity-field tooltips to merge-ready

**Date:** 2026-10-27 07:57 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task d75a69b6, `om-auto-fix-pr 297`)
**Spec:** .ai/specs/implemented/2026-10-27--0526UTC-quantity-field-tooltips.md
**Status:** done — merge-ready pending CI, human approval and manual QA

## Goal

Drive PR #297 (#290, UX-014) to merge-ready without merging it: bring it up to date with `main`, then review, CI and UI checks until it is approvable, green and QA-evidenced.

## Log

- 07:57 — #297 was `CONFLICTING`. The spec PR #296 had been squash-merged (`65f00575`), and so had the MRP engine (#295, `a5104de1`). Claimed #297 (outer lock). New worktree in the task's tmp directory, because the task's cezar worktree holds an untracked `node_modules` symlink that `npm ci` must not touch.
- 07:58 — Merged `origin/main` (`fe49417b`). There was one add/add conflict, in the spec run log `.ai/runs/2026-10-27--0523UTC-quantity-field-tooltips-spec.md`; kept this branch's later version, since `main`'s equals the spec-branch tip. #296's squash also re-added `.ai/specs/2026-10-27--0526UTC-quantity-field-tooltips.md`, which this branch had moved to `implemented/`; removed that copy. `main`'s other changes (the MRP engine) touch only `packages/core` and `.ai/`, with no overlap with this PR.
- 08:10 — Gate on the merged tree:
  - `npm run lint` exit 0;
  - `npm run typecheck` exit 0;
  - `npm run test:coverage`: 602 files, 4666 tests, 100% statements, branches, functions and lines;
  - `npm run build` exit 0.

- 08:15 — Review stage (`om-auto-review-pr --autofix`): **approve**. Since the last approved review there's no code change; the merge is clean and there's no inherited feedback. CI on `ad24a117`: green, all 8 jobs.
- 08:20 — UI stage (`om-auto-qa-pr`). Docker is unavailable, so QA ran on the standalone production build, the documented fallback. **FAIL**, one regression from the earlier review fix `7dd6db7d`: React `autoFocus` focused the first field before Radix's focus trap listened, so *Change target* and *Change factor*, which open from a row menu, ended with focus on the menu's trigger behind the modal. Control 05b (planning-parameters *Change*, no `autoFocus`) kept focus. Evidence: comment `6436836360`.
- 08:35 — Iteration 2:
  - wrote the failing test first, through the real row-menu flow in `safety-stock-target-actions.test.tsx`;
  - fixed it in `46e36070`: `CrudForm` marks `data-autofocus`, and `DialogContent`'s `onOpenAutoFocus` focuses the marked element;
  - fresh-context re-review: approve, with one minor finding (Radix selects the value without scrolling, and my focus didn't), fixed in `8f2b640f`.

  Gate: 4671 tests, 100% coverage, build. Browser on the final build: QA 11/11 PASS (Edit, Change target and Change factor first focus; value selected; kg/bag text; Escape order; 390 px tap and the long text inside the viewport; Polish), and the touched integration files 47/47.

## Changes

- `fe49417b` merge of `origin/main`
- `46e36070` fix: row-menu dialogs keep first focus on a tooltip field (`data-autofocus` through `DialogContent`)
- `8f2b640f` fix: the marked field is focused as Radix does (value selected, no scroll); lesson and spec notes updated

## Verification

- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (4671 tests, 100%) and `npm run build` all pass at `8f2b640f`.
- Browser QA 11/11 and touched integration files 47/47, on the standalone build of `8f2b640f`.

## Follow-ups
