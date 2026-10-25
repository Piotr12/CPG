# Lists sort by their quantity columns, and the purchase order list by its creation date

**Status:** ready
**Created:** 2026-10-25 07:47 UTC
**Issue:** #224 (follow-up to #217, PR #225) · **Builds on:** #217's list sort (`listSortSchema`, `listOrderBy`, `DataTable` `sortKey`; engineering standards, "List sort and search") · **Design authority:** `.ai/specs/product-brief.md` (R03 exact decimals, R05 tenant isolation)

## 📝 TLDR

Since #217 every main list sorts by a header click, but two kinds of column were left out (#225, "Not sortable"). Quantities are stored as decimal text, so `ORDER BY quantity` would sort `100` before `25`. The purchase order list has no date column at all. This spec proposes that every list column showing a **stored** quantity sorts by its numeric value, exactly and with no migration, and that the purchase order list gets a **Created** column (the order's creation date) that sorts like the Users list's. Nothing changes in the API, the schema or the default order of any list.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | Which quantity columns become sortable? | Every quantity column on a main list whose value is **one stored field**: Forecasts *Quantity*; Production orders *Quantity*; Purchase requisitions *Quantity*, *Converted*, *Abandoned*; Transfers *Quantity*, *Dispatched*, *Received*; Planning parameters *Minimum lot*, *Lot multiple*; Safety stock *Quantity*. | That is what "quantity columns" means on these lists, and each one maps to a single field. |
| Q2 | And the computed ones, the requisition's *Outstanding*, the transfer's *In transit*, the customer order's *Lines*? | Not sortable, as today. | Sorting by them in SQL would mean re-writing the domain formulas (`outstanding`, the transit balance) in SQL arithmetic. That arithmetic runs on text cast to binary floats, which R03 forbids, and it could drift from the domain functions. They can be added later with a stored or generated column (#220 is where indexes and columns are discussed). |
| Q3 | Numeric shadow column, fixed-width encoding, or neither? | Neither. Order by the length of the integer part, then by the text. | A stored quantity is a non-negative decimal written by `formatDecimal` (R03): no sign and no leading zeros. Among those, more integer digits always means a larger number, and with equal integer lengths the text compares digit by digit, which is numeric order. That is exact for all eighteen significant digits R03 allows, where `CAST(… AS REAL)` would not be. It needs no migration, no backfill and no write-path change. |
| Q4 | What date does the purchase order list show? | `createdAt`, as a calendar date in UTC (`YYYY-MM-DD`), under the header **Created** ("Utworzono"), sort key `created`. | The order header has no business date (BUY-008 puts dates on lines), and the issue asks for `createdAt`. The Users list already shows and sorts `createdAt` this way, so the column, its format and its label are reused, not invented. |
| Q5 | Where does the Created column go, and does it hide on small screens? | After *Location*, before *Lines*, with `priority: 2` like the other secondary columns. | The ID, supplier and status are what a row is recognised by. |
| Q6 | Do the API list routes learn these sort keys? | No. They still take only `?page=`. | #221 owns sort and search on the API. |
| Q7 | Does the default order of any list change? | No. A URL without `sort` renders exactly as before. | #217's D3 rule. |

## 📝 Problem Statement

- PR #225 ships header sorting on fourteen lists and names two gaps itself: quantity columns and the purchase order date (#224). A planner looking for the biggest forecasts or the largest open requisitions has to page through the whole list.
- Requisitions sort by required date and transfers by planned dispatch, but a purchase order list can't be put in time order at all. Its default order, by ID, only approximates creation order, and its header shows no date.

## 📝 Proposed Solution

**Quantities.** One ordering helper, used by every list whose service sorts in SQL, and one comparison, used by the two lists sorted after reading.

