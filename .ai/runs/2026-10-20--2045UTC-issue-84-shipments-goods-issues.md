# Issue #84 (E08-S02): shipments and goods issues against one customer order

**Date:** 2026-10-20 20:45 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 84`
**Spec:** `.ai/specs/implemented/2026-10-20--2045UTC-shipments-goods-issues.md`
**Status:** done

## Goal
Shipments against one customer order, and goods issues that lower physical stock and fulfil the order's lines, never beyond the outstanding quantity or the stock on hand. The issue that fulfils the last outstanding quantity completes the order. Available in the UI and the API (issue #84).

## Log
- 20:45 Feature route (label `feature`). FR triage: no shipment/goods-issue code in `packages/`, no open PR references #84, and the ticket meets the ticket-level tier (problem, roles, outcome, scope, no blocking question). No spec exists, so the spec is written on this branch, as for #86/#87.

- Design: a shipment plans a dispatch against one Open order and moves no stock (Q1–Q3). A goods issue posts against one shipment through `postStockMovements` with negative quantities (Q4–Q9). A GI line is capped at the smaller of what the shipment still plans and what the order line has outstanding. The ledger's own check refuses an overdraw with `INSUFFICIENT_STOCK`.
- Order-edit additions (Q8, Q10): a line a shipment names can't be removed or change material. Lowering a delivered line to exactly its fulfilled quantity completes it, and completes the order and its shipments when nothing is left, so an order can't be left Open with nothing to issue.
- `ReceiptForm` became the shared `components/forms/line-quantities-form.tsx`, with an optional date and string or number line keys. All three dialogs use it.
- `components/shipments/line-choices.ts` reads `outstandingOf` from `@cpg/core`, so only server components import it (lesson 2026-10-19).
- Independent review (subagent): no blocker or major defect. Fixed: shipment and goods-issue lists page by 100 (`?page=`), with lines grouped once per page (lesson "Bound a new document collection"); the shipment lock is one bounded count; spec Q12 now lists `shipments.shipment.completed`; added a two-connection race on the outstanding and a no-write assertion for the lock. Recorded for E11-S01: completion ignores `abandoned`. Not changed: `postIssue` takes the order code from the page only to choose which page to refresh.
- One unit-test flake was found and fixed: two `shipments.shipment.completed` entries written in the same millisecond sort by their random ID (known lesson), so the test compares them in ID order.

## Changes
- db: `Shipment`, `ShipmentLine`, `GoodsIssue`, `GoodsIssueLine` (issues immutable through triggers), migration `Migration20261020214038_shipments_goods_issues` (+ snapshot, index), migration and rollback tests.
- core: `domain/goods-issues/issue-quantity.ts`; `validators/shipments/`, `validators/goods-issues/`; the leaves `customer-orders/order-records.ts`, `shipments/shipment-records.ts` and `shipments/shipment-usage.ts`; `ShipmentService`; `GoodsIssueService`; the order-edit completion and the shipment lock in `CustomerOrderService`; DI registration and exports.
- app: `/api/tenants/{tenant}/shipments` and `/goods-issues` (GET/POST, GET by ID); the `createShipment` and `postIssue` actions; the order page's Outstanding column, Shipments section and Create shipment dialog; the shipment page `/admin/[tenant]/shipments/[id]`; the shared line-quantities form; EN/PL strings; help topic; audit labels; the stock ledger's "Goods issue" label.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, engineering standards §5.
- Integration: `shipments-api.test.ts` (8), `shipments.test.ts` (3), smoke migration count.

## Verification
- `npm run lint`: 0 errors (1 warning in `bom.service.ts`, which predates this change).
- `npm run typecheck`: clean.
- `npm run test:coverage`: 379 files, 2461 tests, 100% on all four metrics.
- `npm run build`: succeeded.
- `npm run test:integration -- shipments-api, shipments, smoke, goods-receipts` (Docker, production image): 4 files, 16 tests passed on the first run.

## Follow-ups
- Goods-issue reversal (E11-S02), Close Early and cancellation (E11-S01), forecast consumption and overdue demand (SAL-014…017).
- Page the goods-receipt list as shipments and issues now are.
- Shipment edits and cancellation: a plan can't be changed yet; create another shipment instead. Filed as E08-S05 (#147), and implemented by PR #182.
