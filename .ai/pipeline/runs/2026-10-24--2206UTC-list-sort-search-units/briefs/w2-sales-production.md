# W2 — forecasts, customer orders, production orders

Port **3302**. Read `common.md` first.

**Your scope (concept folders, every layer):** `forecasts`, `customer-orders`, `production-orders` (production completions included). Their integration files: `forecasts*.test.ts`, `customer-orders*.test.ts`, `production-orders*.test.ts`, `production-completions*.test.ts`, `production-transfer-reversals.test.ts` only where it breaks. Not shipments (nested on the order page, D1), not materials.

**Lists (sort + search):**
- Forecasts (paged, already filtered by `?material=`/`?location=`: keep both, pass them as `listLinks` `extra`): material (code), location (code), date, status if any. Search material code/description and location code/name. Its filter form stays a GET form with `NativeSelect`s; put the search box in the same filter area without duplicating a form element per field (one `ListSearchBar`, the filters kept as hidden fields through `extra`, or the search field added to the existing filter form — pick the simpler, explain it in your report).
- Customer orders (paged): ID, customer (code), location, order date/due date, status. Search order ID, customer code/name.
- Production orders (paged): ID, output (code), location, planned start, planned finish, status. Search order ID, output code/description. A status that is derived rather than stored can't be an SQL sort: leave it unsortable and say so.

**Forms (D8):** the customer-order form's line material, the production-order create form's output, the forecast create form's material, and any material picker in the completion form (`completion-form.tsx` / `completion-inputs.ts`) become `Autocomplete`s, one accessible name per line.

**Watch:** these lists page (lesson 2026-10-24 "Paging…"): `count({ q })` must use the same where as `list`; test the tie-breaker across a page boundary. Integration tests that click the newest row by paging (`?page=1000000`) must keep working with the default order.
