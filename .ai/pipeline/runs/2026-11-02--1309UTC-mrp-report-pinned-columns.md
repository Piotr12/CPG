# Execution plan — MRP report pinned columns (#311)

**Date:** 2026-11-02 13:09 UTC
**Agent:** Claude Code / Opus 5.5 (cezar task b9337d0d, `om-auto-fix-issue 311` → feature route)
**Source doc:** `.ai/specs/2026-11-02--1303UTC-mrp-report-pinned-columns.md` (spec PR #341)
**Issue:** #311
**Status:** in progress

## Goal

From 1024 px up, `DataTable` pins up to two columns to the table's right edge. The MRP day table pins Projected before proposals and Shortage, and the week table pins Lowest projected balance and Peak shortage. At 1280 × 800 with the menu expanded, the date, the balance and the shortage are then in view together, in EN and PL. A real-browser test proves it.

## Scope

- `packages/ui/src/backend/tables/data-table.tsx` (+ test): `pin?: "end"`.
- `packages/app/src/components/mrp/mrp-report.tsx` (+ test): four flags.
- `tests/integration/mrp-report.test.ts`: one new test.
- Paperwork:
  - the spec moves to `implemented/`;
  - the stale active copy of #289's spec is deleted, the same deletion as on #341, since `main` at ab0b20da fails `tests/ai-filenames.test.ts`;
  - lessons.

## Non-goals

- Pinning in any other table.
- Column hiding.
- Any data, API or migration change.

## Risks

- `DataTable` renders every list, so unpinned columns must get no new class. The existing `data-table.test.tsx` assertions must pass unchanged.
- Sticky right in a collapsed-border table: use an inset shadow, not `border-l` (spec review).
- Projected after proposals sits between the pinned day pair, so it is reachable only at the end of the scroll. The test asserts it there.

## Implementation Plan

### Phase 1: DataTable pinned-end columns
1.1 Add `pin?: "end"` and its classes, offsets and throws, with unit tests.

### Phase 2: MRP report
2.1 Pin the day and week columns, with component tests.
2.2 Add the integration test at 1280 px (EN, PL, Day, Week) and at 390 px.

### Phase 3: Close
3.1 Move the spec to `implemented/`, delete #289's stale active copy, and add the lesson.
3.2 Run the full gate and take the screenshots.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: DataTable pinned-end columns

- [ ] 1.1 DataTable pin end option with unit tests

### Phase 2: MRP report

- [ ] 2.1 Pin the day and week balance and shortage columns
- [ ] 2.2 Integration test for pinned columns at 1280 and 390 px

### Phase 3: Close

- [ ] 3.1 Spec to implemented, stale spec copy deleted, lessons
- [ ] 3.2 Full validation gate and screenshots

## Log

- 13:09 UTC — Branched `feat/mrp-report-pinned-columns` from `origin/main` (not stacked on #341, lesson 2026-10-23). Started `npm ci` (lesson 2026-10-27).
