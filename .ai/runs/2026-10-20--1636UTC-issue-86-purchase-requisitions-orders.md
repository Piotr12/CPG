# Issue #86 (E09-S01): purchase requisitions and purchase orders

**Date:** 2026-10-20 16:36 UTC
**Agent:** Claude Code (Sonnet 5.5), via cezar `/om-auto-fix-issue 86`
**Spec:** `.ai/specs/2026-10-20--1636UTC-purchase-requisitions-orders.md`
**Status:** in progress

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
(filled in at the end)

## Follow-ups
