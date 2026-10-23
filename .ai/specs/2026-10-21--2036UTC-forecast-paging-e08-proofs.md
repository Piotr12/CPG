# Page the forecast list, and prove fulfilment after deactivation, return corrections and order-audit accounts

**Status:** ready
**Created:** 2026-10-21 20:36 UTC
**Issue:** #140 (E08-S04), epic #74 · **Builds on:** `implemented/2026-10-20--1700UTC-forecasts.md` (E08-S03, #85), `implemented/2026-10-20--1635UTC-customer-orders.md` (E08-S01, #83), `implemented/2026-10-20--2045UTC-shipments-goods-issues.md` (E08-S02, #84), `implemented/2026-10-21--0718UTC-test-tenant-dataset.md` (E12-S02, #126) · **Design authority:** `.ai/specs/product-brief.md` (R07, R08, N02), `.ai/specs/research/CPG-acceptance.md` (SAL-024, SAL-025, LFC-020, AUD-001)

## 📝 TLDR

The forecast list (`GET /api/tenants/{tenant}/forecasts` and `/admin/{tenant}/forecasts`) loads every forecast in the tenant, then filters and sorts them in memory. Since #126, Test holds 120 forecasts (ten products × twelve months), and the list keeps growing. This spec proposes:

- **Paging:** the list comes in pages of 100 (`?page=`, 1-based), in today's order (material ID, location ID, date). The material and location filters apply before paging. The API returns an empty page past the last. The screen shows the last page and adds the shared Previous/Next links.
- **Three proofs:** tests that the code already behaves as the catalogue says. A shipment and a goods issue post on an order whose customer was deactivated (SAL-025, LFC-020). A reasoned positive correction leaves a completed order Completed and fulfilled (SAL-024). A customer-order create entry names the account of the user who created it (AUD-001).

