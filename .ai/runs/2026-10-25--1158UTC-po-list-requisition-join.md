# Purchase orders list: stop materializing every requisition of the tenant (#236)

**Date:** 2026-10-25 11:58 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 236`, bug route)
**Spec:** none (bug)
**Status:** done

## Goal

A page of purchase orders costs about the same whatever the tenant's number of requisitions (#236).

## Log

- 11:58 Triage (`om-verify-in-repo`): open, unclaimed, no PR or commit references #236; `viewsOf` in `purchase-order.service.ts` still populates `["material", "requisition"]`. Proceed.
- 12:05 Reproduced in a scratch test (100,000 requisitions, 300 orders, half the lines naming a requisition): reading a page's lines took a median 100.7 ms, plan `MATERIALIZE (join-1) | SEARCH r2 USING INDEX purchase_requisition_tenant_code_index …`. Without the requisition populate: 3.0 ms.
- Root cause (`om-root-cause`): MikroORM's `autoJoinRefsForFilters` ref-joins every filtered to-one relation of a populated entity. For the nullable `requisition` it emits `left join (purchase_requisition inner join material … inner join location …) on …`. SQLite can't flatten a parenthesised join on the right of a LEFT JOIN, so it materializes it over the whole tenant. A plain `left join purchase_requisition` (what an unpopulated reference gets) is a primary-key lookup.
- Options measured at 100,000 requisitions:
  - separate `em.find(PurchaseRequisition, { id: { $in } })`: 11.3 ms, but SQLite (no ANALYZE statistics, as in production) plans a 50-ID `IN` list through `purchase_requisition_tenant_code_index`, so it still walks every requisition of the tenant (+8 ms, growing with the tenant);
  - `fields: ["code"]` on that find: same plan;
  - `populateHints: { requisition: { joinType: "left join" } }`: no effect on the nested joins (102.9 ms);
  - **chosen**: populate `requisition.material` and `requisition.location` explicitly with `joinType: "left join"`. The nested inner joins become flat left joins, each a primary-key lookup: 5.2 ms, one query, no `MATERIALIZE`.
- Same-pattern sweep: `PurchaseOrderLine.requisition` is the only nullable to-one relation in `packages/db/src/entities`. Goods receipt lines, the receipt reversal, purchasing usage, shipments, shipment lines, goods issues and customer orders all produce flat joins (no `join (` in the SQL MikroORM sends).

- 12:20 Claimed #236 (assignee, `in-progress`, claim comment). Fix and regression test written; the test fails on the old code (`MATERIALIZE (join-1)` in the plan, no primary-key lookup on `purchase_requisition`).
- 12:40 Full gate green. Filed #247 for the `IN`-list plan through `tenant_code` found while measuring.

## Changes

- `packages/core/src/services/purchase-orders/purchase-order.service.ts`: `viewsOf` populates `requisition.material` and `requisition.location` with `joinType: "left join"`.
- `packages/core/src/services/purchase-orders/purchase-order.service.test.ts`: regression test that EXPLAINs the line query the list really sends and asserts a primary-key lookup on `purchase_requisition`, with no `MATERIALIZE` or `SCAN`, plus the requisition IDs in the view.
- `.ai/lessons.md`: extended the "EXPLAIN the query MikroORM really sends" lesson.

## Verification

- `npm run lint` → exit 0; `npm run typecheck` → exit 0.
- `npm run test:coverage` → exit 0, 569 files / 4,324 tests, 100% statements, branches, functions and lines.
- `npm run build` → exit 0.
- Regression test without the fix → fails (plan holds `MATERIALIZE (join-1)`).
- Integration tests: none added or touched (the views are unchanged); CI runs the full suite.

## Follow-ups

- #247: a page's `$in` line read walks the tenant's `tenant_code` index without ANALYZE statistics (all paged lists, ~8 ms per 100,000 rows).
