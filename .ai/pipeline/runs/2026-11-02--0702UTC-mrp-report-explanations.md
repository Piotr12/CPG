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

- 07:09 Phase 1 (core) landed in one commit: the two steps share the rows and the read. Deviation: `exceptionRejections` keeps Missing Usable BOM's notation order, since its `inactive` list is already in engine order. Nine service tests asserted exact shapes, and each now asserts `rejectedBoms`, `order` or the new row; two of them (LFC-025, the rerun) became real assertions of a fallback's stored rejection. The worst-case stall measured 247 to 275 ms here against main's 257 to 274 ms on the same machine, with identical row counts: not this change.
- 07:19 Phase 2: the copy, `mrp-exception-text`, `MrpBomRejections`/`WhyBom`, `MrpExplanations`, the at-risk column and help. The Polish copy follows the help topic's glossary ("tymczasowy", "BOM-u"). `messages.test.ts` lists two new shared column headers (BOM, Status).
- 07:25 Phase 3: one shared setup (`tests/integration/mrp-explanations.ts`) at a location of its own, built before each file's MRP run. Docker unavailable, so the integration files ran against a standalone build. Both report files passed alone (21), but with every MRP file on one server `mrp-report.test.ts` lost its "cabinet sorts last" premise, because the setup's materials were newer. The setup now runs first, and all six MRP files pass (49). The design-token test refused half-step spacing.
- 07:27 Screenshots from the standalone server: the Explanations part, Why this BOM opened, and 390 px with no page overflow.
- 07:34 Gate: `npm run lint` 0, `npm run typecheck` 0, `npm run build` 0, `npm run test:coverage` 0 (660 files, 5,360 tests, 100% after adding the unknown-component shortage line to `mrp-proposals.test.tsx`; the first run stopped at 99.98% branches).

## Progress

PR: #335

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Core

- [x] 1.1 Rejections: store and parse — e296fb0b
- [x] 1.2 Service: write and read BOM_REJECTIONS and rejectedBoms — e296fb0b

### Phase 2: App

- [x] 2.1 Copy: EN/PL texts and mrp-exception-text — bab955d5
- [x] 2.2 Screen: Why this BOM, Explanations, at-risk column — bab955d5
- [x] 2.3 Help topic — bab955d5

### Phase 3: Integration and docs

- [x] 3.1 Integration tests — 5f84a9c9, 442f4a66
- [x] 3.2 Docs, catalogue and spec notes — 03cf72dd