- SQL lists (Forecasts, Production orders, Purchase requisitions, Transfers): a quantity sort key maps to an `orderBy` of two terms, *integer-part length* in `dir`, then the *field text* in `dir`, then the list's usual tie-breakers. The integer-part length is the SQL expression `instr(<column> || '.', '.')`. It also orders correctly for values written without the six decimals (`"12"`, `"12.5"`), so it doesn't depend on every writer using `fixed: true`.
- In-memory lists (Planning parameters, Safety stock, which already sort after reading because a relation `orderBy` would add joins the tenant lint rules don't vet): compare with `parseDecimal` (`bigint`), which is exact by construction.

**Purchase order date.** `PURCHASE_ORDER_SORTS` gains `created` → `createdAt`; `OrdersTable` gains the *Created* column with `sortKey: "created"`, rendering `createdAt.toISOString().slice(0, 10)` as the Users table does. `OrderView` already carries `createdAt`.

Alternatives rejected:
- **A numeric shadow column** (a REAL or INTEGER micro-unit copy of each quantity). It needs a migration, a backfill, and every write path to keep two fields in step. SQLite's INTEGER is 64-bit, so micro-units fit (`MAX_QUANTITY` < 2⁶³), but nothing on these lists needs an index yet (#220).
- **A fixed-width, zero-padded encoding of the stored text.** It changes R03's storage format and every reader of it, which is a much larger change than sorting.
- **`CAST(quantity AS REAL)`.** Simple, but binary floating point is only exact to about 15–16 significant digits. Two quantities differing in the sixth decimal above about 10⁹ could swap places, which R03 rules out.

Research: Odoo and ERPNext store quantities as numeric columns and sort them natively, which is what the shadow-column option would copy. Neither has a text-quantity constraint like R03, so this spec only needs an ordering that agrees with the numeric one, not a new column.

## 📝 Architecture

- **`@cpg/db`** gets the one raw-SQL fragment, since it is the only package allowed to import `@mikro-orm/*`. A small exported helper builds the integer-length key for a column with MikroORM's `raw((alias) => …)`, so the expression uses the root entity's alias. It is an `ORDER BY` term only, never a `WHERE`. The tenant filter still applies to the query unchanged, and none of the tenant ESLint rules (`execute`, `getKysely`, `qb`, `createQueryBuilder`, `filters`) is involved.
- **`@cpg/core`**: `domain/lists/list-query.ts` gets a `decimalOrderBy(column, dir)` beside `listOrderBy`, taking the key builder from `@cpg/db`. If the layering rules forbid `domain/` importing `@cpg/db`, it sits in a `services/lists/` helper instead. The four SQL services add their quantity keys to their `*_SORT_PATHS` maps (or a parallel map of decimal keys) and build the order with it. `domain/planning-parameters/planning-parameter-order.ts` and `domain/safety-stock/target-order.ts` add comparators using `parseDecimal`. The validators' `*_SORTS` tuples gain the new keys, and their comments drop the "quantity is six-decimal text, so it isn't one" notes.
- **`@cpg/app`**: each table's quantity columns gain a `sortKey`. `OrdersTable` gains the *Created* column, with EN/PL labels. Nothing else changes: `readSort`, `listLinks` and `DataTable` already handle any allow-listed key.

## 📝 UI/UX

- The affected headers become the same sort links as their neighbours, with `aria-sort` and the arrow. The first click sorts ascending, smallest first.
- The purchase order list shows a *Created* column (`2026-10-25`). On narrow screens it hides with the other secondary columns.
- Equal quantities keep each list's existing tie-breaker order (business ID, or the material/location/date key), so pages never overlap.
- No mockups: the change reuses the existing sortable header and adds one date column of an existing kind. The implementation PR carries screenshots of the working screens.

## 📝 Edge Cases & Failure Scenarios

- **Values written without six decimals** (the demo dataset writes some planning values with `formatDecimal` without `fixed`): the integer-length key and `parseDecimal` both still order them numerically. `parseDecimal` treats `"12"` and `"12.000000"` as equal, so they fall to the tie-breaker. The SQL key puts `"12"` just before `"12.000000"` ascending (a shorter prefix), which orders two equal numbers between themselves and never puts a larger number before a smaller one.
- **Zero** (`"0.000000"`, the default of *Dispatched*, *Received*, *Abandoned*): integer part `0` has length 1, and it sorts first ascending.
- **A stale or hand-typed `sort=`**: unknown keys fall back to the list's default, as today (`listSortSchema` `.catch`).
- **Search, filters and paging** keep working with a quantity sort: the sort key only changes `orderBy`.

## 📝 Risks & Impact Review

- **No contract change**: no migration, no API change, no new dependency. `BACKWARD_COMPATIBILITY.md` surfaces are untouched. Rollback is a revert.
- **Performance**: an expression in `ORDER BY` can't use an index, but no list column has one yet (#220) and pages are bounded (`DOCUMENT_PAGE_SIZE`). The cost is the same full sort the other keys already pay.
- **The one raw-SQL fragment** is fixed text built from a column name the code chooses, never from user input. The sort key is allow-listed by `listSortSchema` before it reaches the service.

## 📋 Phasing

One phase: it is small and every step ships on its own.

## 📋 Implementation Plan

### Phase 1 — quantity and purchase order date sort

1. **Ordering helpers.** In `@cpg/db`, add the integer-length order key for a column. In `@cpg/core`, add `decimalOrderBy(column, dir)` (the key, then the text, in `dir`). Unit tests run against a real SQLite file with migrations applied. They prove the ascending and descending order of `"100.000000"`, `"25.000000"`, `"9.5"`, `"0.000000"` and `"999999999999.000002"` / `"999999999999.000001"`, and that the tenant filter still applies.
2. **Forecasts and production orders.** Add `quantity` to `FORECAST_SORTS` and `PRODUCTION_ORDER_SORTS`, wire the services, give the tables' Quantity columns `sortKey`. Service tests prove the numeric order across pages with the tie-breaker. Page and component tests prove the header link.
3. **Purchase requisitions and transfers.** Add `quantity`, `converted`, `abandoned` to `REQUISITION_SORTS` and `quantity`, `dispatched`, `received` to `TRANSFER_SORTS`, then wire them the same way, with the same tests.
4. **Planning parameters and safety stock.** Add `minimum`, `multiple` to `PLANNING_PARAMETER_SORTS` and `quantity` to `SAFETY_STOCK_SORTS`, with `parseDecimal` comparators in their order modules. Domain tests cover mixed fixed and unfixed texts and both directions. Table tests cover the headers.
5. **Purchase order Created column.** Add `created` → `createdAt` to `PURCHASE_ORDER_SORTS` and the service map, add the *Created* column to `OrdersTable` with EN "Created" and PL "Utworzono". Service tests prove the order by `createdAt` with the ID as tie-breaker; component tests prove the column and its link.
6. **Docs and integration.** Update `engineering-standards.md` ("List sort and search": a stored decimal quantity sorts through `decimalOrderBy`; computed figures still don't). Extend the existing integration tests of the touched lists (`forecasts`, `production-orders`, `purchasing`, `transfers`, `planning-parameters`) with one quantity sort each, checked against values that sort differently as text (`100` and `25`), plus the purchase order list sorted by Created.