No schema change, no new entity. The response shape stays the same. `page` is a new, additive query parameter on a protected API.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | Split the paging and the three proofs into separate specs? | No. One spec, one implementation PR, two phases. | The issue scopes them together as the E08 closure. The proofs add tests and catalogue lines only, with no runtime surface of their own. |
| Q2 | How is the list paged without changing its order? | One partial read of the matching forecasts (`fields: material, location, date, quantity, version`; references unpopulated) in keyset batches with `disableIdentityMap`. Map the references to business IDs through code maps of the tenant's materials and locations (`codeById`, as the stock report does). Build the views, sort them by material ID, location ID, then date, and slice the page. | Every service here sorts by a related record's business ID in code, never with a relation `orderBy`, which would join (`forecast.service.ts:73-74`, `planning-parameter.service.ts:76`). The stock report (E13-S01) does the same: it reads plain rows, maps them to codes, and pages in memory (`services/reports/stock-report.service.ts:51-58`). A view is just codes, a date, a quantity and a version, so no entity is managed or populated and no second query is needed. A denormalized sort column would need a migration and a backfill for a list of a few thousand rows. |
| Q3 | What does the screen do with a page past the last, or a malformed `page`? | Past the last: show the last page. Malformed (`0`, `1.5`, `x`): the not-found state. A malformed material or location filter is still ignored, as today. | That is what every paged screen does (`purchase-orders/page.tsx`, the stock report), and the 2026-10-21 lesson keeps not-found for page positions. Ignoring a bad filter is existing forecast-page behaviour, outside this change. |
| Q4 | What does the API do with a malformed `page`? | `400 VALIDATION_FAILED`. Until now `page` was ignored. | Same as the purchase-order, goods-receipt and stock list APIs (#126, #115, E13-S01). `BACKWARD_COMPATIBILITY.md` records the change. |
| Q5 | Page size and parameter schema? | 100, through the existing `DOCUMENT_PAGE_SIZE` and `pageSchema` (`validators/shipments/shipment.schema.ts`). | The issue asks for 100, as shipments and goods issues have. #115 reused the same two exports. A second constant equal to 100 would drift. |
| Q6 | Where do the SAL-024, SAL-025 and LFC-020 proofs run? | In the service tests (`goods-issue.service.test.ts`, `stock.service.test.ts` or the customer-order service test, wherever the fixtures already exist), and end to end in `tests/integration/shipments-api.test.ts`, which already creates orders, ships and issues through the API. | The scenarios are "Both" channels. That file already has the helpers, so the proofs need no new setup. |
| Q7 | Where does the AUD-001 proof run? | On both channels. In `customer-order.service.test.ts`, which already asserts the create entry's channel, session and new lines, the create entry also asserts the account. In `tests/integration/customer-orders.test.ts`, an order a normal user creates with their API token (`userSecret`) has a tenant-audit create entry that names that user's account. AUD-001 stays "Partially verified", because it covers every create. Only its customer-order clause is cited. | The service never checks the role, so a hand-built actor makes "normal user" a label. The integration file already has a real normal user. |
| Q8 | What if a proof finds a defect? | A small, local fix ships in this PR, with a regression test, and the run log records it. A defect that needs more than that gets its own issue, and its scenario stays "Partially verified". | That keeps a protected-API change from carrying an unbounded shipment or goods-issue fix. |

None needs human confirmation before merge: no default weakens tenant scoping, removes a field or changes a response shape.

## 📝 Problem Statement

`ForecastService.list` (`packages/core/src/services/forecasts/forecast.service.ts:72`) runs `em.find(Forecast, {}, { populate: ["material", "location"] })`, which loads every forecast in the tenant with its material and location, then filters and sorts in memory. The response grows with the tenant. That breaks the lesson "Bound a new document collection from its first release" (2026-10-20). Shipments, goods issues, goods receipts and purchase orders already page by 100. #126 seeds a year of monthly forecasts per product, so Test already returns 120 rows. Slice 3's MRP runs will add more.

The E08 closure (#146) also found three catalogue scenarios marked "Partially verified" because no test asserts their outcome:

- **SAL-025 / LFC-020:** an Open order whose customer is deactivated must still be fulfillable. Tests cover editing that order and refusing a new one (`customer-order.service.test.ts:207`, `tests/integration/customer-orders.test.ts:175`), but none ships or issues against it.
- **SAL-024 / INV-017:** a return is a reasoned positive correction (N02). `tests/integration/stock.test.ts:77` proves the correction raises stock, but not that a completed order stays Completed and fulfilled.
- **AUD-001:** the customer-order create entry's channel, session and values are asserted, but not its account.

## 📝 Proposed Solution

**Paging.** `ForecastService` gets `list(filter, page = 1)` and `count(filter)`:

1. Resolve the filter. A material or location ID the tenant doesn't have matches nothing: `list` returns `[]` and `count` returns 0. That is today's behaviour, with no error.
2. `count` is `em.count(Forecast, where)`, where `where` holds the resolved material and/or location references. No join is needed.
3. `list` reads the matching forecasts in keyset batches by `id` (`fields: ["material", "location", "date", "quantity", "version"]`, `disableIdentityMap: true`, no populate). It maps each reference to its business ID through a code map of the tenant's materials and locations (one material or location when the filter names one), builds the `ForecastView`s, sorts them by material ID, location ID, then date, and returns the page's slice.

The order matches today's output, so a tenant with no more than 100 forecasts gets exactly today's response from a call without `page`.

**API.** A new `forecastListQuerySchema = forecastFilterSchema.extend({ page: pageSchema })`. The `GET` route parses the query with it and calls `list(filter, page)`. The response stays a JSON array of `ForecastView`.

**Screen.** The page parses `page` with `pageSchema` (malformed → `notFound()`). It computes `pages = max(1, ceil(count / 100))`, clamps the page to it, and passes `page` and `pages` to `ForecastsScreen`. The screen gives `ForecastsTable` the shared `PageLinks` (`components/layout/page-links.tsx`), whose `href` keeps the active `material` and `location`. Applying or clearing the filter drops `page`, because the filter form is a plain GET form without it, so a new filter starts on page 1.

**Alternatives rejected.** A relation `orderBy: { material: { code } }` breaks the repo convention on vetted joins (Q2). Keyset paging by `(material, location, date)` would need the same join. A cursor API would change the contract that every other list uses, `?page=`. Leaving the list unpaged and relying on the filters goes against the lesson, and the issue's acceptance criteria.

**Proofs.** Tests only, plus catalogue updates. If a test fails, that is a defect, handled as Q8 says.

## 📝 Architecture

Everything stays inside the existing forecasts concept: `core/src/services/forecasts/`, `core/src/validators/forecasts/`, `app/src/app/api/tenants/[tenant]/forecasts/route.ts`, `app/src/app/admin/[tenant]/forecasts/page.tsx` and `app/src/components/forecasts/`. It reuses `pageSchema`/`DOCUMENT_PAGE_SIZE`, `PageLinks` and the existing message pattern (`pagination`, `previous`, `next`, `page` in EN and PL under `forecasts`).

The only other caller of `forecastService.list` is the forecasts page. Slice 3's MRP netting (#14) will need every forecast in a horizon. It must not page through this list. It gets its own bounded read when it is designed.

## 📝 API Contracts

`GET /api/tenants/{tenant}/forecasts?material={id}&location={id}&page={n}`

- `page`: an integer from 1 to 1,000,000, default 1. Anything else is `400 VALIDATION_FAILED` with a `page` field error.
- Returns at most 100 `ForecastView`s (`{ material, location, date, quantity, version }`), by material ID, location ID, then date. Filters apply before paging. A page past the last is `[]`.
- A caller that sends no `page` gets the first 100. For a tenant with no more than 100 forecasts, that is today's full response. A caller that relied on getting every forecast of a larger tenant must now request successive pages until one returns fewer than 100 records, as the customer-order list documents. This is the same additive change #115 made for receipts.

`BACKWARD_COMPATIBILITY.md` §4: the forecasts API line documents `page`, and the forecasts UI URL line adds `?page=`.

## 📝 UI/UX

The forecasts table gains the same Previous / "Page 2 of 3" / Next row that the purchase-order list and the stock report show, below the table, only when there is more than one page. The links keep the active filter. The empty state and the filtered empty state don't change. With 120 forecasts, Test shows 100 rows and "Page 1 of 2".

Prototype: none. The change reuses `PageLinks` as rendered on `/admin/{tenant}/purchase-orders`. No new layout.

## 📝 Edge Cases & Failure Scenarios

- **An edit or removal on page 2.** The row actions revalidate the page, and the URL keeps `?page=2`. When a removal empties the last page, the reload clamps to the new last page.
- **A forecast added between two page loads** shifts later rows by one, which is a duplicate or a skipped row across pages. Offset paging on every other list accepts this.
- **Order with UUID references.** Sorting must use business IDs, never the reference's UUID. The tests use enough materials and locations, and insert them in an order, so that UUID order, insertion order and code order differ (lesson 2026-10-21, "Order report rows by business ID").
- **A filter on an unknown or inactive material.** Unknown matches nothing (empty list, one page). Inactive still matches its forecasts, as today.
- **Read-only tenants** read and page as before (R05).

## 📝 Risks & Impact Review

- **Protected API.** A no-`page` caller of a tenant with more than 100 forecasts now gets 100 rows instead of all of them, and a malformed `page` is now a 400. CPG has no external API consumers yet, and the issue makes this choice ("a caller that sends no `page` gets the first page"). Rollback means reverting the PR. No data changes.
- **The key scan is still linear** in the tenant's matching forecasts: a few bytes per row, no populated entities. That bounds what is held and what is sent, which is the lesson's point, but not the rows SQLite reads. The stock report accepts the same trade-off. If forecasts reach hundreds of thousands, a sort-key column becomes worth a migration.
- **Catalogue status.** "Passed (automated)" means the tests passed in CI on `main`. The catalogue edit ships in the same PR, and its CI is the evidence.

## 📝 Decisions in play

- **R07:** every operation has a bearer-token API equivalent. Paging is on both channels, with the same rules.
- **R08:** audit names account, session and channel. AUD-001 gets its account assertion.
- **N02:** a return is a reasoned positive correction, with no return document. SAL-024 is proven against it.

## 📋 Phasing

One implementation PR, in two phases:

- **Phase 1: Paged forecast list.** Service, schema, API, screen, docs, unit and integration tests.
- **Phase 2: E08 proofs.** Service and integration tests for SAL-025/LFC-020, SAL-024 and AUD-001, plus the catalogue updates.

## 📋 Implementation Plan

### Phase 1: Paged forecast list

1. **Service.** `ForecastService.list(filter, page)` and `count(filter)` as above. Tests: 101+ forecasts give page 1 = 100, page 2 = the rest and page 3 = `[]`. The order across pages matches material ID, location ID, then date, with materials created so that UUID and code order differ. Each view keeps its quantity and current `version` (the partial read must load it). The filters apply before paging. An unknown filter ID gives `[]` and a count of 0. `count` honours the filters.
2. **Schema and API.** `forecastListQuerySchema`. The `GET` route forwards `page`. Schema tests cover the default, `2`, `0`, `1.5` and `x`. Route tests check that `page` and the filters reach the service, and that a malformed `page` is a 400.
3. **Screen.** The page parses and clamps `page` and passes `page`/`pages`. `ForecastsScreen`/`ForecastsTable` render `PageLinks` with a filter-keeping `href`. The EN/PL labels are added and covered by the labels test. Page tests cover past-the-last clamping, malformed → not found, and the links keeping the filters.
4. **Docs.** `BACKWARD_COMPATIBILITY.md` §4 (API and UI lines, with the "fewer than 100" stop rule). The forecasts help topic mentions paging if it describes the list.
5. **Integration.** `tests/integration/forecasts.test.ts`: on Test (120 forecasts), the API's page 1 has 100, page 2 has 20 and page 3 is empty, and a malformed `page` is a 400. The screen shows "Page 1 of 2", and Next opens page 2 with the filter kept. The existing check that Test's screen shows 120 rows and 10 materials (`forecasts.test.ts:101-104`) is rewritten: page 1 has 100 rows and page 2 has 20, and the material and date checks run across both pages.

### Phase 2: E08 proofs

6. **SAL-025 / LFC-020.** Service test: an Open order, its customer deactivated, then a shipment created and a goods issue posted. Both succeed, and the order line's fulfilled quantity rises. Integration in `shipments-api.test.ts`: the same flow through the API.
7. **SAL-024 / INV-017.** Service test: an order fully issued (Completed), then a positive correction with a reason at its material and location. The balance rises, and the order stays Completed with its fulfilled quantity unchanged. Integration in `shipments-api.test.ts`: the same, through the API.
8. **AUD-001.** `customer-order.service.test.ts`: the create entry names the actor's account, beside the channel, session and values already asserted. `tests/integration/customer-orders.test.ts`: an order created with the normal user's token has a tenant-audit create entry that names that user's account.
9. **Catalogue.** `CPG-acceptance.md`: SAL-024, INV-017 (the same return, seen from inventory), SAL-025 and LFC-020 become `Passed (automated)`, with the new tests as evidence. AUD-001 stays "Partially verified", and its evidence cites the customer-order account assertions. Remove the "not asserted yet (#140)" notes.
