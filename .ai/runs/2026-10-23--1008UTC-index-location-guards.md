# Index the location-deactivation guards (#162)

**Date:** 2026-10-23 10:08 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 162`, dispatched by cezar)
**Spec:** none
**Status:** in progress

## Goal

Add a composite `(tenant, location, status, code)` index to `purchase_order`, `purchase_requisition` and `customer_order` so the location-deactivation guards (`assertNoPurchasingAtLocation`, `assertNoCustomerOrdersAtLocation`) search instead of walking the tenant's whole history. One additive migration with an up/down test and the smoke count.

## Log

- 10:08 — Triage: real and unfixed; only #161 (the guards themselves) references the area. Bug route, branch `fix/issue-162-index-location-guards`.
- 10:09 — Root cause: the three entities carry only `uniques [tenant, code]` (customer orders also a single-column `location` index); `ProductionOrder` already has the pattern. Claimed the issue.
- 10:10 — `db:migration:create` first failed (`@cpg/db` has no `GlobalAuditEvent`): the worktree had no `node_modules`, so `@cpg/*` resolved to the main checkout (known lesson). `npm ci`, then the generator emitted index-only SQL (no table rebuild).
- 10:12 — Regression test first tried `createQueryBuilder`; `TenantEntityManager` refuses it on tenant-owned entities. Captured the real `findOne` SQL through MikroORM's `onQuery` hook instead and EXPLAINed that. Without the migration the plan is `SEARCH p0 USING INDEX purchase_order_tenant_code_code_unique (tenant_code=?)` — the issue's report, reproduced.
- 10:15 — Coverage run caught two more count sites (`system-status.service.test.ts`); fixed. Docker isn't running here, so smoke ran on the standalone build (lesson 2026-10-19 fallback).

## Changes

- `packages/db/src/entities/{purchase-orders/purchase-order,purchase-requisitions/purchase-requisition,customer-orders/customer-order}.entity.ts` — `indexes: [{ properties: ["tenant", "location", "status", "code"] }]`.
- `packages/db/src/migrations/Migration20261023101022_location_guard_indexes.ts` (+ `.snapshot.json`, `index.ts`) — three `create index` / `drop index`.
- `packages/db/src/location-guard-index-migration.test.ts` — populated upgrade and rollback; each guard's real query uses its index with no temporary sort.
- Migration counts / rollback steps: `packages/db/src/orm.test.ts`, `packages/db/src/entities/transfers/transfer-reversal.entity.test.ts`, `packages/core/src/database.test.ts`, `packages/core/src/services/system/system-status.service.test.ts`, `tests/integration/smoke.test.ts`.
- `.ai/lessons.md` — two Testing lessons (EXPLAIN via `onQuery`; every count site a new migration moves).

## Verification

- `npm run lint` — 0 errors (1 pre-existing warning in `bom.service.ts`).
- `npm run typecheck` — clean.
- `npm run test:coverage` — 486 files, 3318 tests passed; 100 % statements/branches/functions/lines.
- `npm run build` — succeeded.
- The new test against the schema without the migration — all four cases fail (plan walks `tenant_code_code_unique`); with it, all pass.
- `tests/integration/smoke.test.ts` against the standalone build on a fresh `DATA_DIR` (startup applied the new migration and seeded Test) — 3/3 passed. Docker-based run not possible locally (no container runtime); CI runs it.

## Follow-ups

- None from this change. The single-column `customer_order.location_id` index stays (FK lookups without a tenant).
