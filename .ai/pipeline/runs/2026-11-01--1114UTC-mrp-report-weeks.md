# Execution plan — MRP report weeks and marks (#285)

**Date:** 2026-11-01 11:14 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-write-spec` (#323) → `om-auto-implement-spec`
**Source doc:** .ai/specs/implemented/2026-11-01--1105UTC-mrp-report-weeks.md
**Spec PR:** #323 (design-only)
**Issue:** #285 (E18-S02)

## Goal

Implement the spec: overdue supply and overdue transfer arrivals stored as warning rows of the run (no migration), a pure weekly fold and marks on read, `bucket=day|week` on the latest-run read and the MRP page, and a Day/Week switch, a week table and a Warnings column on the one-pair view.

## Scope

- `packages/core`: `domain/mrp/warnings/overdue.ts` (new), `domain/mrp/report/weekly.ts` and `plan-marks.ts` (new), `mrp-result.ts`, `plan-mrp.ts`, `validators/mrp/mrp-latest.schema.ts`, `services/mrp/mrp-run.service.ts` and `mrp-run-view.ts`.
- `packages/db`: the `MrpRunException` doc comment only.
- `packages/app`: `components/mrp/*`, the MRP page, EN/PL messages, the `mrp` help topic.
- Tests: unit, `mrp-report.test.ts` and `mrp-report-api.test.ts` integration.
- Docs: BACKWARD_COMPATIBILITY.md §4, engineering standards, the acceptance catalogue, the spec's implementation notes.

**Non-goals:** marks for overdue demand (spec Q2); E18-S03's exception list (#286); any migration.

## Risks

- Seams with existing assertions: the plan's key list in `mrp-run.service.test.ts`, the `exceptions: []` of overdue cases, the integration tests that read the day table by column (lesson 2026-11-01).
- Week arithmetic must stay exact (`bigint`), with negatives through `formatSignedQuantity`.

## Implementation Plan

### Phase 1: Overdue warnings in the run
1. `warnings/overdue.ts`, `MrpResult.warnings`, `planMrp` — unit tests.
2. `MrpRunService.run` stores warnings after exceptions — service test.

### Phase 2: Weeks and marks (pure)
3. `report/plan-marks.ts` — unit tests.
4. `report/weekly.ts` — unit tests (UX-027, partial weeks, W53/W1, fractional negative).

### Phase 3: The read and the API
5. `bucket` on both schemas — tests.
6. `latest`: warnings out of `exceptions`, `marks`, `weeks`, `bucket` — service tests.
7. Read budget for the week read, route test.

### Phase 4: The screen
8. `MrpMarks`, the Proposals badge.
9. The switch, the week table, the Warnings column, messages, page.
10. The `mrp` help topic, EN and PL.

### Phase 5: Integration and close-out
11. Integration tests: `mrp-report.test.ts`, `mrp-report-api.test.ts`.
12. BACKWARD_COMPATIBILITY.md, engineering standards, acceptance catalogue, spec implementation notes.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Overdue warnings in the run

- [x] 1.1 warnings/overdue.ts, MrpResult.warnings, planMrp — 7a920d17
- [x] 1.2 MrpRunService.run stores warnings after exceptions — 7a920d17

### Phase 2: Weeks and marks (pure)

- [x] 2.1 report/plan-marks.ts — caeff841
- [x] 2.2 report/weekly.ts — caeff841

### Phase 3: The read and the API

- [x] 3.1 bucket on both schemas — be3b0130
- [x] 3.2 latest: warnings out of exceptions, marks, weeks, bucket — be3b0130
- [x] 3.3 read budget for the week read, route test — be3b0130

### Phase 4: The screen

- [x] 4.1 MrpMarks and the Proposals badge — e89907d5
- [x] 4.2 switch, week table, Warnings column, messages, page — e89907d5
- [x] 4.3 mrp help topic — e89907d5

### Phase 5: Integration and close-out

- [x] 5.1 integration tests — aa907462
- [x] 5.2 docs, catalogue, spec notes — 9abbc2ec

## Log

- 11:14 UTC — spec PR #323 opened; implementation branch `feat/mrp-report-weeks` from `main`, spec carried into `implemented/` (lesson 2026-10-23, "Close the paperwork"). 12 steps → `om-auto-create-pr` (no loop).
- Phases 1–4 — engine warnings, fold and marks, read and API, screen; each phase's tests green before its commit.
- 11:31 UTC — full `npm run test:coverage`: 651 files, 5208 tests passed; one branch of `mrp-run.service.ts` (a warning row with no date or details) was uncovered, now covered by its own test. `npm run lint`, `npm run typecheck`, `npm run build` exit 0.
- 11:31 UTC — integration, no Docker on this machine (lesson 2026-10-23): standalone build on a fresh `DATA_DIR`, `mrp-report.test.ts`, `mrp-report-api.test.ts`, `mrp-accept.test.ts` 21/21 passed, `mrp-run-api.test.ts` 11/11 passed.
- Deviation from the spec: the warning codes carry no messages (never listed), recorded in the spec's implementation notes.
