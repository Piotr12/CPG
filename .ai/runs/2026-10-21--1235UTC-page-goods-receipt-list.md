# Page the goods-receipt list API (#115)

**Date:** 2026-10-21 12:35 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 115`)
**Spec:** none (follow-up from the #112 review)
**Status:** done

## Goal

`GET /api/tenants/{tenant}/goods-receipts` takes `?page=` (1-based, 100 per page, newest first; a page past the last is empty), fetches lines for that page only and groups them once, as shipments and goods issues do. `BACKWARD_COMPATIBILITY.md` documents it.

## Log

- 12:35 — Triage: issue open, unclaimed, no PR or commit references it. `GoodsReceiptService.list` finds every receipt with no limit, and `viewsOf` filters the line list once per receipt. Claimed the issue (assignee, `in-progress`, claim comment).
- Plan: reuse `DOCUMENT_PAGE_SIZE`/`pageSchema` (`validators/shipments/shipment.schema.ts`) and `groupBy` (`services/shipments/shipment-records.ts`, a leaf module) as goods issues do; add `page` to `receiptListQuerySchema`; `limit`/`offset` in `list`; update the route doc and `BACKWARD_COMPATIBILITY.md` (the receipts entry and the reversal note that says receipt lists stay unpaged). Tests: schema, service (101 receipts over two pages, page 3 empty, lines per receipt), route forwarding `page`.

- 12:40 — Implemented as planned. The new service test fails without the fix (101 receipts on the first page instead of 100).
- 12:55 — Docker isn't running on this machine, so Testcontainers can't start. Ran the touched integration file against `npm run build` + `PORT=3415 DATA_DIR=<fresh tmp> CPG_ADMIN_PASSWORD=… npm run start` with `CPG_BASE_URL` instead. (`npm run start -- -p 3415` doesn't work: the workspace script passes `3415` as a positional argument; use `PORT`.)

## Changes

- `core/src/validators/goods-receipts/goods-receipt.schema.ts`: `receiptListQuerySchema` takes `page` (`pageSchema`, default 1).
- `core/src/services/goods-receipts/goods-receipt.service.ts`: `list` pages by `DOCUMENT_PAGE_SIZE` with `limit`/`offset`; `viewsOf` groups lines once with `groupBy`.
- `core/src/validators/shipments/shipment.schema.ts`: `DOCUMENT_PAGE_SIZE` comment names goods receipts.
- `app/src/app/api/tenants/[tenant]/goods-receipts/route.ts`: doc comment.
- `BACKWARD_COMPATIBILITY.md` §4: receipts entry documents paging; the #91 note no longer says receipt lists are unpaged.
- Tests: schema, service (101 receipts, page 2, page 3 empty, lines per receipt), route (`page` forwarded, `page=0` / `1.5` → 400), `tests/integration/goods-receipts-api.test.ts` (`page=1`, `page=2` empty, `page=0` → 400).

## Verification

- `npm run lint` ✅, `npm run typecheck` ✅
- `npm run test:coverage` ✅: 479 files, 3138 tests, thresholds met
- `npm run build` ✅
- `tests/integration/goods-receipts-api.test.ts` against a local production build ✅: 8/8. The full suite runs in CI.

## Follow-ups

- None. The screens still show the first 100 receipts of one purchase order, as the shipment and goods-issue screens do.
