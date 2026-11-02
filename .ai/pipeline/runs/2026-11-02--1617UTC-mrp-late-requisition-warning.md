# Execution plan: MRP Late Requisition warning (#322)

**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 322` → feature route → `om-auto-implement-spec`)
Source doc: .ai/specs/implemented/2026-11-02--1612UTC-mrp-late-requisition-warning.md
Spec PR: #352 (design only; merge it **first**, since this branch carries the spec into `implemented/`)
Issue: #322

## Goal

Record #322's decision (a document accepted from a Late Supply proposal keeps its need date) and ship the Late Requisition warning: every run stores `LATE_REQUISITION` for an Open requisition its pair's Buy lead time can't meet, read as a `late-requisition` mark on the MRP page and API.

## Scope

- Engine: `warnings/late-requisition.ts` (new), `warnings/overdue.ts`, `mrp-result.ts`, `plan-mrp.ts`.
- Read: `report/plan-marks.ts`.
- Screen and copy: `app/src/components/mrp/mrp-marks.tsx`, `i18n/messages/{en,pl}.ts`, `help/topics.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md`, the spec into `implemented/`.
- Integration: `tests/integration/mrp-accept.test.ts`.

**Non-goals:** acceptance dates (unchanged, Q1), production-order lateness, sizing, the stale check, the automatic batch.

## Risks

- `main` currently fails `tests/ai-filenames.test.ts` (#320's spec in both places). #350 fixes it, and this PR's CI fails that test until #350 merges.
- A new warning code reaches every `MrpWarning` switch, but the compiler catches each one.

## Log

- 16:09 UTC Classified #322 as a feature (label `feature`), assigned to the current user, so re-entry. `SDLC.md` has no Definition of Ready. The issue is itself a decision request, so the owner was asked first. The owner then said to proceed autonomously, so the recommended option was taken: need date plus a Late Requisition warning (spec Q1, Q2).
- Analysis: option 3 (planned finish, accept staleness) double-orders on the next run. Option 2 (planned finish plus sizing) hides shortages for all late supply. Option 1 is what #319 and #345 ship.
- Found `main` failing `tests/ai-filenames.test.ts`. #350 (open, by someone else) already deletes the duplicate, so no PR from this run.
- 16:15 UTC Spec PR #352 opened. A fresh-context review (no Critical findings) was folded in.

## Implementation Plan

### Phase 1: Engine and stored warning
1. `MrpLateRequisition` and `lateRequisitionWarnings`, codes and helpers, `planMrp`, with unit tests.

### Phase 2: Read and screen
2. `planMarks` `late-requisition`, mark order, weekly fold, service read, with tests.
3. `MrpMarks` icon and text, EN/PL messages, help, with tests.

### Phase 3: Docs and integration
4. `BACKWARD_COMPATIBILITY.md` and the acceptance evidence.
5. Integration test in `mrp-accept.test.ts`.
6. Full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine and stored warning

- [ ] 1.1 Late requisition warnings in the engine

### Phase 2: Read and screen

- [ ] 2.1 Late requisition marks on read
- [ ] 2.2 Mark text, copy and help

### Phase 3: Docs and integration

- [ ] 3.1 Compatibility notes and acceptance evidence
- [ ] 3.2 Integration test
- [ ] 3.3 Full validation gate
