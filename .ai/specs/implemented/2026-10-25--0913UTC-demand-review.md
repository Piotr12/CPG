# Demand review: shipped and still to ship, per day, week or month

**Status:** implemented
**Created:** 2026-10-25 09:13 UTC
**Issue:** #240 (decided by the owner on the issue; it also tracks the implementation) · **Depends on:** #239, `implemented/2026-10-25--0913UTC-statistical-unit.md` (SU, `report-units.ts`) · **Decision:** D08 (`research/decisions/D08-statistical-unit-and-demand-review.md`), which supersedes DEM-007's same-date netting · **Builds on:** the stock report (`implemented/2026-10-20--2221UTC-stock-report.md`: report service, route, filter form), the report filter autocomplete (#222, `FilterAutocomplete`), forecasts (`implemented/2026-10-20--1700UTC-forecasts.md`), shipments and goods issues (`implemented/2026-10-20--2045UTC-shipments-goods-issues.md`), stock reversals (`implemented/2026-10-21--0706UTC-stock-reversals.md`), design system v1 · **Design authority:** `.ai/specs/product-brief.md` (R03, R05, D04, D08), `research/CPG-acceptance.md` DEM-002…013

The issue holds the three mockups and the question table. The owner chose **mockup A's chart with mockup B's grid in place of A's bucket table**. This spec is that end state, and it wins where the mockups differ.

## 📝 TLDR

Planners can't see today, in one place, what has shipped and what is still to come. A new **Demand review** screen (Sales → Demand review) puts both on one time axis, in day, week or month buckets:

- **Shipped**: goods issued, net of reversals.
- **Open customer orders**: still to ship. Overdue lines count as due today.
- **Forecast not yet ordered**: the forecast left after the month's orders consume it (D08).
- An **Ordered** line over the past shows where shipping fell behind demand.

