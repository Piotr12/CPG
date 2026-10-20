# Issue #86 (E09-S01): purchase requisitions and purchase orders

**Date:** 2026-10-20 16:36 UTC
**Agent:** Claude Code (Sonnet 5.5), via cezar `/om-auto-fix-issue 86`
**Spec:** `.ai/specs/2026-10-20--1636UTC-purchase-requisitions-orders.md`
**Status:** done

## Goal
Requisitions and POs with one location and dated lines, created directly or by converting a requisition, in the UI and the API (issue #86).

## Log
- 16:36 Feature route, no spec existed: spec written on this branch (one branch, no separate spec PR: the cezar task owns one branch).
- Design: `PurchaseRequisition` (single material/location, converted + status), `PurchaseOrder` + `PurchaseOrderLine` (optional requisition link); conversion happens in the PO's transaction; only dates editable afterwards.
- Shared `lineError` moved out of `bom.service.ts` into `services/materials/line-error.ts`.
- The migration's new rollback step: older rollback tests now roll back purchasing first (lesson: `down()` once per migration).

## Changes
See the branch diff.

## Verification
- `npm run lint`, `npm run typecheck`: clean.
- `npm run test:coverage`: 314 files, 2050 tests passed, 100% on all four metrics.
- `npm run build`: succeeded.
- `npm run test:integration` against the built standalone server (Docker unavailable: it belongs to another macOS user): 28 files passed, 228 tests, 1 skipped (startup-guard, Docker only). Includes new `purchasing-api.test.ts` (11) and `purchasing.test.ts` (3).
- Not run: the Docker-image integration path.

## Follow-ups
- UI editing of required/planned dates (API-only now).
- E09-S02 goods receipts; E11 cancel/close; stock end-to-end check of BUY-009 once the ledger exists.
