# Issue #85 (E08-S03): forecasts per material, location and day

**Date:** 2026-10-20 17:00 UTC
**Agent:** Claude Code (claude-sonnet-5-5) via cezar, `om-auto-fix-issue 85` (feature route)
**Spec:** `.ai/specs/implemented/2026-10-20--1700UTC-forecasts.md` (written in this run: the backlog filed none)
**Status:** done

## Goal

The acceptance criteria of #85: a forecast (material, location, day, BUoM quantity, no customer) kept in the UI and the API, one per material, location and day, audited with a tombstone on removal, refused for inactive or other-tenant references and for read-only tenants, listed per day and filterable by material and location, seeded in Test.

## Log

- 16:40 — Triage: no forecast code exists (searched the packages), no open PR references #85, no spec. The ticket meets the ticket-level Definition of Ready (problem, expected outcome, out of scope, no blocking question; the one-per-day rule is a stated autonomous default). Feature route. The delegated `om-auto-write-spec` / `om-auto-implement-spec` chain was not used: this cezar task already owns a worktree and branch, so the spec and the implementation land on the one task branch.
- 16:45 — Modelled the concept on the safety-stock targets (entity, validator, service, demo seed, actions, page, API routes, dialog/table/actions components), with `date` instead of `effectiveFrom` and without the in-force status.
- 16:55 — Decisions (all in the spec's table): "a quantity and unit" means the quantity is entered in an optional `unit` and converted with `convertToBaseQuantity`, as BOM lines are; the conversion-error-to-field mapping that `BomService` kept privately moved to `services/materials/conversion-field-error.ts`. The base unit of a material with forecasts is locked. A new **Sales** sidebar group holds **Forecasts** (mockup 01). The filter is a plain GET form on the screen and query parameters on the API.
- 17:10 — Found with a debugging test: the Add forecast form is taller than agent-browser's default viewport, so the click on Add landed on the overlay and closed the dialog without a request. Fixed in the test (`setViewport`), recorded in `.ai/lessons.md`.

## Changes

- `packages/db`: `Forecast` entity, migration `Migration20261020164210_forecasts` (+ snapshot, index), orm and index tests.
- `packages/core`: `ForecastService` (+ `forecast-usage`, `demo-forecasts`), `forecast.schema` validators, `conversion-field-error` (shared with `BomService`), the container, the cradle and the index exports, the demo seed kind `forecasts`, the base-unit lock in `MaterialService`.
- `packages/app`: `/admin/[tenant]/forecasts` (page, actions), `components/forecasts/*` (screen, filter, table, add dialog, row actions, labels), `GET`/`POST /api/tenants/{tenant}/forecasts` and `PATCH`/`DELETE …/{material}/{location}/{date}`, the Sales group in the sidebar, the tenant home link, the English and Polish strings, the help topic.
- `tests/integration`: `forecasts.test.ts`, `forecasts-api.test.ts`, a read-only case in `read-only-api.test.ts`, the sidebar lists in `navigation.test.ts`, the migration count in `smoke.test.ts`.
- Docs: the spec, `BACKWARD_COMPATIBILITY.md` (page, query parameters, API), DEM-001 in the acceptance catalogue, `.ai/lessons.md`.

## Verification

- `npm run lint` and `npm run typecheck`: clean. `npm run test:coverage`: 299 files, 1964 tests; 100% statements (4683/4683), branches (1945/1945), functions (1613/1613) and lines (4169/4169). `npm run build`: passed.
- Integration (Docker is not available to this account, so against the production build's standalone server with a fresh data directory, per `.ai/lessons.md`): `forecasts.test.ts` (8), `forecasts-api.test.ts` (10), `read-only-api.test.ts`, `navigation.test.ts` (the sidebar lists with Forecasts) and `smoke.test.ts` (14 migrations) pass.
- Not clean in that setup, and not caused by this change: `tenants.test.ts`, `preferences.test.ts` ("switches between Test and Prod") and the tenant-switch case of `navigation.test.ts` fail waiting on `/admin/test`, which this local standalone server answers with a 404. The merge base built and served the same way fails the same way (`/admin/test` and `/admin/prod` both 404, `tenants.test.ts` 4 of 6 run tests failing), so it is the local setup (the lessons already note the standalone server's 404s), not this branch. CI's Docker run is the authority.
- `npm audit`: not run, no dependency changed.

## Follow-ups

- DEM-002…013 (netting, residual forecast, overdue demand) wait for the MRP run (slice 3).
- Importing forecasts from a workbook is not part of this story.