The filters are a time bucket, locations and finished products (both multiselect) and a unit. With two or more products only SU can be shown (#239).

A stacked-column chart sits on top and a products × buckets grid below it. The same read is exposed as `GET …/reports/demand-review`.

## Resolved decisions (owner, #240)

| # | Question | Decision |
|---|---|---|
| Q1 | Layout | Mockup A's chart, with mockup B's grid replacing A's bucket table. Mockup C's KPI tiles are not built. |
| Q2 | What the past shows | Shipped as columns, plus an **Ordered (by required date)** line over the past and current buckets. |
| Q3 | Forecast netting | **D08:** a forecast is consumed by the orders whose required date falls in **its calendar month**, not only on its own date. This supersedes DEM-007. |
| Q4 | Date of a shipment | The goods issue's business date. |
| Q5 | Reversals | A reversed goods-issue line counts zero on its **original** date. |
| Q6 | Location | The customer order's location (SAL-004), for orders and their goods issues alike. |
| Q7 | Time window | A fixed window per bucket, plus Earlier and Later links. No free From/To dates. |
| Q8 | Product choice | Finished products only. |
| Q9 | KPIs | None in this spec. OTIF is a future story of its own. |
| Q10 | Charts | Hand-written SVG components in `@cpg/ui`, no dependency. |
| Q11 | Export and API | `GET /api/tenants/{t}/reports/demand-review` (API parity with the other reports). No `.xlsx` export. |
| Q12 | Menu | Sales → Demand review. The route is `/admin/[tenant]/reports/demand-review`, beside the other reports. |
| Q13 | Baseline | D08, together with #239. |

## 📝 Problem Statement

- Shipped history sits in goods issues, firm demand in open customer-order lines, and expected demand in forecasts. Today each lives on its own list, in base units, and nothing adds products together.
- The realistic Test dataset dates every forecast on the 1st of a month (120 = 10 products × 12 months). Under DEM-007's same-date netting, orders due later in the month never consume it. The prototype showed November for `Cabinet, red` at about 6 pallets (about 2.8 ordered plus 3.2 forecast) against about 3 shipped every month. MRP (#14) would overstate demand the same way. D08 fixes the rule once, for both.

## 📝 Proposed Solution

### Definitions (normative)

Every figure is per **material × location × bucket**, in base micro-units (`bigint`, R03), and is converted to the report unit only at the end, per material (`fromBase`, #239). **Today** is the server's UTC date, the business date of postings (INV-010).

- **Buckets.**
  - *day*: one date.
  - *week*: an ISO week, Monday to Sunday, labelled `W44` with the Monday's date (`W44 · 26 Oct`). The year is the ISO week-year (2026 has `W53`).
  - *month*: a calendar month, labelled `Nov 2026`, or `Nov` once the year is shown.
  - The **current** bucket contains today. **Past** buckets end before it, and **future** buckets start after it.
- **Window** = the current bucket plus *back* buckets before it and *ahead* buckets after it: day 21/21, week 13/13, month 9/6. `offset` (an integer from −20 to 20, default 0) moves the whole window by `offset × ahead` buckets, which is what Earlier and Later do. The past/current/future status of a bucket always comes from the real today.
- **Shipped(b)** = Σ `GoodsIssueLine.quantity` over issues whose `businessDate` falls in `b`, for lines whose stock movement has **no reversal**. The material is `shipmentLine.orderLine.material` and the location is `shipmentLine.shipment.order.location`. Reversals come from `documentMovements(em, GOODS_ISSUE_MOVEMENT, issueIds)` (`services/stock/movement-reversals.ts`), and a line counts as reversed when its `issueId:position` has a `reversedBy`. A reversal always takes the whole movement, so there is no partial case.
- **Ordered(b)** = Σ (`quantity − abandoned`) over customer-order lines that are not `removed`, with `requiredDate` in `b`, whatever their status. It is drawn only for past buckets and the current one.
- **Open(b)** = Σ `outstandingQuantity(quantity, fulfilled, abandoned)` (`domain/document-lifecycle/lifecycle.ts`) over **open**, non-removed lines with a positive outstanding quantity. A line counts in the bucket of `max(requiredDate, today)`. **Overdue(b)** is the part of Open whose `requiredDate < today`, so it is never above zero outside the current bucket (DEM-012).
- **Forecast not yet ordered(b)**, by D08. For each material M, location L and calendar month P:
  1. *Consumption* C = Σ (`quantity − abandoned`) over non-removed order lines of M at L with `requiredDate` in P, whatever their status. Closed-early and cancelled lines release what they never shipped (DEM-010/011). Fulfilled lines keep consuming (DEM-009). An overdue line keeps consuming its own month (DEM-013).
  2. C is allocated to P's forecasts of M/L **in date order**: a forecast's residual is `max(0, quantity − what is left of C)`.
  3. Each forecast's residual counts on `max(date, today)`. A residual dated before today in the current month therefore lands in today's bucket ("the rest of this month's forecast is still to come"). Forecasts of months that ended before today's month have **expired** and count nowhere.
- **Still to ship(b)** = Open(b) + Forecast not yet ordered(b). The current bucket shows its Shipped *and* its Still to ship.

`core/src/domain/demand/` holds the rule as two pure functions that MRP (#14) will reuse unchanged:

- `forecast-netting.ts`: `netForecasts(forecasts, orderLines, today)` returns the residual per forecast, with dated placement;
- `demand-buckets.ts`: the bucket frame, ISO week numbers, `bucketOf(date)` and labels data.

Its tests are DEM-002…013 restated per D08 (below).

### The screen

`/admin/[tenant]/reports/demand-review`. Any signed-in account may open it, read-only tenants included, and it writes nothing. From top to bottom:

1. **`PageHeader`**: "Demand review — {tenant}". Intro: "What shipped and what is still to ship, per {bucket}. Today is {date}; open orders past their required date count as due today."
2. **Filter form** (GET, on a `Card`, works before hydration):
   - **Time bucket**: Day / Week / Month (`bucket`, default `week`).
   - **Locations** (`location`, repeatable; empty means all).
   - **Finished products** (`material`, repeatable; empty means all). Each option shows its SU factor as detail (`1 each = 1.5 SU`, or "No SU factor").
   - **Unit** (`unit`): every report unit of the selection (#239 `reportUnits`), followed by the selection's `disabledUnits` (below), shown disabled. Under the fields, one line says why: "{n} finished products are shown together, so quantities are in statistical units (SU). Choose one product to see it in each, pallet or case." For one product it says "One product is selected, so any of its units can be shown: each, pallet, SU."
   - **Apply** and **Clear**. The form never carries `offset`, so Apply always returns to the window around today, with or without JavaScript. Only the Earlier and Later links carry it.
3. **Excluded callout** (warning, only when the unit is SU and some selected product has no factor): "Left out: {IDs and names} have no SU factor yet." It links to the Statistical units page. If every selected product is excluded, the chart and grid make way for an `EmptyState` with the same link.
4. **Chart card**:
   - Title "Shipped and still to ship per {bucket}, in {unit}", and a header line "Last {back} {buckets}: {shipped} {unit} shipped · this {bucket} and next {ahead}: {still to ship} {unit} to ship".
   - A legend: Shipped, Open customer orders (overdue ones due today), Forecast not yet ordered (hatched swatch), Ordered (line with dots).
   - The chart, then **Earlier** / **Later** links (plain `Link`s keeping the filters, with `offset ∓ 1`) below it on the right.
5. **Grid card**:
   - Rows are the selected products, or the selected locations when exactly one product is chosen. A row with no figure in the window is left out, and the caption says how many were left out. Columns are the window's buckets.
   - Past cells show Shipped, future cells Still to ship, and the current cell both added up. A cell is its material's base figure converted once (`fromBase`). A product row's **Total** cell and the **Total** row add the converted cells. For location rows (one product), each cell and the Total are `fromBase` of the summed base figure, so a total may differ from the sum of its cells by a rounding of at most 0.000001 per cell.
   - Products excluded for lack of an SU factor get no row and don't count in `omittedRows`. The callout names them instead.
   - Each row has a disclosure button (`aria-expanded`) opening three sub-rows: *open orders*, *of which overdue* (warning token + icon when above zero) and *forecast not yet ordered*.
   - A **Total ({unit})** row comes last.
   - The first column is sticky. Past columns are tinted `bg-muted` and the current column has a 2 px `border-foreground` rule. The grid opens scrolled so the current column is in view (a client effect; without JavaScript it starts at the left).
   - The caption reads "{n} products · {unit} per {bucket} · tinted columns are shipped, white ones still to ship".

Number formatting is `Intl.NumberFormat` in the reader's locale: up to 1 decimal under 100 and none from 100 up. Zero shows as `–`. The API returns the exact six-decimal texts.

Prototype screenshots (realistic Test dataset, 1440 px), taken from the issue: the chart in [A-1](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/demand-review-mockups/a-1-timeline-week-all.png), one product in pallets in [A-2](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/demand-review-mockups/a-2-timeline-month-one-product-pallets.png), the product multiselect in [A-3](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/demand-review-mockups/a-3-material-multiselect.png) and the grid in [B-1](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/demand-review-mockups/b-1-grid-week-all.png). The spec differs from them in four ways:
- the grid has no Trend sparkline column (the chart above shows the trend) and no Download button;
- the chart adds the Ordered line;
- the forecast placement follows D08;
- the "Mockup" badge is gone.

### New `@cpg/ui` pieces (built here, reused by later reports)

- **Folder:** the screen's components go in `app/src/components/reports/` (`demand-review-screen.tsx`, `demand-review-filters.tsx`, `demand-review-grid.tsx`), beside the stock and variance reports, matching `services/reports/`.
- **`backend/forms/segmented-control.tsx`**: a `radiogroup` of native radio inputs styled as a 32 px segmented control (`bg-muted` track, `bg-background` checked segment). It supports disabled options. Being native radios, it works without JavaScript, and arrow keys move between options.
- **`backend/forms/filter-multi-select.tsx`**: a multiselect counterpart of `FilterAutocomplete` (#222), with the same hydration contract.
  - **Before hydration:** a native `<select multiple>` named like the parameter.
  - **Once hydrated:** a button showing "All …", the one choice, or "{n} selected", which opens a `Popover`. The popover holds a search field matching ID and name with `matchOptions` from `autocomplete.tsx`, a "{shown} of {total}" line with **Select shown** and **Clear**, and a `listbox` with `aria-multiselectable="true"` of `Checkbox` options with their detail line.
  - Chosen values submit as repeated hidden inputs and show as removable chips under the field (first four, then "+{n} more").
  - It is keyed by the URL's selection, as `FilterAutocomplete` is.
- **`backend/charts/stacked-column-chart.tsx`**: a server-renderable SVG.
  - **Props:** `buckets` (key, short label, past/current flags, stacked `segments` values), an optional `line` series, `todayFraction`, `unit`, `labels`, and an optional `marker` per bucket (overdue).
  - **Columns:** at most 24 px wide with a 4 px rounded top; a 2 px surface gap between stacked segments; the third series hatched (an SVG `pattern` at 45°).
  - **Axes and areas:** "nice" ticks (steps of 1, 2, 2.5 or 5 × 10ⁿ) with the unit on the top tick; recessive 1 px gridlines; the past area tinted; a Today rule at `todayFraction` of the current bucket, with "Past · what shipped" and "Today and ahead · what is still to ship" captions.
  - **Line:** the Ordered line is 1.5 px in `foreground` at 70% with 2.5 px dots in a surface ring.
  - **Overdue marker:** text plus `TriangleAlertIcon` in the warning token above the current column.
  - **Accessibility:** each column has a `<title>` (native tooltip) listing its figures; `role="img"` with an `aria-label` summary; the grid is the accessible table view.
- **`backend/charts/chart-legend.tsx`**: swatch + text items (text in text tokens, never in the series colour).

**Chart colour tokens.** The unused greyscale `--chart-1…5` are replaced by a categorical palette validated for colour-vision deficiency (adjacent CVD ΔE ≥ 9.2, normal ΔE ≥ 26.5, in both themes):

| Token | Light | Dark | Series |
|---|---|---|---|
| `--chart-1` | `oklch(0.575 0.163 255.5)` | `oklch(0.622 0.161 255.1)` | Shipped |
| `--chart-2` | `oklch(0.671 0.175 40.6)` | `oklch(0.622 0.173 40.1)` | Open customer orders |
| `--chart-3` | `oklch(0.669 0.141 162.1)` | `oklch(0.621 0.128 163.1)` | Forecast not yet ordered (hatched) |

`--chart-4`/`--chart-5` and their `--color-chart-4/5` entries in `@theme` are removed (nothing uses them). This **extends design system v1's colour rule**, "hue only for the tenant, success, warning and danger". The added rule: **series identity inside a chart, never text, never anything outside `packages/ui/src/backend/charts/`**. It is enforced as follows:

- `tests/design-tokens.test.ts` gets a **new rule** in `RULES`. An `ALLOW_LIST` row would do nothing, because the existing rules never flag `chart`. The rule matches `(bg|text|fill|stroke|border)-chart-\d` and `var(--(color-)?chart-\d)`. It allows a match only under `packages/ui/src/backend/charts/`, and it flags `text-chart-*` everywhere. A scanner test covers both cases.
- `tokens.test.ts` pins `--chart-1` (4.42:1) and `--chart-2` (3.20:1) at ≥ 3:1 on `--background` and `--card` in both themes, and the dark `--chart-3`.
- The light `--chart-3` (2.82:1) is exempt, because it is always hatched and the grid always accompanies the chart.
- The tinted past area covers **past buckets only**, ending at the current bucket's start. The light `--chart-2` reaches only 2.93:1 on `--muted`, and Open is never drawn in a past bucket. The Today rule sits inside the current bucket at `todayFraction`.
- `engineering-standards.md` and the design system spec's colour principle get the same one-line rule.

### Service and API

- **Validator** `core/src/validators/reports/demand-review.schema.ts`, a `z.strictObject`:
  - `bucket`: `day|week|month`, default `week`;
  - `material`: a material reference, or an array of them (string → `[string]`), max 500, unique;
  - `location`: likewise;
  - `unit`: an optional trimmed string;
  - `offset`: an integer from −20 to 20, default 0.
- **Service** `DemandReviewService.read(query)` in `core/src/services/reports/demand-review.service.ts`, registered as `demandReviewService` (one line in `container.ts`, one in `cradle.ts`). It refuses:
  - an unknown material (`MATERIAL_NOT_FOUND`) or location (`LOCATION_NOT_FOUND`);
  - a selected material that isn't finished: `VALIDATION_FAILED`, field `material`, message "Choose finished products only.", with an EN/PL text.

  It reads only the window, in a bounded number of queries (materials and locations in `$in` chunks of 100, reversal links two queries per 100 issues), each with every material and location condition pushed into `where`:
  1. finished materials and their conversions (as `statisticalFactors()`);
  2. goods-issue lines populated to material and location, with `issue.businessDate` in the window;
  3. their reversals, in batches of 100;
  4. non-removed order lines with `requiredDate` in `[min(window start, first day of today's month), last day of the month of the window end]`, plus open lines with `requiredDate < today`;
  5. forecasts dated from the first day of today's month to the window end.

  It tallies with the domain functions, converts each material's bucket totals with `fromBase`, then sums.
- **View** (also the API body):

  ```ts
  { today, bucket, offset, window: { from, to },                  // ISO dates, to exclusive
    unit, units: string[],                                         // the unit used and the units offered
    disabledUnits: string[],                                       // 2+ products: the union of their base and non-SU conversion units, in unit order; else []
    materials: string[], locations: string[],                      // the selection (empty = all)
    excluded: { material: string; code: "NO_STATISTICAL_FACTOR" }[],
    buckets: { start: string; end: string; past: boolean; current: boolean; todayFraction?: number }[],
    total: Figures[],                                              // one per bucket
    rows: { key: string; figures: Figures[] }[],                   // material codes, or location codes for one product
    omittedRows: number }
  // Figures = { shipped, ordered, open, overdue, forecast } as six-decimal texts in `unit`
  ```

  Labels (`W44 · 26 Oct`) are built in `app` from `start`, in the reader's locale.
- **Route** `app/src/app/api/tenants/[tenant]/reports/demand-review/route.ts`, a copy of the stock report's route pattern: `requireApiUser`, `tenantScope`, then the URL's search params with repeated keys kept (`getAll` for `material` and `location`). An invalid unit is not an error: the response's `unit` says which one was used.
- **Indexes** (one migration, `create index` only): `goods_issue(tenant_code, business_date)`, `customer_order_line(tenant_code, required_date)` and `forecast(tenant_code, date)`. Prove each with `explain query plan` on the SQL MikroORM really sends (lesson 2026-10-23). A new migration moves every test that counts migrations: `tests/integration/smoke.test.ts`, `packages/db` `orm.test.ts`, `core/src/database.test.ts`, `system-status.service.test.ts` and the rollback-by-count tests. Grep for the current count before the change.

### D08 restated as acceptance cases (unit tests of `netForecasts`)

Here F means forecast, O order, GI goods issue, and all dates are in one month unless said otherwise.

- **DEM-002:** F 100 on the 1st, O 60 on the 1st → firm 60, residual 40.
- **DEM-002 per D08:** F 100 on the 1st, O 60 on the 14th → residual 40. Under the old rule it was 100.
- **DEM-003:** O 120 → residual 0, never negative.
- **DEM-004:** no O → 100.
- **DEM-005/006:** another material or location consumes nothing.
- **DEM-007 per D08:** an order in **another month** consumes nothing.
- **DEM-008:** O 60 with GI 30 → open 30, residual 40.
- **DEM-009:** fully shipped → residual still 40.
- **DEM-010:** O 60, GI 30, closed early → residual 70.
- **DEM-011:** cancelled → 100.
- **DEM-012:** an overdue open line counts today.
- **DEM-013:** an overdue line still consumes its own month.
- **Two forecasts in one month** (1st 50, 15th 50) with O 70 → residual 0 on the 1st and 30 on the 15th.
- **A month already under way:** a residual dated before today shows today.
- **An ended month's** forecast is expired.

## 📝 Architecture

- **`@cpg/db`**: three indexes in the entities (`indexes:` on `GoodsIssue`, `CustomerOrderLine`, `Forecast`) and their migration. No new entity.
- **`@cpg/core`**:
  - `domain/demand/` (netting, buckets, tally), pure and reusable by MRP;
  - the validator;
  - `DemandReviewService`;
  - container and cradle lines;
  - the #239 `report-units.ts`.
- **`@cpg/ui`**: `SegmentedControl`, `FilterMultiSelect`, `StackedColumnChart`, `ChartLegend`, and the chart tokens in `globals.css`.
- **`@cpg/app`**:
  - the page, `components/reports/demand-review-*` (screen, filter form, grid, labels);
  - the route;
  - nav entry `demandReview` in the Sales group (`nav-tree.ts`, icon `ChartColumnStackedIcon`);
  - help topic `demand-review`;
  - EN/PL messages.

```mermaid
flowchart LR
  P[page / API route] --> S[DemandReviewService]
  S --> N[domain/demand: buckets + netting]
  S --> U[domain/units/report-units (#239)]
  S --> R[movement-reversals.ts (existing)]
  N -. reused by .-> M[MRP #14, planned]
```

The service is the only reader, and the netting rule lives in `domain/demand` so MRP inherits D08 rather than re-implementing it.

## 📝 Edge Cases & Failure Scenarios

- **No finished products** in the tenant: the filters are disabled and an `EmptyState` says "Add a finished product first", with a link to Materials.
- **Nothing in the window**: the chart is replaced by "Nothing shipped or due in this window", and the grid shows its empty state. Earlier/Later stay available.
- **Every selected product lacks an SU factor**: see the excluded callout. In a single-product unit (each, pallet) nothing is excluded.
- **A stale `unit`** after the products change: the page silently uses the default, and the unit control shows which.
- **Inactive products or locations** stay selectable, marked "(inactive)", because their history is still real.
- **A reversal posted after the page loaded**: the next read counts zero for that line. Its order line is open again and shows as open, possibly overdue.
- **A huge selection**: `material` is capped at 500 values (400 above that), and the queries use `$in` in chunks of 100, as `movementReversals` does.
- **The window crosses a year:** ISO W53 (2026) is followed by W1 2027. Tested.

## 📝 Risks & Impact Review

- **D08 changes an acceptance rule.** It is owner-approved on #240 and recorded as a decision row, a decision note and an erratum on DEM-007. No code depends on DEM-007 yet (MRP is #14), so nothing already shipped changes behaviour.
- **Performance.** Five bounded reads plus an in-memory tally. On the realistic dataset (1,053 goods-issue lines, 988 order lines, 120 forecasts) this is far below 100 ms. Step 2 measures it at 10× those rows on a SQLite file and records the timing in the PR. Budget: under 300 ms per read at 10×. better-sqlite3 blocks the server while it reads (lesson 2026-10-24).
- **Design system.** It gains hues for chart series. The rule is narrow (series identity inside `backend/charts/` only) and enforced by `tests/design-tokens.test.ts`'s Exceptions table.
- **API.** One additive read route, nothing changed. `BACKWARD_COMPATIBILITY.md` gains the UI route `/admin/{tenant}/reports/demand-review` (its query parameters, help topic `demand-review`) and the `GET …/reports/demand-review` contract, next to the stock and variance report entries.
- **The forecast entity's comment** cites DEM-007 as the netting key. It is reworded to D08 in step 1.

## 📝 Decisions in play

- **D04** (frozen baseline): extended by **D08**, owner-approved on #239/#240.
- **D08**: SU, this screen, and forecast consumption by calendar month. It supersedes DEM-007's same-date isolation.
- **R03**: `bigint` throughout. Unit conversion happens once per material total.

## 📋 Phasing

Two phases, one PR each, both tracked on #240. #239 is implemented first or together with Phase 1.

- **Phase 1 — Demand data:** netting, buckets, service, indexes, API. It is shippable on its own (API only).
- **Phase 2 — Screen:** `@cpg/ui` pieces, chart tokens, page, nav, help, integration tests.

## 📋 Implementation Plan

### Phase 1 — Demand data and API

1. **Domain.**
   - `domain/demand/demand-buckets.ts`: windows, ISO weeks, `bucketOf`, `todayFraction`.
   - `domain/demand/forecast-netting.ts`: D08.
   - `domain/demand/demand-tally.ts`: definitions → per material/location/bucket base figures.
   - Reword `forecast.entity.ts`'s comment from DEM-007 to D08.
   - Tests: the D08 acceptance cases above; bucket frames for each bucket at month, year and W53 boundaries; `offset`; the tally's reversal, overdue and location-from-order cases.
2. **Indexes.** Add the three entity indexes and run `npm run db:migration:create -- demand-review-indexes`. Review the generated SQL: `create index` only, no table rebuild (lesson 2026-10-23). Add an EXPLAIN test per query (captured with `onQuery`). Run `smoke.test.ts`.
3. **Service and validator.**
   - Add `demand-review.schema.ts` and `DemandReviewService.read`.
   - Service tests on a real SQLite file with migrations: each figure from documents created through the services; a goods-issue reversal; SU totals with an excluded product; the single-product units and location rows; tenant isolation (a Prod document never shows in Test); refusals (unknown or unfinished material, `offset` out of range).
   - A benchmark test at 10× the realistic counts records the timing in the PR. It asserts only a loose bound (1 s) so CI runners don't flake, and the 300 ms budget is checked on the recorded figure.
4. **Route.** Add `GET /api/tenants/[tenant]/reports/demand-review`, its `BACKWARD_COMPATIBILITY.md` entry, and its route test (repeated params, a read-only tenant, unauthenticated 401). Integration test `tests/integration/demand-review-api.test.ts`: on its own new finished product with an SU factor, create an order, a shipment, a goods issue, a reversal and a forecast through the API, then assert each figure (lesson 2026-10-22: own your records).
5. **Acceptance doc.** Set DEM-002…013 to *Partially verified* with the netting tests as evidence (MRP still runs them for real in #14), and record D08's erratum on DEM-007 (done in this spec PR, so the step only updates statuses).

### Phase 2 — Demand review screen

6. **Tokens and chart.**
   - Add the chart tokens to `globals.css` (light and dark) and the Exceptions row to the design system spec, `engineering-standards.md` and `tests/design-tokens.test.ts`; `tokens.test.ts` pins their contrast.
   - Add `StackedColumnChart` and `ChartLegend`. Component tests cover the tick maths, segment stacking and gaps, the hatch, the Today rule position, the overdue marker, the Ordered line, `<title>` texts and an empty window.
7. **Filter controls.** Add `SegmentedControl` and `FilterMultiSelect`. Tests cover:
   - native fallback before hydration;
   - search;
   - Select shown and Clear;
   - chips;
   - repeated hidden inputs;
   - keyboard (arrows, Space, Escape);
   - `aria-multiselectable`.
8. **Screen.**
   - The page (`connection()` and `Suspense`, `orNotFound` for unknown references, as the stock report does).
   - `components/reports/demand-review-*` with the filter form, the unit rule line, the excluded callout, the chart card with Earlier/Later, and the grid (sticky column, tinted past, current rule, disclosure rows, total, scroll-to-current).
   - EN/PL messages, the nav entry (`nav-tree.ts` Sales group, `ICONS` → `ChartColumnStackedIcon`) and the help topic. The menu-shape tests change: `nav-items.test.ts`, `nav-tree.test.ts`, `sidebar-nav.test.tsx` and `tests/integration/navigation.test.ts`. Add the UI route's `BACKWARD_COMPATIBILITY.md` entry.
   - Page and component tests for every state in Edge Cases.
9. **Integration and QA.** `tests/integration/demand-review.test.ts`, on the tiny Test dataset the server starts with. It has the same ten finished products and their SU factors (#239). Only `test-reset-realistic.test.ts` may switch Test to realistic (lesson 2026-10-22), and figures are asserted by the API test of step 4.
   - open the page;
   - switch Day/Week/Month;
   - select two products → only SU is enabled;
   - select one → pallet is enabled and the chart is titled in pallets;
   - expand a grid row;
   - go Earlier and Later.

   Also run `tests/integration/navigation.test.ts`.

   Then QA screenshots on the realistic dataset (a local dev server reset by hand) at 1440 px, light and dark, and 390 px, posted on the PR.

## Implementation notes

Phase 1 shipped on PR #244 (`.ai/pipeline/runs/2026-10-25--1026UTC-demand-review.md`). It differs from the text above in three places, all reviewed on the PR:

- **Shipped is read from the goods-issue stock movements**, not from `GoodsIssueLine` joined to its issue (Definitions, step 2 of the service). Each goods-issue line posts exactly one movement of its base quantity, out of its order's location, on the issue's business date, so the figures are the same. At 10× the realistic dataset, SQLite with no statistics planned the four-way join from the line table's tenant index, and the month read took 814 ms. A reversed line is found through its `StockReversal` link, reading only the window's reversed movements rather than every issue's movements.
- **Indexes:** `stock_movement(tenant, type, business_date)` replaces `goods_issue(tenant, business_date)`. The other two are as specified. Every window read is a partial load (`fields`). Timings at 10×, fastest of three reads in an isolated run: day 52 ms, week 95 ms, month 158 ms. Under a parallel coverage run the month read took 815 ms, so the benchmark's CI bound is 3 s rather than 1 s.
- **Validator:** a repeated `material` or `location` value is counted once rather than refused, and the cap of 500 applies after that.

Forecasts are read from the later of today's month and the window's first month: with a positive offset, earlier months' residuals would land before the window.

Phase 2 shipped on its own PR, stacked on #244. It differs from the text above in these places:

- **The Unit control** is a `SegmentedControl` like the time bucket, with the disabled units shown as disabled segments. The spec doesn't name the control.
- **The grid's sums** (each row's Total, the Total row for product rows) are added in `bigint` on the server (`components/reports/demand-review-view.ts`). The client grid receives display texts only, so no float sum ever reaches the screen. For location rows, each cell and the Total row's cells come from the API, which converts the summed base figure once. Each row's Total column, though, adds that row's converted cells, as for product rows. Across a window the two can differ by at most 0.000001 per cell, which the one-decimal display never shows.
- **Bucket labels:** weeks are `W44` on the axis and `W44 · Oct 26` in the tooltip, days `Oct 26`, months `Nov`, with the year on the first month and on January. All follow the reader's locale; Polish weeks are `T44`.
- **The header line** uses the spec's "Last {back} … · this {bucket} and the next {ahead}" only at offset 0, with the numbers taken from `DEMAND_WINDOWS`. Once Earlier or Later moved the window it reads "In this window: … shipped · … still to ship", because "last 13 weeks" would be untrue, and today's bucket's shipped then counts too.
- **Earlier and Later** change only the address's search params, which don't remount a page in Next 16, so the grid is keyed by the window's first day: it starts afresh, rows closed and scrolled to today.
- **A refused product** (only an edited address can name one that isn't finished) is explained above the form, through `ErrorSummary`, and the review is read without the product filter. A malformed address or an unknown record is the not-found state, as on the stock report.
- **On a phone** the grid's row names wrap at word boundaries inside a bounded sticky column. The chart scrolls sideways from the start of the window; a mobile layout stays out of scope.
- **The overdue marker** has a surface-coloured halo, so the Today rule never strikes through it.

