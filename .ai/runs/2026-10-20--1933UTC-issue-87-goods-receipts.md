# Issue #87 (E09-S02): goods receipts against one purchase order

**Date:** 2026-10-20 19:33 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 87`
**Spec:** `.ai/specs/implemented/2026-10-20--1933UTC-goods-receipts.md`
**Status:** done

## Goal
Goods receipts against one purchase order (partial, repeated, excess) that raise physical stock and the PO's received quantities in one atomic posting, in the UI and the API (issue #87).

## Log
- 19:33 Feature route (label `feature`). FR triage: no receipt code in `packages/`, no open PR references #87, the ticket meets the ticket-level tier. No spec existed, so the spec was written on this branch (the cezar task owns one branch, as for #86).
- Design: `GoodsReceipt`/`GoodsReceiptLine` (immutable through triggers), `PurchaseOrderLine.received`, PO status `completed`. The ledger's private `write` became the exported leaf `postStockMovements(em, …)` (`services/stock/stock-posting.ts`), so the receipt posts in its own transaction without importing `StockService`. `findOrder` moved to the leaf `order-records.ts`, shared by both services.
- PO edits after a receipt: the supplier, location and line contents were already immutable. The `PATCH` line schema silently dropped `material`/`unit`/`quantity`, which didn't meet "refused", so they are now 400 (`z.never`). A Completed PO refuses date edits (`PURCHASE_ORDER_NOT_OPEN`).
- MAT-031 already held (`hasProcurementDocuments`, from #86); a regression test was added.
- No demo receipts: posting stock before the Test openings' "untouched stock" check would skip them.
- Independent review (subagent): no blockers. Fixed: an overflowing received total is now a field error collected with the others; form row errors map only to rows that have a control. Not fixed (pre-existing, out of scope): a location can be deactivated under an Open PO, which then can't receive. Recorded in the spec's implementation notes as a follow-up.
- The first integration run had 3 failures, all test bugs: BUY-013 repeated line 1, so the duplicate-line schema check fired first; MAT-031 used a material with a conversion, so `BASE_UNIT_HAS_CONVERSIONS` won; the smoke test's migration count was stale. Fixed and re-ran the full suite.

## Changes
- db: goods-receipt entities, `received`, `completed`, migration `Migration20261020193728_goods_receipts` (+ snapshot, index), migration tests.
- core: `stock-posting.ts`, `order-records.ts`, `domain/goods-receipts/receipt-quantity.ts`, `validators/goods-receipts/`, `GoodsReceiptService`, PO views (`received`/`outstanding`/`status`), PO PATCH line refusals, DI registration.
- app: `/api/tenants/{tenant}/goods-receipts` (GET/POST) and `/{id}` (GET), the `postReceipt` action, `components/goods-receipts/`, the PO page's columns, dialog and receipts section, EN/PL strings, help, the stock ledger's "Goods receipt" source label.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, engineering standards §5, two lessons.
- Integration: `goods-receipts-api.test.ts` (8), `goods-receipts.test.ts` (2).

## Verification
- `npm run lint`: 0 errors (1 pre-existing warning in `bom.service.ts`).
- `npm run typecheck`: clean.
- `npm run test:coverage`: 362 files, 2377 tests passed, 100% on all four metrics.
- `npm run build`: succeeded.
- `npm run test:integration` (Docker, production image): first run 274/277, 3 test bugs (see Log); re-run: see the PR.

## Follow-ups
- Block deactivating a location that an Open purchase order delivers to (otherwise the PO can't receive until reactivation).
- Receipt reversal (E11-S02), Close Early (E11-S01), demo receipts once seed order allows.
