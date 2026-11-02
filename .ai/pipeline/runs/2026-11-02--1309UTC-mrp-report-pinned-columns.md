# Execution plan — MRP report pinned columns (#311)

**Date:** 2026-11-02 13:09 UTC
**Agent:** Claude Code / Opus 5.5 (cezar task b9337d0d, `om-auto-fix-issue 311` → feature route)
**Source doc:** `.ai/specs/implemented/2026-11-02--1303UTC-mrp-report-pinned-columns.md` (spec PR #341)
**Issue:** #311
**Status:** done

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

PR: #342

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: DataTable pinned-end columns

- [x] 1.1 DataTable pin end option with unit tests — 3f805112

### Phase 2: MRP report

- [x] 2.1 Pin the day and week balance and shortage columns — 5dd477ba, b43fcfcb
- [x] 2.2 Integration test for pinned columns at 1280 and 390 px — a105507e

### Phase 3: Close

- [x] 3.1 Spec to implemented, stale spec copy deleted, lessons — e58a62ff
- [x] 3.2 Full validation gate and screenshots — e58a62ff

## Log

- 13:09 UTC — Branched `feat/mrp-report-pinned-columns` from `origin/main` (not stacked on #341, lesson 2026-10-23). Started `npm ci` (lesson 2026-10-27).
- 13:20 UTC — Phases 1–2 landed. Docker isn't available on this machine, so the integration tests ran against a local standalone production build (lesson 2026-10-23). `mrp-report.test.ts` passed 14/14, and `mrp-accept.test.ts` with `mrp-report-api.test.ts` passed 10/10.
- 13:22 UTC — Full gate green: `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (665 files, 5454 tests, 100% statements and lines), `npm run build` 0. Screenshots (EN and PL, Day and Week, at the start and the middle of the scroll) are on PR #342.

## Verification

- Lint, typecheck, coverage and build: all exit 0, as above.
- Integration: run locally on the standalone build; the full suite runs in CI.
- `tests/ai-filenames.test.ts` passes now that #289's stale copy is deleted.

