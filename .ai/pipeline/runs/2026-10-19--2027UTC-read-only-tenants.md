# Read-only tenants (#25) — execution plan

Source doc: .ai/specs/2026-10-19--2018UTC-read-only-tenants.md
Spec PR: #55 (design-only; this branch doesn't carry the spec file)
Issue: #25
Engine: om-auto-create-pr (steps: 10, --loop: no)

## Goal

Implement the spec. An admin-set read-only flag per tenant. While it is set, the server refuses every business write to that tenant, from the screens, the API and the startup seed (409 `TENANT_READ_ONLY`). Reads, the audit, account work and the flag itself keep working. The toggle is in the Global audit.

## Scope

- `db`: `Tenant.readOnly` plus the migration.
- `core`:
  - `TenantService.currentState`/`setReadOnly`, and `TenantInfo.readOnly`;
  - `assertWritable`;
  - the gate in `tenantServerAction` and `IdempotencyService`;
  - the seed gate;
  - the validator.
- `app`:
  - `PATCH /api/tenants/{tenant}`;
  - the `/admin` Read-only card and its action;
  - the strip's label;
  - the materials controls hidden, plus a refresh after a refusal;
  - i18n and help.
- Repo tests: `api-writes` (the named exception), `tenant-entry-points` (tightened).
- Docs: `BACKWARD_COMPATIBILITY.md` §4 and the acceptance statuses.
- Integration tests: `read-only-api.test.ts` and `read-only.test.ts`.

## Non-goals

- Blocking MRP runs (TEN-019, slice 3).
- The Test reset's override (slice 2).
- A write-locked db scope (spec Q2, deferred).

## Implementation Plan

See the spec's Implementation Plan. Its Steps 1–10 map onto the Progress below.

## Risks

- **Schema (risk-high):** `kamal rollback` ignores `read_only`, so flags are not enforced while rolled back.
- **Concurrency:** the toggle against an in-flight write is covered by a two-ORM test.

## Deviations

- The first full integration run failed. Revalidating the whole `/admin` layout after the toggle made Next.js re-prerender the tenant pages' static shells at runtime (`NEXT_STATIC_GEN_BAILOUT`), and they hung. The toggle now revalidates `/admin` only (b5f6df7, lesson added).
- A read-only refusal no longer refreshes the materials page: the refresh unmounted the dialog together with its explanation. The spec on #55 was amended (Implementation notes).

## Verification

- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 177 files, 1149 tests, 100% coverage (at 7a9ea73).
- `npm run build`: pass.
- `npm run test:integration` (Docker, production image): 18 files, 116 tests pass (at 7a9ea73).
- A fresh-context code review approved, with six Low findings, all fixed in 7a9ea73.
- UI evidence from the production image is on the PR.
- `npm audit`: not re-run, because no dependency changed (`package.json`/`package-lock.json` untouched).
- After merging `main` (`om-auto-fix-pr`): the migration was regenerated as `…211303`, the gate now covers the new masters screens and seeds, and the re-review approved. At 232aae0: coverage 100% (1314 tests), integration 139/139.

## Progress

PR: #57

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The flag and the gate in core

- [x] 1.1 Schema: Tenant.readOnly and its migration — 326bec7
- [x] 1.2 assertWritable and TENANT_READ_ONLY — 528c0cb
- [x] 1.3 TenantService: currentState, setReadOnly, readOnly in TenantInfo, seed gate — 528c0cb, ca6e37c
- [x] 1.4 Validator: tenant read-only schema — 528c0cb
- [x] 1.5 The gate in tenantServerAction and IdempotencyService, tightened entry-point test — ca6e37c

### Phase 2: The API

- [x] 2.1 PATCH /api/tenants/{tenant}, readOnly in GET, BACKWARD_COMPATIBILITY — 761b85a
- [x] 2.2 API integration tests — fc71c7c

### Phase 3: The screens

- [x] 3.1 setTenantReadOnly action and the /admin Read-only card — 2f25abf, b5f6df7
- [x] 3.2 Tenant pages: strip label, hidden controls, refresh, i18n, help — 3f988eb, b5f6df7
- [x] 3.3 Screen integration test — 1ee2679, b5f6df7
