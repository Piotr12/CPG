# Execution plan — statistical unit (SU)

**Date:** 2026-10-25 09:40 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Issue:** #239 · **Spec PR:** #241 (merged)
Source doc: .ai/specs/2026-10-25--0913UTC-statistical-unit.md
**Status:** in progress

## Goal

Each product can carry one factor saying how many statistical units (SU) one base unit counts as, stored as an ordinary material conversion, so reports can add up different products. SU is never an entry unit.

## Scope

- `@cpg/core`: the registry's `statistical` dimension and `SU` unit (`STATISTICAL_UNIT`, `isStatisticalUnit`); the base-unit refusal (schema and service); the entry refusal in `convertToBaseQuantity`; the entry-unit filters (`listUnits`, completion preview, demo `unitsOf`); the pure `domain/units/report-units.ts`; `MaterialService.statisticalFactors()`; SU factors in `test-tenant-config.json`.
- `@cpg/ui`: a `CrudField` hint that can follow the form's values, for the SU hint in the Add conversion dialog.
- `@cpg/app`: the *Statistical* group label, the base-unit select without that group (keeping a stored `SU`), the SU hint, the Stock page filter, the Statistical units page with its nav entry, help topic and EN/PL texts.
- Docs: `engineering-standards.md` (one line), `BACKWARD_COMPATIBILITY.md`, the spec moved to `implemented/`.

**Non-goals:** any report that uses SU (that is #240), SU-based entry, several SUs, dated factors, a per-tenant SU definition, a "no SU factor" filter on the Materials list. No entity and no migration.

## Implementation Plan

### Phase 0: production check

0. Spec step 0 (count `SU` conversions and base units on cpg.baby) needs production access, which an autonomous run doesn't take (Guard: production). It is left to the owner as a pre-merge check, stated on the PR.

### Phase 1: registry and refusals

1. Registry: `statistical` dimension, `SU` (`ZSU`), `STATISTICAL_UNIT`, `isStatisticalUnit`.
2. Base-unit refusal: create schema, `MaterialService` (`assertRegisteredUnit` refuses SU for `baseUnit` only), EN/PL message, tests (UI action and API).
3. Entry refusal in `convertToBaseQuantity` (`UNIT_NOT_CONVERTIBLE`), with a service test per entry family proving the 400 and that nothing is written.

### Phase 2: entry pickers and the conversion dialog

4. Filter SU out of `listUnits()`, the completion `units`, the Stock page and the demo `unitsOf`.
5. The *Statistical* group label, the base-unit select without it (stored `SU` kept as current), and the SU hint in the Add conversion dialog.

### Phase 3: report helpers

6. `domain/units/report-units.ts`: `fromBase`, `reportUnits`, `resolveReportUnit`, `statisticalFactor`, with hand-computed tests.

### Phase 4: Statistical units page

7. `MaterialService.statisticalFactors()` (two queries, tested at 50 products).
8. The page, its screen, nav entry and icon, EN/PL labels, help topic.
9. Integration test `tests/integration/statistical-units.test.ts`, and the nav integration test.

### Phase 5: datasets and docs

10. SU factors for the ten finished products in `test-tenant-config.json`; reset and dataset tests.
11. `engineering-standards.md`, `BACKWARD_COMPATIBILITY.md`, lessons.
12. Move the spec to `implemented/` with implementation notes.

## Risks

- Test churn where tests enumerate `UNIT_DIMENSIONS`, `UNITS`, unit groups or dataset conversion counts.
- Changing a dataset product's base unit now needs its SU factor removed first (`BASE_UNIT_HAS_CONVERSIONS`), as the spec accepts.
- A free-text `SU` stored in production before #217 would be narrowed by the entry refusal; Phase 0 is the owner's check.

## Log

- 09:40 — Feature route: the spec is merged on `main` (#241), nothing is built yet, no PR references #239. 12 steps, so the plain engine runs it. Spec step 0 needs production access and goes to the owner.
- 10:40 — Phase 1–2: registry `SU`/`ZSU`, `STATISTICAL_UNIT`, `isStatisticalUnit`; base-unit refusal in the create schema and `assertRegisteredUnit` (`baseUnit` only); `convertToBaseQuantity` refuses SU before the conversion lookup. A sub-agent wrote the seven per-family service tests (BOM, forecast, PO, customer order, shipment, stock correction, stock import); all eight SU tests fail with the refusal removed (mutation check) and pass with it. Document services surface the refusal as `VALIDATION_FAILED` on the line's unit field, stock and import as `UNIT_NOT_CONVERTIBLE`: the tests assert each family's shape.
- 10:45 — Pickers: `listUnits` and the completion preview filter `unit != SU` in the query; the Stock page and `unitsOf` filter by `isStatisticalUnit`. Deviation: the SU hint is appended to the Base quantity hint through a new `CrudField.description` function (no conditional hint existed). `unitSelect` gains `physicalOnly`.
- 10:50 — Dataset: ten SU factors; a test pins them in both datasets. Full unit suite green (4,302).
- 11:00 — Report helpers and the Statistical units page. Deviation: count line is a label ("Finished products with an SU factor: 8 of 10.") to avoid two-number plural agreement. Coverage 100% (4,320 tests), build green.
- 11:20 — No Docker on this machine: ran `statistical-units`, `navigation`, `materials-api` and `materials` integration files against a local standalone server (lesson 2026-10-23): 4 files, 41 tests passed. Spec moved to `implemented/`, references in the demand-review spec and D08 updated.

## Progress

PR: #242

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: production check

- [ ] 0.1 Production check (owner, before merge)

### Phase 1: registry and refusals

- [x] 1.1 Registry entry and helpers — e9035162
- [x] 1.2 Base-unit refusal — e9035162
- [x] 1.3 Entry refusal in convertToBaseQuantity — e9035162

### Phase 2: entry pickers and the conversion dialog

- [x] 2.1 Filter SU out of entry pickers — e9035162
- [x] 2.2 Statistical group, base-unit select and SU hint — e9035162

### Phase 3: report helpers

- [x] 3.1 report-units.ts — 16a4edf1

### Phase 4: Statistical units page

- [x] 4.1 MaterialService.statisticalFactors — 4b0c36a7
- [x] 4.2 Page, nav, help and labels — 4b0c36a7
- [x] 4.3 Integration tests — a14085a8

### Phase 5: datasets and docs

- [x] 5.1 Test dataset factors — ab305c2a
- [x] 5.2 Standards, compatibility and lessons — 86fd0001
- [x] 5.3 Move the spec to implemented — 86fd0001
