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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: production check

- [ ] 0.1 Production check (owner, before merge)

### Phase 1: registry and refusals

- [ ] 1.1 Registry entry and helpers
- [ ] 1.2 Base-unit refusal
- [ ] 1.3 Entry refusal in convertToBaseQuantity

### Phase 2: entry pickers and the conversion dialog

- [ ] 2.1 Filter SU out of entry pickers
- [ ] 2.2 Statistical group, base-unit select and SU hint

### Phase 3: report helpers

- [ ] 3.1 report-units.ts

### Phase 4: Statistical units page

- [ ] 4.1 MaterialService.statisticalFactors
- [ ] 4.2 Page, nav, help and labels
- [ ] 4.3 Integration tests

### Phase 5: datasets and docs

- [ ] 5.1 Test dataset factors
- [ ] 5.2 Standards, compatibility and lessons
- [ ] 5.3 Move the spec to implemented
