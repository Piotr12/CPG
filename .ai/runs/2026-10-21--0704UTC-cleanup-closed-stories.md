# Cleanup after closing #81, #82, #84, #87, #88, #89 and #94

**Date:** 2026-10-21 07:04 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none (housekeeping for `implemented/2026-10-20--2047UTC-production-orders.md`, `implemented/2026-10-20--2221UTC-production-completions.md`, `implemented/2026-10-20--2225UTC-stock-import.md`)
**Status:** done

## Goal

The human closed seven stories and asked for a check that they are really closed. Then the repository's `.ai/` paperwork should be brought in line: implemented specs in `implemented/`, and no run log or plan still claiming to be in progress.

## Log

- 07:04 — All seven numbers are **issues**, not PRs, and GitHub reports each one `closed` / `completed`:
  - #81 E07-S02 stock import;
  - #82 E07-S03 transfers;
  - #84 E08-S02 shipments;
  - #87 E09-S02 goods receipts;
  - #88 E10-S01 production orders;
  - #89 E10-S02 production completions;
  - #94 E13-S01 stock report.

  Each one's implementation PR is merged on `main`: #118, #111, #112, #109, #114, #119 and #120. None still carries an `in-progress` label. No PR is open.
- 07:05 — What was out of place:
  - Three specs were still active in `.ai/specs/` with **Status: ready**: production orders (#88), production completions (#89) and stock import (#81). The other four specs were already in `implemented/`.
  - Three run logs still said `in progress`: `2026-10-20--2045UTC-production-orders`, `2026-10-20--2153UTC-fix-pr-114` and `2026-10-20--2221UTC-production-completions-spec`.
  - The production-orders plan was `in-progress`, with step 3.2 unchecked. The stock-import plan had no status line.
  - Run logs, plans and two integration-test comments named the old spec paths.
- 07:06 — Moved the three specs with `git mv`, set their status to `implemented`, and added `## Implementation notes` that point to their PRs and to the deviations their plans record. Their image links went from `](assets/…)` to `](../assets/…)`, which is what `tests/spec-images.test.ts` asks for. Updated the old paths, and closed out the stale logs and plans with the merge facts.
- Decision: **epic closures stay out of this change.** All stories of E07 (#73), E08 (#74), E09 (#75), E10 (#76) and E12 (#78) are closed, but the epics are still open with unticked checklists. Every acceptance scenario for these stories still reads `Not executed` in `CPG-acceptance.md`. The E01–E05 precedent (`2026-10-20--1043UTC-close-epic-e05.md`) closes an epic with a validation pass and a catalogue rewrite against the tests. That is real verification work, one PR per epic, and not paperwork.

## Changes
- `git mv` of the three specs to `.ai/specs/implemented/`: status, implementation notes, `../assets/` links.
- `.ai/runs/2026-10-20--2045UTC-production-orders.md`, `2026-10-20--2153UTC-fix-pr-114.md`, `2026-10-20--2221UTC-production-completions-spec.md`: status `done`, outcome recorded.
- `.ai/runs/2026-10-20--2221UTC-issue-81-stock-import.md`: spec paths.
- `.ai/pipeline/runs/2026-10-20--2051UTC-production-orders.md` (status `complete`, 3.2 ticked), `2026-10-20--2234UTC-stock-import.md` (status line) and `2026-10-20--2235UTC-production-completions.md`: source doc paths.
- `tests/integration/stock-import-api.test.ts`, `tests/integration/stock-import.test.ts`: the spec path in a comment.

## Verification
- First attempt: `npm run typecheck` failed in `tests/test-reset-coverage.test.ts`, and coverage hit parse errors. The cause was the worktree's stub `node_modules`, not the diff; the lesson on fresh worktrees records it. `npm ci` fixed it (913 packages).
- `npm run lint`: 0 errors, 1 warning that predates this change (`lineError` unused in the BOM service).
- `npm run typecheck`: clean.
- `npm run test:coverage`: 431 files, 2789 tests passed, 100% statements (8072/8072), branches (3309/3309), functions (2703/2703) and lines (7136/7136). This includes `tests/spec-images.test.ts` (with the `../assets/` links) and `tests/ai-filenames.test.ts`.
- Not run: `npm run build` and the integration suite. This change touches no application code, and in the integration tests it changes only a comment. CI runs both.

## Follow-ups
- Close epics E07 (#73), E08 (#74), E09 (#75), E10 (#76) and E12 (#78) the way E01–E05 were closed: validate, update `CPG-acceptance.md`, tick the checklist and close. E11 (#77) and E13 (#79: #95 and #96) still have open stories.
- `.ai/specs/2026-10-17--1321UTC-mammoth-app-icons.md` and `2026-10-19--1312UTC-navigation-menu.md` are still active with status `ready`. Neither belongs to the seven stories, so neither was touched. The owner should check whether the sidebar spec (`implemented/2026-10-19--2048UTC-sidebar-navigation.md`) superseded the navigation menu spec.
