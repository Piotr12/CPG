# Execution plan — MRP report explanations (#286)

Source doc: .ai/specs/implemented/2026-11-02--0652UTC-mrp-report-explanations.md
Spec PR: #334 (design only)
Issue: #286
Engine: om-auto-create-pr (steps: 7, --loop: no)

## Goal

Implement the spec on the last MRP report:
- Each production-order proposal shows its chosen BOM with every rejected BOM, its reason and its exact shortages.
- The report lists provisional plans (not executable), at-risk production orders and planning exceptions for the pairs on the page.
- The day and week tables show at-risk supply.

To get there, the run stores a feasible fallback's rejections as `BOM_REJECTIONS` rows, and the latest-run API adds `rejectedBoms`.

## Scope

- `packages/core/src/domain/mrp/`: `exceptions/stored-exception.ts` (`order`), `provisional/stored-provisional.ts` (rejections whenever present), `report/bom-rejections.ts` (new).
- `packages/core/src/services/mrp/`: `mrp-run.service.ts`, `mrp-run-view.ts`, their tests, the timing and reads tests.
- `packages/app/src/components/mrp/`: `mrp-bom-rejections.tsx`, `mrp-explanations.tsx` and `mrp-exception-text.ts` (all new), plus `mrp-proposals.tsx` and `mrp-report.tsx`. Also the i18n EN/PL dictionaries and the help topic.
- `tests/integration/mrp-report.test.ts` and `mrp-report-api.test.ts`.
- `BACKWARD_COMPATIBILITY.md`, the `MrpRunException` entity comment and the acceptance catalogue.

**Non-goals:**
- No engine calculation change.
- No schema change.
- No run-wide explanations view.
- Accepting Make proposals is still E19.

## Implementation Plan

### Phase 1: Core
1. Rejections: store and parse (spec step 1).
2. Service: write and read `BOM_REJECTIONS`, `rejectedBoms` on proposals, provisional actions and the BOM exceptions (spec step 2).

### Phase 2: App
3. Copy: EN/PL texts and `mrp-exception-text.ts` (spec step 3).
4. Screen: Why this BOM, Explanations, the at-risk column (spec step 4).
5. Help topic (spec step 5).

### Phase 3: Integration and docs
6. Integration tests (spec step 6).
7. Docs, catalogue and spec notes (spec step 7).

## Risks

- The page's unit tests pin the day and week columns, so they move with the new column.
- The timing test's row total includes the new rows, so it counts by code.

## Log

- 06:44 `om-auto-fix-issue 286`: feature route. The FR triage passed: dependencies #280, #283 and #284 are closed, and no spec or PR existed. The issue was claimed.
- 06:52 Spec written (`om-auto-write-spec`). A fresh-context review found nothing Critical, and its findings are folded in. Spec PR #334 is open, and it also deletes the stale active copy of the #283 spec that fails `tests/ai-filenames.test.ts` on `main`.
- 07:02 Branched `feat/mrp-report-explanations` from `origin/main`, with the spec carried straight into `implemented/` (lesson 2026-10-23) and the same stale-copy deletion. This plan is the run log.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Core

- [ ] 1.1 Rejections: store and parse
- [ ] 1.2 Service: write and read BOM_REJECTIONS and rejectedBoms

### Phase 2: App

- [ ] 2.1 Copy: EN/PL texts and mrp-exception-text
- [ ] 2.2 Screen: Why this BOM, Explanations, at-risk column
- [ ] 2.3 Help topic

### Phase 3: Integration and docs

- [ ] 3.1 Integration tests
- [ ] 3.2 Docs, catalogue and spec notes
