# Execution plan: MRP typed shortages, stored, in the API and on the report (#380)

**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 380` → feature route → `om-auto-write-spec`, then `om-auto-implement-spec`)
Source doc: .ai/specs/implemented/2026-11-05--1056UTC-mrp-typed-shortages.md
Spec PR: #386 (design only, a draft until Q1 is confirmed; merge it **first**, since this branch carries the spec into `implemented/`)
Issue: #380

## Goal

Store each run's ranked shortages (`MrpPlan.shortages`) as `SHORTAGE` rows, return them per plan from `GET …/mrp/runs/latest`, and list each day's short requirements in priority order on the report's Day view, so that DEM-018 to DEM-022 and MRP-044 pass.

## Scope

- Engine: `plan-mrp.ts`, no shortages for an unreadable material (spec Q11).
- Stored form: `domain/mrp/report/stored-shortages.ts` (new).
- Service: `services/mrp/mrp-run.service.ts` (write and read) and `mrp-run-view.ts`.
- Screen and copy: `app/src/components/mrp/mrp-shortages.tsx` (new), `mrp-report.tsx`, `i18n/messages/{en,pl}.ts`, `help/topics.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md`, `research/CPG-acceptance.md`, the spec into `implemented/`.
- Integration: `tests/integration/mrp-shortages.test.ts` (new).

**Non-goals:** the ranking, any quantity, the Week view, the pair list, marks, exceptions and acceptance.

## Risks

- Run time: the ranking returns to every run. Baseline on `main` (this machine, 2026-11-05 10:58 UTC): realistic 1,464 ms with a 302 ms stall, ten-times 9,528 ms with a 450 ms stall, worst case for proposals, ten-times, 6,529 ms with a 413 ms stall.
- Tests that read every `mrp_run_exception` row see the new code.

## Log

- 10:55 UTC Classified #380 as a feature (`feature` label). No spec existed, `SDLC.md` has no Definition of Ready, and nobody had claimed it, so the feature route applied: F3c. Claimed the issue.
- 10:56 UTC Wrote the spec autonomously (11 resolved assumptions, Q1 ⚠). A fresh-context review found nothing Critical. Its two High findings were folded in: yield on time, and status draft. So were its Medium and Low ones.
- 11:00 UTC Spec PR #386 opened as a draft, with labels and assumptions comments on the PR and the issue.
- 11:01 UTC Implementation branch `feat/issue-380-mrp-typed-shortages` from `main`.

## Verification

(filled at the end)

## Implementation Plan

### Phase 1: Stored form and engine
1. `stored-shortages.ts` (`toStoredShortage`, `readStoredShortage`), and no shortages for an unreadable material in `planMrp`, with unit tests.

### Phase 2: Write and read
2. `writeResults` writes `SHORTAGE` rows and yields on time. `exceptionsOf`, `describe` and `MrpPlanView.shortages`, with service tests for the six rows, read-only access, Test reset, rerun and positions. The timing test counts the rows, and is compared with `main`.

### Phase 3: Screen and copy
3. `MrpShortages`, the Day view column, EN/PL messages, the intro and help, with component, page and help tests.

### Phase 4: Docs and integration
4. `BACKWARD_COMPATIBILITY.md`, and the six acceptance rows to Passed (automated).
5. `tests/integration/mrp-shortages.test.ts`, plus `mrp-report.test.ts` and `mrp-report-api.test.ts`.
6. Full validation gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Stored form and engine

- [ ] 1.1 Stored shortages and the unreadable-material rule

### Phase 2: Write and read

- [ ] 2.1 Store and read the shortages

### Phase 3: Screen and copy

- [ ] 3.1 Short requirements on the Day view

### Phase 4: Docs and integration

- [ ] 4.1 Compatibility notes and acceptance rows
- [ ] 4.2 Integration test
- [ ] 4.3 Full validation gate
