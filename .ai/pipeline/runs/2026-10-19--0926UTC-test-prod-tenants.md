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
- the Test reset (slice 2).

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

## Implementation notes

- `useTenant` was renamed `selectTenant`: the React hooks lint rule treats any `use*` call as a hook.
- `tenantServerAction` resolves the tenant through `serverAction` itself, so both share one error mapping.
- **Deviation from the spec's edge-case table: an unknown tenant URL returns HTTP 200, not 404.** `partialPrefetching` is on, and since Next 16.3 the route's App Shell is served for params missing from `generateStaticParams`. So the layout's `notFound()` fires mid-stream: Next.js shows its 404 UI with `<meta name="robots" content="noindex">` but can't change the status (`next/dist/docs/01-app/02-guides/streaming.md`, "The HTTP contract").
  - `ensureStatic = 'navigation'` would force a blocking render, but it forbids `connection()` and DB reads.
  - A proxy would have to know every global admin segment.
  - The user-visible behaviour (a 404 page with no strip and no data) holds and is integration-tested.
- `tests/admin-pages-require-admin.test.ts` is unchanged and covers the new pages. `packages/ui/src/components/button.test.tsx` now links to an external URL: the Next lint rule `no-html-link-for-pages` started flagging its `<a href="/admin">` once `/admin` moved into a route group.
- The sign-in header became `components/auth/signed-in-bar.tsx`, because two pages use it now.
- **Merged `origin/main` after #32 (#18) landed** (f702b00):
  - the migrations run in the order `user_preferences`, then `tenants`;
  - `UserPreference` joined `GLOBAL_ENTITIES`;
  - `SignedInBar` carries #18's preferences controls;
  - the chooser, tenant home and strip description are translated (en/pl) and render at request time;
  - a `test-and-prod` help topic covers `/admin/[tenant]`.

  #18 keeps translatable text out of static shells, so the strip's shell holds only the TEST/PROD/GLOBAL label, the colour and the tenant names. Its accessible name is that label plus the streamed, translated description (spec: "Active tenant"), and the switcher nav is named "Test / Prod".
- **Review autofix** (the `om-auto-review-pr` independent pass found 2 majors, 5 minors and 2 nits; all fixed):
  - `nativeUpdate` on tenant-owned entities sets only plain fields;
  - `QueryBuilder.from()` and `countBy` are refused for tenant-owned data;
  - `TenantGuard` also checks to-one references from global records;
  - ESLint additionally bans `addFilter`, `getDriver`, `createQueryBuilder`/`qb` and a quoted `"filters"` key;
  - the lessons are recorded;
  - the `refuseTenantOwned` typo is fixed;
  - the tenant home's heading names the tenant.

## Verification

Full gate on the final review fixes (e921aa0 plus the docs commit), all exit 0:
- `npm run lint`;
- `npm run typecheck`;
- `npm run test:coverage`: 401 tests, 100% coverage;
- `npm run build`;
- `npm run test:integration`: 8 files, 40 tests, including `tenants.test.ts` (11) and #18's suites after the merge.

The independent re-review approved: both majors and every minor and nit from round 1 are fixed. Its three remaining minors are fixed too:
- refusals extended to global entities that reference tenant data;
- the QueryBuilder `clone()` and case-insensitive table names;
- the standards doc updated.

No dependency changed, so no `npm audit` triage was needed.

## Follow-ups

- Once design PR #35 merges, `git mv` the spec to `.ai/specs/implemented/` (it isn't on `main` yet, so this PR can't move it).
- #22 builds the demo seeder (spec Q4) and the first end-to-end record check, TEN-012 (Q6).
- #16 opens tenant pages to normal users.
- #17 adds bearer tokens in `requireApiUser`.

## Progress

PR: #36

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tenant data layer

- [x] 1.1 Tenant entity and migration — bdea989
- [x] 1.2 tenantOwned, filter, TenantEntityManager, TenantGuard — 039cf30
- [x] 1.3 Lint and repo-wide guards — 777d62c
- [x] 1.4 TenantService, tenantScope, tenantServerAction, errors — f8b30e0

### Phase 2: Tenant UI

- [x] 2.1 Strip and switcher — 42376e5
- [x] 2.2 Layouts and pages — cd7bcd4
- [x] 2.3 Integration test (UI) — 207b639

### Phase 3: Tenant API

- [x] 3.1 apiHandler and requireApiUser — 2f9b96b
- [x] 3.2 Metadata routes and full gate — 3c75235
