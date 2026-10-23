# Decide a purchase-order line's Cancel / Close early from a server flag (#138)

**Date:** 2026-10-23 20:02 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (issue #138, follow-up from the #137 review)
**Status:** done locally; awaiting the PR's CI

## Goal

The purchase-order screen decides per line whether to offer Cancel or Close early by scanning the order's receipt list, which is paged to the newest 100 since #137. Give purchase-order line views a server-computed `posted` flag (true once any goods receipt line exists for the line, also after a full reversal) and decide from it.

## Log

- 20:02 Triage: real and unfixed. `order-screen.tsx:116` reads `receipts.some(...)` over `goodsReceiptService.list({ purchaseOrder })`, the newest 100; no PR or commit references #138. Classified as a bug (label `bug`).
- Root cause: the screen re-derives "processed" from a paged list, while the server (`PurchaseOrderService.resolve`) counts every `GoodsReceiptLine` of the line. Fix mirrors customer-order lines' `posted` (`postedOrderLineIds`, #91).
- Plan: (1) `purchase-orders/posted-order-lines.ts` — bounded lookup of the lines that have any receipt line, querying only lines whose `received` is zero; (2) `OrderLineView.posted` filled in `viewsOf`; (3) the order screen's header and line `LifecycleControl` read `posted`; (4) unit tests for the lookup (batched, many receipts for one line, reversal) and the screen beyond 100 receipts; (5) `BACKWARD_COMPATIBILITY.md` §4.

- 20:05 Claimed #138 (assignee, `in-progress`, claim comment).
- 20:15 Implemented the flag and switched the screen. The regression page test fails on the old screen (1 failed / 18 passed) and passes with the fix.
- 20:25 Self-review: the new lookup copied the customer-order batching loop. Extracted `postedReferences` (`services/stock/posted-references.ts`) and made both `postedOrderLineIds` use it, per the standards' "copied block with branching logic" rule. The purchase-order version skips the lookup for lines with something received.
- 20:45 Opened #179. A fresh-context review approved with 2 minors and 2 nits, all fixed: the lesson moved to General, this log waits on CI, and `postedReferences` counts only IDs from its batch and stops after a short result, which always holds every match (one query fewer).
- Docker isn't running on this machine, so the integration files ran against `next start` of the production build on an empty `DATA_DIR` (`CPG_BASE_URL`), not the container. CI runs the whole suite in the container.

## Changes

- `packages/core/src/services/stock/posted-references.ts` (+ test): the shared lookup with bounded batches.
- `packages/core/src/services/purchase-orders/posted-order-lines.ts`: lines a goods receipt was ever posted for.
- `packages/core/src/services/purchase-orders/purchase-order.service.ts`: `OrderLineView.posted`.
- `packages/core/src/services/customer-orders/posted-order-lines.ts`: now uses `postedReferences`, with no change in behaviour.
- `packages/app/src/components/purchase-orders/order-screen.tsx`: the header and line lifecycle actions read `posted`.
- Tests: purchase-order service (101 receipts, received back at zero, bounded lookups, no lookup when received), receipt reversal (real reversal keeps `posted`), detail page (#138 regression), fixtures; integration `stock-reversals.test.ts` (API `posted` and the page's Close Early after a real reversal).
- `BACKWARD_COMPATIBILITY.md` §4: the additive `posted` field. `.ai/lessons.md`: one lesson.

## Verification

- `npm run lint`: 0 errors. The 1 warning (`bom.service.ts` `lineError`) is already on `main`.
- `npm run typecheck`: pass.
- `npm run test:coverage`: 3485 tests pass; 100% statements, branches, functions and lines.
- `npm run build`: pass.
- `npm run test:integration -- tests/integration/stock-reversals.test.ts tests/integration/document-lifecycle.test.ts` (plus `goods-receipts`, `purchasing` before the refactor) against the local production build: all pass.

## Follow-ups

- None required. `PurchaseOrderService.resolve` still counts receipt lines on its own (`em.count`), which is fine as the authoritative check.
