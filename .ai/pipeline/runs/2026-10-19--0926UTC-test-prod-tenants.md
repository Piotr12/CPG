# Execution plan: Test and Prod tenants — selection, indicator and strict isolation

**Date:** 2026-10-19 09:26 UTC
**Agent:** Claude Code / claude-opus-5-5. `om-auto-fix-issue 19` → feature route → `om-auto-write-spec` (spec PR #35) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--0913UTC-test-prod-tenants.md (design on spec PR #35)
Issue: #19

## Goal

Implement E02-S01 as the spec describes:

- two fixed tenants, Test and Prod;
- `/admin/{tenant}` pages with a strip and a switcher, and a Global strip on every other admin page;
- tenant-metadata API routes under `/api/tenants`;
- a tenant data layer that keeps tenant-owned data isolated and fails closed.

## Scope

- `packages/db`:
  - the `Tenant` entity and the `tenants` migration;
  - `tenantOwned()` with the `tenant` filter;
  - `TenantEntityManager`, `TenantGuard` and `TenantViolationError`;
  - `GLOBAL_ENTITIES`.
- `packages/core`:
  - `TenantService`, `tenantScope`, `tenantCodeSchema`;
  - `tenantServerAction` and `apiHandler`;
  - `status` on `AppError`, and `NotFoundError`.
- `packages/app`:
  - the `admin/(global)` and `admin/[tenant]` layouts and pages;
  - `components/tenants/`;
  - `auth/require-api-user.ts`;
  - `api/tenants` routes.
- `eslint.config.mjs`.
- `tests/tenant-ownership.test.ts` and `tests/tenant-entry-points.test.ts`, plus `tests/integration/tenants.test.ts`.
- `.ai/docs/engineering-standards.md` and `BACKWARD_COMPATIBILITY.md`.

**Non-goals** (from the spec):

- demo records and the seeder (#22, Q4);
- read-only flags (#25);
- audit (#20);
- bearer tokens (#17);
- normal-user access (#16);
- the Test reset (slice 2);
- Polish strings (#18).

## Implementation Plan

### Phase 1: Tenant data layer

1. **`Tenant` entity and migration.** The entity, `TENANT_CODES`, and the `tenants` migration seeding both rows, with tests.
2. **`tenantOwned()`, filter, `TenantEntityManager`, `TenantGuard`.** All enforcement in `db`, with fixture-entity tests.
3. **Lint and repo-wide guards.** The ESLint rules and `tests/tenant-ownership.test.ts`, the rule-firing test, and the standards doc updates.
4. **`TenantService`, `tenantScope`, `tenantServerAction`, errors.** The `core` layer, with tests against real SQLite.

### Phase 2: Tenant UI

5. **Strip and switcher.** The components and `switchTenantPath`, with tests.
6. **Layouts and pages.** The `(global)` group with the chooser, `[tenant]` with its layout and home, and `tests/tenant-entry-points.test.ts`.
7. **Integration test.** `tests/integration/tenants.test.ts` (UI).

### Phase 3: Tenant API

8. **`apiHandler` and `requireApiUser`.** With tests and the standards adoption status.
9. **Metadata routes.** `/api/tenants` and `/api/tenants/[tenant]`, entry-point checks, unit and integration tests, then the full gate.

## Risks

- MikroORM 7 internals: the custom `EntityManager` and the flush subscriber must hold on forks and inside transactions. The fixture tests pin this.
- Moving `/admin` into `(global)` must keep the URL. The existing integration tests cover it.
- PR #32 (#18) touches the same admin area, so whichever merges second rebases.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tenant data layer

- [ ] 1.1 Tenant entity and migration
- [ ] 1.2 tenantOwned, filter, TenantEntityManager, TenantGuard
- [ ] 1.3 Lint and repo-wide guards
- [ ] 1.4 TenantService, tenantScope, tenantServerAction, errors

### Phase 2: Tenant UI

- [ ] 2.1 Strip and switcher
- [ ] 2.2 Layouts and pages
- [ ] 2.3 Integration test (UI)

### Phase 3: Tenant API

- [ ] 3.1 apiHandler and requireApiUser
- [ ] 3.2 Metadata routes and full gate
