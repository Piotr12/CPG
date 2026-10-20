# Execution plan: planning parameters per location and effective-dated safety-stock targets

**Date:** 2026-10-20 05:43 UTC
**Agent:** Claude Code / claude-opus-5-5. Chain: cezar → `om-auto-fix-issue 24` → feature route → `om-auto-write-spec 24` (spec PR #64) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-20--0532UTC-planning-parameters-safety-stock.md (spec PR #64, open; kept as an untracked file in this worktree until #64 merges)
Issue: #24

## Goal

In each tenant the admin keeps, per material and location, a planning parameter set (Make/Buy, whole-day lead time, minimum lot, lot multiple; raw is Buy-only) and effective-dated safety-stock targets (zero by default, valid until the next one, no two on one date), on two Master data screens and through the API. Every signed-in user reads them, every change is audited, and Test is seeded with demo rows.

## Scope

- `packages/db`: `entities/planning-parameters/planning-parameter-set.entity.ts`, `entities/safety-stock/safety-stock-target.entity.ts`, one migration with its snapshot and index.
- `packages/core`:
  - `domain/planning-parameters/{procurement,demo-planning-parameters}.ts`, `domain/safety-stock/{target-on,demo-safety-stock-targets}.ts`;
  - `validators/quantities/`, `validators/dates/`, `validators/planning-parameters/`, `validators/safety-stock/`;
  - leaf lookups: `services/materials/find-material.ts`, `services/named-records/find-named-record.ts`, `services/locations/find-location.ts`, and the usage checks `services/planning-parameters/planning-parameter-usage.ts`, `services/safety-stock/safety-stock-target-usage.ts`;
  - `services/planning-parameters/planning-parameter.service.ts`, `services/safety-stock/safety-stock-target.service.ts`;
  - the `MaterialService.update` guards, `demo-data.ts`, container, cradle and index.
- `packages/ui`: the `date` field in `CrudForm`.
- `packages/app`:
  - routes under `app/api/tenants/[tenant]/{planning-parameters,safety-stock-targets}/`;
  - pages and actions under `app/admin/[tenant]/{planning-parameters,safety-stock}/`;
  - `components/{planning-parameters,safety-stock}/`, `nav-tree.ts`/`nav-items.ts`, i18n, help topics, audit labels.
- Tests: unit tests next to every file; `tests/integration/planning-parameters-api.test.ts` and `tests/integration/planning-parameters.test.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md` §4.

**Non-goals:**
- MRP's use of these values;
- the import (#27);
- a summary on the material page;
- alternate-unit entry;
- filtering or paging the lists.

## Risks

- **The spec is not on `main` while this is built.** It comes from spec PR #64. Once #64 merges, merge `main` into this branch and move the spec to `implemented/`.
- **Migration ordering** against other open stories (#26, #27): whichever merges later regenerates its migration.
- **Integration test files share one database and one admin** (lessons): assert only on rows this file creates, and create the file's own materials and locations in Prod.

## Deviations from the spec

- **`safetyTargetOn` returns `"0.000000"`** with no target in force, not `"0"`, so every base-unit quantity has the one six-decimal form (spec Q4).
- **`PATCH`/`DELETE` with a well-formed but unknown material or location** answer `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` (404), not the row's not-found. A malformed path segment is still the row's not-found (route-level parse).
- **The "can't be picked once inactive" checks** are `findActiveMaterial` and `findActiveLocation`, next to the lookups they extend (one check per referenced kind, as locations Q5 asked).
- **The seed guard** (`isUntouchedKind`) and the reference lookup for demo rows are shared in `services/demo/demo-references.ts`, rather than copied into both services.
- **The demo-data kinds** are named `planning parameter sets` and `safety-stock targets`, which the startup log prints as they are.

## Implementation Plan

### Phase 1: Core

1. Domain rules: procurement and the safety-target rule.
2. Schema: both entities and the migration.
3. Validators: quantities, dates, planning parameters, safety targets.
4. Leaf lookups: `findMaterial`, `findNamedRecord`, `findLocation`.
5. `PlanningParameterService`.
6. `SafetyStockTargetService`.
7. Material guards: `BASE_UNIT_IN_USE` and `MATERIAL_MADE_AT_LOCATIONS`.
8. Demo seed for both kinds.

### Phase 2: API

1. Route handlers and `BACKWARD_COMPATIBILITY.md`.
2. API integration tests.

### Phase 3: Screens

1. `CrudForm` date field.
2. Server actions.
3. Pages, components, sidebar, i18n, help, audit labels.
4. Screen integration tests, then the full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Core

- [x] 1.1 Domain rules: procurement and the safety-target rule — a3a693c
- [x] 1.2 Schema: both entities and the migration — 5059a86
- [x] 1.3 Validators: quantities, dates, planning parameters, safety targets — d9c45d2
- [x] 1.4 Leaf lookups: findMaterial, findNamedRecord, findLocation — a7c3a72
- [x] 1.5 PlanningParameterService — 4791f89
- [x] 1.6 SafetyStockTargetService — 4791f89
- [x] 1.7 Material guards — b7b4547
- [x] 1.8 Demo seed for both kinds — a2e1412

### Phase 2: API

- [ ] 2.1 Route handlers and BACKWARD_COMPATIBILITY.md
- [ ] 2.2 API integration tests

### Phase 3: Screens

- [ ] 3.1 CrudForm date field
- [ ] 3.2 Server actions
- [ ] 3.3 Pages, components, sidebar, i18n, help, audit labels
- [ ] 3.4 Screen integration tests and the full gate
