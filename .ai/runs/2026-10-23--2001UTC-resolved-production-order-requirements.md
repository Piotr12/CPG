# Resolved production orders plan nothing, and the remaining reversal scenarios are proven (#144)

**Date:** 2026-10-23 20:01 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (issue #144, E11-S04)
**Status:** done

## Goal

Issue #144: a Cancelled, Completed or Closed Early production order still lists component requirements for its whole target and may warn of a shortage. An Open order's requirements are for its target, not its outstanding quantity. Fix the detail read model (API and UI), say so in the `production-order-detail` help topic, and add the tests the E11 closure found missing: BUY-017 (stock unchanged after a PO Close Early), a browser reversal of a goods receipt from the PO page, and reversals of an imported correction and a seeded opening balance. Promote LFC-004 and BUY-017 in `CPG-acceptance.md`, cite the new test in PRD-029, and note the value change in `BACKWARD_COMPATIBILITY.md`.

## Plan

1. `ProductionOrderService` `detail()` (`core/src/services/production-orders/production-order.service.ts`): compute `components`/`shortages` from the view's `outstanding` (0 for terminal orders, target − produced − abandoned for Open) instead of `order.quantity`. Shape unchanged.
2. `production-screen.tsx`: for a terminal order, replace the stock status line with one saying the order needs no more components; the table shows the zero requirements.
3. Help topic `production-order-detail` EN/PL: requirements are for the outstanding quantity.
4. Tests: service (terminal → zero/no shortage, Open 40 of 100 → 60), screen, help text; PO close-early stock unchanged; stock-import correction and opening-balance reversal (only that movement inverted, once); integration: receipt reversal from the PO page and the production-order detail of a closed order.
5. Docs: `CPG-acceptance.md`, `BACKWARD_COMPATIBILITY.md`, lessons if any.

## Log

- 20:01 Issue open, unclaimed, no PR or commit references it; the defect is real on `main` (`detail()` passes `order.quantity`). Claimed the issue. Branch `fix/issue-144-resolved-order-requirements`.
- 20:05 Fix: `detail()` passes the view's `outstanding` to `recipeComponents`. Decision: a resolved order keeps its component rows with `required`/`shortage` 0 rather than an empty list, so the API shape stays and `completionInputs` (which excludes pinned components from added inputs) is unaffected. The page replaces its stock line with "This order is {status}, so it needs no more components." for every non-Open order. The new service tests fail without the fix (2 failed, checked by reverting the service file).
- 20:10 Tests for the closure's other gaps: BUY-017 unit (PO 100 kg, 60 received, Close Early → no movement, stock 60) plus a stock check on the existing UI closure; a stock-import line reversal and a seeded-opening line reversal (only that movement, once); a browser receipt reversal from the PO page (Completed → Open, received 0, stock back).
- 20:12 Integration first run: my new production check read `[role=status]` before the page streamed it, and a rerun on the same `DATA_DIR` hit the existing user (409). Both are recorded lessons; waited for the text, read only shown elements, restarted on a fresh `DATA_DIR`. Docker is unavailable to this account, so integration files ran against the standalone build.
- 20:15 Coverage first run was 99.97 % branches: the old completed-order screen test had been the only one reaching "sufficient". Added an Open, no-shortage case.
- 20:19 `om-auto-review-pr` (PR #178, `--autofix`): approvable; gate on the PR head green. Two findings fixed. Minor: PRD-029's evidence said the page shows the 160 still to make, but the integration test checked that only in the API detail. It now reads the page's requirement row before Close Early (160 kg required, 60 kg available, 100 kg short), as the lesson on evidence lines asks. Nit: LFC-004's evidence cited `production-order.service.test.ts` twice; merged into one citation.

## Changes

- `packages/core/src/services/production-orders/production-order.service.ts`: requirements from `outstanding`.
- `packages/app/src/components/production-orders/production-screen.tsx`, `i18n/messages/{en,pl}.ts` (`resolved`), `help/topics.ts` (`production-order-detail`, EN/PL).
- Tests: `production-order.service.test.ts`, `production-content.test.tsx`, `search-help.test.ts`, `purchase-order.service.test.ts`, `stock-import.service.test.ts`, `stock-reversal.service.test.ts`, `tests/integration/document-lifecycle.test.ts`, `tests/integration/stock-reversals.test.ts`.
- Docs: `.ai/specs/research/CPG-acceptance.md` (LFC-004, BUY-017 → Passed (automated); PRD-029 evidence), `BACKWARD_COMPATIBILITY.md` (Production orders: detail requirement values).

## Verification

- `npm run lint` → 0; `npm run typecheck` → 0; `npm run test:coverage` → 0 (488 files, 3,488 tests, 100 % on every metric); `npm run build` → 0.
- Integration against the standalone build (fresh `DATA_DIR`): `document-lifecycle.test.ts` + `stock-reversals.test.ts` → 15 passed; `production-orders.test.ts` + `production-completions.test.ts` → 10 passed. The full suite runs in CI.
- Review fix: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (3,488 tests, 100 %), `npm run build` → all 0; `document-lifecycle.test.ts` against a fresh standalone copy and `DATA_DIR` → 11 passed.

## Follow-ups

- None new. MRP's reading of closed quantities stays with slice 3 (#14), as the issue scopes it.
