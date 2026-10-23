# Page the purchase-requisition list by 100 (#187)

**Date:** 2026-10-23 21:55 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, bug/refactor chain)
**Spec:** none (issue #187 carries scope and acceptance criteria; same pattern as #115, #154)
**Status:** done

## Goal

`PurchaseRequisitionService.list()` loads every requisition of the tenant, for the requisition page
and `GET /api/tenants/{tenant}/purchase-requisitions`. Page it by 100 as the purchase-order list is:
`list(page)` + `count()`, `?page=` on the route, `PageLinks` on the screen, an additive
`BACKWARD_COMPATIBILITY.md` §4 entry, unit tests at 100 % and an integration test past 100.

## Plan

1. Core: `purchaseRequisitionListQuerySchema` (`{ page: pageSchema }`); `list(page = 1)` with
   `DOCUMENT_PAGE_SIZE` limit/offset, validated like `PurchaseOrderService.list`; `count()`.
2. The purchase-order page feeds its Create form's requisition choices from the same `list()`
   (lesson "Paging a list breaks any decision a screen derives from it"). Paging would silently drop
   every requisition past the oldest 100 from the form, so it gets its own read, `listOpen()`: the
   Open requisitions, the only ones a line may convert.
3. App: route `GET` parses `?page=`; page reads `searchParams`, clamps to the last page, 404s an
   invalid one; `RequisitionsTable` renders `PageLinks`; en/pl pagination labels.
4. Docs: `BACKWARD_COMPATIBILITY.md` §4 (page URL and API entry).
5. Tests: service, schema, route, page, table; integration in `purchasing-api.test.ts` creates 101
   Prod requisitions and pages them in the API and on screen. `purchasing.test.ts` reads Prod's
   requisition screen whole in four places (lesson "Paging a list breaks every test that counts it
   whole"): walk pages from the last instead.

## Log

- 21:55 Triage: no PR or commit references #187 (only #193's backlog table lists it). Classified as
  the bug/refactor chain (label `refactor`, like #115/#154). Claimed the issue; branch
  `fix/issue-187-page-requisitions`.
- 22:05 Implemented plan steps 1–5 as written. `document-lifecycle.test.ts` also clicks a row it
  just created on Prod's requisition screen; it now opens `?page=1000000`, which the page clamps to
  the last page, where the newest requisition is.
- 22:10 The worktree had no `node_modules`; ran `npm ci` before the gate.
- 22:15 Integration: Docker isn't reachable on this machine, so I ran the touched files against
  `next start` on a fresh `DATA_DIR` (`CPG_BASE_URL`). A second run on the same server fails in
  `beforeAll` (the file's user already exists): not this change. On a fresh server, running
  `purchasing-api.test.ts` first (leaving Prod with 101+ requisitions) and then `purchasing.test.ts`
  and `document-lifecycle.test.ts` passes, which exercises the page-walking helpers.
- 22:45 Fresh-context review (subagent) found no blockers and one major: a purchase-order line's
  requisition link opened the list's page 1, which no longer shows a requisition past 100. Fixed with
  `requisitionHref` (`components/purchase-requisitions/requisition-link.ts`): requisition IDs run
  from 00000001 without gaps and are never deleted, so requisition N is on page ⌈N/100⌉. Also
  addressed minor #2: `document-lifecycle`'s read-only check now finds its own row on the last page
  before asserting it has no actions. Fixed the BC nit (requisition statuses and `abandoned`).
  Declined the help-topic note: the purchase-order topic doesn't mention paging either.
- 22:55 Browser check on `next start`: PO 00000013's line links requisition 00000111 to `?page=2`,
  and the requisition is on that page. The Create purchase order form offers Open requisition
  00000112 (page 2) and leaves out the Cancelled and Closed Early ones. CI on the first commit: all
  green.

## Changes

- `core`: `PurchaseRequisitionService.list(page)`, `count()`, `listOpen()`;
  `requisitionListQuerySchema`.
- `app`: requisition route `?page=`; requisition page paging (clamp, 404 on invalid);
  `RequisitionsTable` `PageLinks`; en/pl labels; purchase-order page reads `listOpen()`.
- `BACKWARD_COMPATIBILITY.md` §4: page URL and API entry (additive).
- Tests: service, route and page unit tests; integration `purchasing-api.test.ts` (101 requisitions,
  API pages + screen Next), `purchasing.test.ts` (`requisitionRow`), `document-lifecycle.test.ts`.
- Lesson: "Paging by ascending ID moves the row a test just created off the first page".

## Verification

- `npm run lint`: 0 errors (1 warning in `bom.service.ts`, already on `main`).
- `npm run typecheck`: 0.
- `npm run test:coverage`: 497 files, 3,553 tests passed (after the review fixes); 100 % statements, branches, functions, lines.
- `npm run build`: 0.
- Integration against `next start` on a fresh `DATA_DIR`: `purchasing-api`, `purchasing`,
  `document-lifecycle`: 31/31 together; then 14/14 followed by 17/17 with Prod past 100.
- Full integration suite: CI green on the first commit (4 shards); re-run on the review fixes pending.

## Follow-ups

- `listOpen()` is unbounded, as the form's other choice lists (materials, suppliers) are: a tenant
  with thousands of Open requisitions would need a searchable choice instead. Not in #187's scope.
