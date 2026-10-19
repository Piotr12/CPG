# Execution plan: the admin maintains locations, customers and suppliers, and every user can view them

**Date:** 2026-10-19 20:26 UTC
**Agent:** Claude Code / claude-opus-5-5. Chain: cezar → `om-auto-fix-issue 23` → feature route → `om-auto-write-spec 23` (spec PR #54) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/implemented/2026-10-19--2014UTC-locations-customers-suppliers.md (spec PR #54, merged; Q2 and Q5 accepted as defaults on the owner's instruction)
Issue: #23

## Goal

In each tenant the admin creates, renames, deactivates and reactivates locations, customers and suppliers. Each has an eight-digit ID assigned in sequence per tenant and per kind, a name and an active flag. Every signed-in user views them, in the UI and through the API. Every change is audited, and Test is seeded with demo records.

## Scope

- `packages/db`:
  - `entities/named-records/named-record-properties.ts`;
  - `entities/{locations,customers,suppliers}/*.entity.ts`;
  - one migration, with its snapshot and index.
- `packages/core`:
  - `domain/business-ids/sequential-id.ts`, which `domain/materials/material-code.ts` delegates to;
  - `domain/{locations,customers,suppliers}/demo-*.ts`;
  - `validators/business-ids/business-id.schema.ts` and `validators/named-records/*`;
  - `services/named-records/named-records.ts` (the helper) and `services/{locations,customers,suppliers}/*.service.ts`;
  - `demo-data.ts` (per-kind seed), and the container, cradle and index.
- `packages/app`:
  - `app/api/tenants/[tenant]/{locations,customers,suppliers}/**/route.ts`;
  - `app/admin/[tenant]/{locations,customers,suppliers}/{page.tsx,actions.ts}`;
  - `components/named-records/*`, plus shared form helpers moved out of `components/materials/labels.ts`;
  - the tenant-home links, `instrumentation.ts`, i18n (en/pl, audit action labels included) and three help topics.
- Tests:
  - unit tests next to every file;
  - `tests/integration/named-records-api.test.ts` and `tests/integration/named-records.test.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md` §4.

**Non-goals:**
- deactivation guards (slice 2);
- the "inactive can't be picked" check (spec Q5: it ships with the first story that picks these records);
- read-only tenants (#25);
- the import (#27);
- addresses or any other field;
- auditing the seed.

## Risks

- **The spec was not on `main` while this was built.** It came from spec PR #54 and was kept as an untracked file in the worktree. Once #54 merged, `main` was merged into this branch and the spec moved to `implemented/`.
- **⚠ Q2 (the ID format) and ⚠ Q5 await the owner.** This PR stays a draft until they are confirmed. If Q2 changes to admin-typed codes, the services, schemas, routes and seed change. The generic helper keeps that change in one place.
- **MikroORM generics over three entities** may refuse a union handle without casts. Step 1.2 includes a typecheck spike, with the spec's fallback: a generic descriptor.
- **Integration test files share one database and one admin** (lessons). Assert only on records the file creates.

## Deviations from the spec

- **One `NamedRecordsScreen` server component** renders the heading, intro, Create and list for all three pages. Each page still resolves its tenant and reads its own service (the tenant entry-point rule), then hands the records and its own server actions to it. The client components receive the actions as props and never import a kind.
- **`refreshAfterWrite` and `formValues` (`app/src/routing/refresh-after-write.ts`)** replace the materials actions' private `refreshed`/`fields` helpers. The six new actions would otherwise have copied them. The materials action tests pass unchanged.
- **Row actions are a ⋯ menu** (Edit, Deactivate/Reactivate), like the users list and the conversions table, rather than two inline buttons as in the mockup. That keeps them in view at 390 px; an integration test checks it.
- **The ID schema is `validators/business-ids/business-id.schema.ts`**, and a separate `named-record-fields.schema.ts` holds the name rule and the messages the screens translate.
- **`seedDemoData` returns a per-kind result** (`{ seeded } | { error }`). `instrumentation.ts` logs each, and an outer `catch` still covers a failure to open the connection.
- **The tenant-audit help topic** now names locations, customers and suppliers.
- **The action tests don't re-test a stale generation.** They mock `tenantServerAction`, and its own tests (`core/src/http/tenant-server-action.test.ts`) cover the refusal. The materials actions are tested the same way.
- **Code review (fresh context, verdict approve, five Low findings):**
  - `NamedRecords` now trims names itself, so a caller that skips the schema (the import, #27) can't store spaces or record a no-op rename;
  - the app's kind union is renamed `NamedRecordScreenKind`, to avoid a clash with core's `NamedRecordKind`;
  - `BACKWARD_COMPATIBILITY.md` lists the `CONFLICT`/`*_IDS_EXHAUSTED` codes and the three help topic IDs;
  - the services' doc comments are fixed.

  Not done: folding the near-identical per-kind page, action and route tests into shared `describe.each` suites (about 800 lines). The entry points must stay per kind, and the tests are correct as they are. Follow-up.

## Implementation Plan

### Phase 1: the masters in core

1. Shared sequential IDs (`domain/business-ids/sequential-id.ts`), with materials delegating to it.
2. Schema: the shared properties, the three entities and the migration (up and down tested).
3. Validators: the business-ID schema moved out of materials, plus create and update.
4. The `NamedRecords` helper and the three services, with one parametrized SQLite suite.
5. The startup seed: per kind, with per-kind failures, and its logging in `instrumentation.ts`.

### Phase 2: the API

6. The 12 routes, their unit tests, and `BACKWARD_COMPATIBILITY.md` §4.
7. API integration tests.

### Phase 3: the screens

8. Shared form helpers, and the generic `components/named-records/`.
9. Actions and pages per kind, the tenant-home links, i18n and help.
10. Screen integration tests, then the full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: the masters in core

- [x] 1.1 Shared sequential IDs — d95f924
- [x] 1.2 Schema: entities and migration — 4e5a102
- [x] 1.3 Validators — 704a346
- [x] 1.4 NamedRecords helper and the three services — b01425e
- [x] 1.5 Startup seed per kind — a96489d

### Phase 2: the API

- [x] 2.1 Routes and BACKWARD_COMPATIBILITY — 2a83073
- [x] 2.2 API integration tests — e526e04

### Phase 3: the screens

- [x] 3.1 Shared form helpers and generic components — e55ebbc
- [x] 3.2 Actions, pages, links, i18n and help — 17a3347
- [x] 3.3 Screen integration tests and the full gate — 6244513
