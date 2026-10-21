# Issue #141 — block location deactivation by Open purchasing, and prove the remaining purchasing scenarios

**Date:** 2026-10-21 20:33 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue` bug route, dispatched by cezar
**Spec:** none for the story itself. It touches `implemented/2026-10-20--1636UTC-purchase-requisitions-orders.md` and `implemented/2026-10-20--1933UTC-goods-receipts.md` (notes only).
**Status:** in progress

## Goal

E09-S03 (#141): a location an Open purchase order delivers to, or with an Open requisition, can't be deactivated: 409 naming the document, EN/PL, nothing changes; allowed once the document is Completed, Cancelled or Closed Early (LFC-018). Plus tests for BUY-009 (converted requisition, then stock read), LFC-021 (receipt after supplier deactivation), MAT-029 (PO readable after its material is deactivated), a UI test that creates POs through the Create purchase order dialog both ways, and a fix for the misnamed TEN-014 assertion in `purchasing-api.test.ts`.

## Log

- 20:33 — Triage (`om-verify-in-repo`): no claim, no PR or commit references #141 (only #146, which filed it). `LocationService.beforeDeactivate` (`packages/core/src/services/locations/location.service.ts`) checks production orders, stock, customer orders and transfers only. Real defect.
- 20:35 — Root cause: the guard list has no purchasing check. `purchasing-usage.ts` is already the leaf module masters use to ask about procurement (`MaterialService`), so the new `assertNoPurchasingAtLocation` goes there, shaped like `assertNoCustomerOrdersAtLocation`: the lowest Open header by code, then the lowest Open requisition. It keys on the stored header status, as the customer-order guard does; the header is maintained by every receipt, cancel and close-early.
- 20:36 — Claimed #141 (assignee, `in-progress`, claim comment). Branch `fix/issue-141-location-purchasing-guard` off `origin/main` 1882d6a in the cezar worktree; `npm ci`.
- Decisions:
  - Codes `LOCATION_HAS_PURCHASE_ORDERS` (`params.order`) and `LOCATION_HAS_REQUISITIONS` (`params.requisition`), following `LOCATION_HAS_CUSTOMER_ORDERS` and the existing `REQUISITION_*` prefix.
  - No index or migration: `findOne` with `orderBy: code` walks the `(tenant, code)` unique index and stops at the first match, as the customer-order guard does.
  - The refusal names the PO as text and doesn't link it. Linking blockers is generalised in #139 (`production-blocker-error.tsx`), and changing that file here would collide with it.
  - MAT-029 keeps "Partially verified": the issue only asks it to cite the PO evidence. BUY-009 and LFC-021 become "Passed (automated)".
  - TEN-014 test (`purchasing-api.test.ts`): posts a Test order naming the Prod-only supplier (404 `SUPPLIER_NOT_FOUND`, Test's order count unchanged) instead of renaming the test.
  - Help topics (EN/PL) for requisitions and purchase orders now state the location rule.
- Regression check: with the new `beforeDeactivate` line removed, the two refusal tests fail; restored, all pass.

- 21:40 — Fresh-context review (`om-code-review`, subagent) approved: no blocker or major. Fixed on the PR: the BUY-009 evidence wrongly cited the UI test, which doesn't read stock; LFC-018's "Missing:" now also lists the unlinked purchasing and customer-order refusals; the guard's doc comment; a Polish help phrase; a note that the UI refusal test uses the test above. The guards have no composite index (a successful deactivation scans the tenant's orders by code, as the customer-order guard already does). Adding one needs a migration (risk-high), so it is filed as #162.

## Changes

- `packages/core/src/services/purchase-orders/purchasing-usage.ts`: `assertNoPurchasingAtLocation`.
- `packages/core/src/services/locations/location.service.ts`: calls it in `beforeDeactivate`.
- `packages/app/src/i18n/messages/{en,pl}.ts`, `packages/app/src/help/topics.ts`: messages and help.
- Tests: `purchase-order.service.test.ts` (LFC-018, MAT-029), `goods-receipt.service.test.ts` (BUY-009, LFC-021), `error-message.test.ts`, `tests/integration/purchasing-api.test.ts` (LFC-018 API, MAT-029 API+UI, TEN-014), `tests/integration/purchasing.test.ts` (dialog both ways, UI refusal).
- Docs: `BACKWARD_COMPATIBILITY.md`, `CPG-acceptance.md` (BUY-009, LFC-018, LFC-021, MAT-029), the two spec notes.

## Verification

- `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (483 files, 3270 tests, 100% statements/branches/functions/lines), `npm run build` 0.
- Regression: removing the `assertNoPurchasingAtLocation` call fails both refusal tests; restoring it passes.
- Integration, locally: Docker isn't reachable from this macOS account (lesson 2026-10-19), so the files ran against the standalone build (fresh copy, fresh `DATA_DIR`, port 3141): `tests/integration/purchasing-api.test.ts` and `tests/integration/purchasing.test.ts`, 19/19 passed. The first run failed only in the new UI refusal test: its `button()` helper matched text, and the row-actions button is named by `aria-label`. The helper now matches both, as `named-records.test.ts`'s does. No migration, so `smoke.test.ts` isn't needed. The full suite runs in CI.

## Follow-ups

- #162: composite indexes for the location guards (purchase orders, requisitions, customer orders).
- #139 generalises the deactivation-blocker links. The new purchase-order refusal could then link `/admin/{tenant}/purchase-orders/{id}`; requisitions have no detail page.
