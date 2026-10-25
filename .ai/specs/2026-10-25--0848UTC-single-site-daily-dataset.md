# The realistic Test dataset becomes one plant, five furniture types, two suppliers and daily demand

**Status:** draft. It waits for the owner's answers to the questions on #237.
**Created:** 2026-10-25 08:48 UTC
**Issue:** #237
**Amends:** `implemented/2026-10-21--0718UTC-test-tenant-dataset.md` (#126: the shape, the demand and supply model, the forecasts) and `implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md` (#163: what tiny shares with realistic, Q11 below).

## 📝 TLDR

The realistic dataset today has four plants, six suppliers, ten customers and ten finished products. Demand, production and purchasing all run on **monthly** cadences, and the forecast is twelve monthly rows per product, each dated the 1st of its month. The owner wants a dataset for **single-site planning**:

- **one plant**, Main plant, Wrocław, which makes **five furniture types** (the five composed products of today) from **shared intermediates and components**;
- the furniture is sold in **paint colour variants**: three new paints, twelve finished SKUs;
- **two suppliers**;
- **daily demand**: two years of daily history, a daily **seasonal** profile, a slight **upward trend** and **noise**. Customer orders are dated so that their lines, summed by required date, are exactly that daily demand;
- **weekly** production and purchasing runs;
- a **daily forecast** for the next twelve months.

The change stays inside the generator and its configuration file. There is no schema change, no migration, no new endpoint and no new screen.

The design below assumes the **suggested answer** to each question in "Open questions". The owner answers them on #237, and the spec is updated before implementation starts.

## Owner's requirements

Piotr12 gave these on 2026-10-25, paraphrased only to make them a list:

1. Change how the real (realistic) Test dataset is created, not the dataset the integration tests use.
2. A realistic scenario for **a single location producing five different types of furniture**, with reusable components and intermediates within them.
3. The current material/BOM situation is fine; **add a few more paint colours**.
4. Not so many locations, so the owner can focus on single-site planning.
5. **Daily demand figures, not monthly**, matching all other metrics.
6. **Two years of history**, and **demand for the next year in daily buckets**.
7. **Seasonality**, a **slight upward trend** for the business overall, and **noise**: not a perfect time series.
8. **Just two suppliers**, to keep purchasing small.
9. An issue and a spec; questions go back through the issue, with suggested answers.

## ❓ Open questions (suggested answers assumed below)

The issue comment holds the full text and the alternatives. Here they are in short:

| # | Question | Suggested answer |
|---|---|---|
| Q1 | Which five furniture types? | The five **composed** products of today: Cabinet (00000005), Office cabinet, 2 doors (00000018), Locker, 2 compartments (00000019), Locker, 4 compartments (00000020), Workshop cabinet (00000021). The five simple products (shelf unit, letterbox, tool tray, document box, key cabinet) leave the catalogue, and so does galvanised sheet, which only the letterbox used. |
| Q2 | What are the new paint colours for? | **Colour variants, painted at final assembly.** Three new paints (blue RAL 5010, white RAL 9016, anthracite RAL 7016), and 2–3 colours per type, twelve SKUs in all. The door and the side panel lose their paint line: their paint moves into the finished BOM, so all four intermediates are colour-neutral and every colour of every type shares them. |
| Q3 | Which location? | Only **00000001 Main plant, Wrocław**. It makes all four intermediates (the shelf too, which Poznań used to buy) and all twelve SKUs. The other three plants are removed, and there are no transfers. |
| Q4 | Which two suppliers sell what? | **00000001 Steel Service Centre Sp. z o.o.**: both steel sheets and the welding wire. **00000002, renamed Industrial Supplies Wholesale Sp. z o.o.**: fasteners, hinges, locks, clips, every paint, powder coat and boxes. Every material has exactly one supplier, so the hinge and lock alternation of #126 goes. |
| Q5 | Customers? | Keep all **ten**, with new weights. The online shop buys every SKU and takes a delivery every weekday. |
| Q6 | What is "daily demand" in the documents? | A daily series `D(sku, day)` is generated first. Each customer has **delivery days**: the online shop daily, the two largest B2B customers twice a week, the rest weekly. A day's demand is split over the customers delivering that day, and each gets one order per delivery day, created 2–15 working days ahead. So the order lines summed by required date equal `D`. |
| Q7 | Which days carry demand? | **Monday to Friday**, with no public holidays. The seasonal profile carries the August and December dips. |
| Q8 | Trend, seasonality and noise? | **+6 % a year**, compounding. Seasonality is a monthly profile per type, interpolated by day so a month boundary has no step, times a weekday profile. Noise has two parts: a slow weekly drift (a moving average of keyed shocks, about ±6 %) and a daily ±25 % term. On top come **2–3 one-off project orders a year** (5–10× a day's demand from one B2B customer). Volume is about **60 units a day** in all at the history start. |
| Q9 | What does the forecast look like? | One row per SKU and **weekday**, from tomorrow through the same date a year on, about 3,100 rows. Each row is the model's **expected value** (trend × season × weekday × colour mix, with no noise), rounded to whole units, with zero days omitted. |
| Q10 | How often do production and purchasing run? | **Weekly.** Each Thursday's planning run creates one production order per made pair for the next week (order-up-to), and one purchase order per supplier for the next week's receipts. |
| Q11 | What happens to tiny? | Tiny **follows the new catalogue** with its two-month history, as #163 decided (one catalogue, two history lengths). The integration assertions that name the old plants or suppliers are updated. |
| Q12 | How big may it get, and how long may a reset take? | About 8,700 documents and 14,000 movements. The caps become **12,000 / 20,000**. The realistic reset's budget is **≤ 30 s** locally, well under the proxy's 120 s; today it takes about 8 s. |
| Q13 | Where do the three alternate BOMs go, now the key cabinet is gone? | To **Office cabinet, grey**: priority 1 is the standard BOM, priority 2 uses 2 mm sheet instead of 1.0 mm, and priority 3 uses powder coat instead of wet paint. |
| Q14 | Do the realism touches of #126 stay? | **Yes**, pointed at the one plant: consumption variances, one waste posting, two safety-stock increases, one overdue top-up, three open and two converted requisitions, and export distributors ordering whole pallets. |

## 📝 Problem Statement

The realistic dataset was built for #126's brief: a four-plant network with monthly granularity, because the owner then wanted periods in months (#126 requirement 3). Two things now get in the way of the planning work it is meant to support:

- **Monthly buckets don't match the system.** Stock, customer orders, shipments, receipts and completions are all dated by the day, and MRP will net by day (D04). Monthly forecasts, each dated the 1st of its month, put a month's demand on one day, and the history has one order per customer and month with required dates bunched in a shipping band. Nothing in it looks like daily demand.
- **Four plants hide the single-site problem.** Specialised plants with no transfers are four small independent planning problems. A planner who wants one site's material plan sees a quarter of the business, and six suppliers add purchasing noise.

## 📝 Proposed Solution

The generator keeps its architecture: a pure function of the configuration and today's date, a replay that proves balances stay non-negative, and a seeder that writes through the services' `seedDemo` paths (spec #126, "Proposed Solution"). What changes:

1. **The configuration file** describes the new business: one plant, two suppliers, the reduced catalogue with colour variants, and the daily demand parameters (see "The configuration").
2. **`demand-plan.ts` becomes daily.** It generates `D(sku, day)` for every weekday from the history start to the end of the forecast horizon, and turns the history and the next few weeks into customer orders by delivery day.
3. **`supply-plan.ts` becomes weekly.** It keeps the same order-up-to model, with a week as the bucket instead of a month.
4. **`planForecasts` emits daily rows**: the model's expected value per SKU and weekday.
5. **`timeline.ts`** places documents by week and day. Today's open and partial documents follow the same rules as now, with one plant.

**Alternatives considered:**

- **Keep monthly buckets and spread each forecast over the month's days.** Rejected. The history would still be monthly, and requirement 5 asks for daily demand everywhere.
- **Daily demand drawn independently per customer**, with orders being whatever falls out. Rejected. The daily totals would not be a controlled series, so the trend and seasonality would only show statistically. Generating the total first and splitting it keeps the series exact (Q6).
- **A separate generator for realistic, leaving tiny on the old one.** Rejected by default (Q11). It means two catalogues and two demand models to maintain, the thing #163 Q1 avoided.

**Market check.** Demand-planning demo sets (the M5 competition's Walmart data, SAP IBP and Kinaxis sample models, the Odoo MRP demo) work with daily or weekly history: trend times seasonality times a day-of-week profile, with noise and occasional promotional or project spikes. They plan supply in weekly buckets. This design follows that shape. Skipped: promotions with price effects, which need prices the product doesn't have (N01).

## 📝 The dataset

### The business

A furniture maker in Wrocław. It builds steel cabinets and lockers from four in-house intermediates and paints each item in the customer's colour at final assembly. It buys steel from one supplier and everything else from one wholesaler. IDs are the sequence the seed produces on a fresh generation. Where an ID keeps its old meaning, the tests that pin it keep working (#126 Q9).

**Location (1):** 00000001 Main plant, Wrocław.

**Suppliers (2):**
- 00000001 Steel Service Centre Sp. z o.o.: steel sheet 2 mm, steel sheet 1.0 mm, welding wire.
- 00000002 Industrial Supplies Wholesale Sp. z o.o. (renamed from Fasteners Wholesale): bolts, hinges, cam locks, clips, the five paints, powder coat, cardboard boxes.

**Customers (10):** the same names and IDs as today. The online shop (00000003) buys every SKU. The rest buy the types that fit them: schools, the gym chain and the hospital buy lockers; office interiors buys office cabinets; the hardware chain and construction wholesale buy workshop and red cabinets; the export distributors (00000004, 00000010) buy a mix in whole pallets.

### Materials (30: 14 raw, 4 intermediate, 12 finished)

IDs 00000001–00000021 keep their materials, with one exception: 00000013 (galvanised sheet) becomes the first new paint, so no later ID shifts. Descriptions change only where the colour now belongs to the SKU.

| ID | Type | Description | Base | Notes |
|---|---|---|---|---|
| 00000001 | raw | Steel sheet 2 mm | kg | supplier 1 |
| 00000002 | raw | Bolt M8 | each | supplier 2 |
| 00000003 | raw | Paint, red | l | supplier 2 |
| 00000004 | intermediate | Side panel, primed | each | was "Painted side panel"; its paint moves to the cabinets |
| 00000005 | finished | Cabinet, red | each | pallet = 20 |
| 00000006 | raw | Cardboard box | each | supplier 2 |
| 00000007 | raw | Steel sheet 1.0 mm | kg | supplier 1 |
| 00000008 | raw | Paint, grey | l | supplier 2 |
| 00000009 | raw | Powder coat, grey RAL 7035 | kg | supplier 2 |
| 00000010 | raw | Hinge, steel | each | supplier 2 |
| 00000011 | raw | Cam lock with two keys | each | supplier 2 |
| 00000012 | raw | Shelf support clip | each | supplier 2 |
| 00000013 | raw | **Paint, blue RAL 5010** | l | new; supplier 2 |
| 00000014 | raw | Welding wire 0.8 mm | kg | supplier 1 |
| 00000015 | intermediate | Door, assembled | each | unpainted now |
| 00000016 | intermediate | Locker frame, welded | each | powder-coated grey, as now |
| 00000017 | intermediate | Shelf, powder-coated | each | made at Wrocław only |
| 00000018 | finished | Office cabinet, grey, 2 doors | each | pallet = 12; three BOMs (Q13) |
| 00000019 | finished | Locker, 2 compartments, grey | each | pallet = 8 |
| 00000020 | finished | Locker, 4 compartments, grey | each | pallet = 8 |
| 00000021 | finished | Workshop cabinet, grey | each | pallet = 10 |
| 00000022 | raw | **Paint, white RAL 9016** | l | new; supplier 2 |
| 00000023 | raw | **Paint, anthracite RAL 7016** | l | new; supplier 2 |
| 00000024 | finished | Cabinet, blue | each | pallet = 20 |
| 00000025 | finished | Cabinet, white | each | pallet = 20 |
| 00000026 | finished | Office cabinet, white, 2 doors | each | pallet = 12 |
| 00000027 | finished | Office cabinet, anthracite, 2 doors | each | pallet = 12 |
| 00000028 | finished | Locker, 2 compartments, blue | each | pallet = 8 |
| 00000029 | finished | Locker, 4 compartments, blue | each | pallet = 8 |
| 00000030 | finished | Workshop cabinet, red | each | pallet = 10 |

The new paints take red and grey's conversion (ml) and buy values (lead time 10 days, minimum 20 l, multiple 5 l). Every other material keeps today's conversions and buy values.

### BOMs (16)

The intermediates keep today's recipes, minus the paint lines (side panel: 4.5 kg steel 2 mm; door: 3.2 kg steel 1.0 mm, 2 hinges, 1 cam lock). The frame and the shelf are unchanged. A finished SKU's BOM is its type's BOM plus **one paint line in its colour**. That line holds today's paint quantity for the type plus what its doors and panels used to carry: cabinet 1,000 ml + 150 ml; office cabinet 400 ml + 300 ml; locker 2 300 ml; locker 4 600 ml; workshop cabinet 600 ml + 300 ml. So the four intermediates, both sheets, bolts, hinges, locks, clips and boxes are shared by every SKU, and only the paint line separates the colours of a type.

That gives 4 intermediate BOMs and 12 finished ones. Office cabinet, grey gets two more (Q13): priority 2 is 2 mm sheet instead of 1.0 mm (5 % heavier), and priority 3 is powder coat (0.5 kg) instead of the grey paint line. That makes **18 BOMs**. History production uses priority 1 only.

### Demand

`D(sku, day)` for every weekday `day`, in whole base units:

```
D = round( base(type) × mix(sku) × season(type, day) × weekday(day) × trend(day) × drift(type, week) × (1 + ε(sku, day)) ) + project(sku, day)
```

- `base(type)`: units per weekday at the history start. Cabinet 16, office cabinet 12, locker 2 15, locker 4 10, workshop cabinet 7, about 60 in all.
- `mix(sku)`: the colour shares within the type, summing to 1. Cabinet red 0.5, blue 0.25, white 0.25; office grey 0.5, white 0.3, anthracite 0.2; locker 2 grey 0.7, blue 0.3; locker 4 grey 0.7, blue 0.3; workshop grey 0.75, red 0.25.
- `season(type, day)`: a 12-value monthly profile per type, read as each month's mid-point value and interpolated linearly by day. Cabinet: flat with a December dip. Office: budget peaks in March and October. Lockers: the back-to-school peak of today's `backToSchool` profile. Workshop: today's `spring` profile. Every profile has August at 0.85 and December at 0.75 (holidays).
- `weekday(day)`: Monday 1.10, Tuesday 1.05, Wednesday 1.00, Thursday 0.95, Friday 0.90.
- `trend(day) = 1.06 ^ (yearsSinceHistoryStart)`.
- `drift(type, week)`: a slow factor around 1, `1 + Σ_{i=0..7} 0.7^i · η(type, week − i) / norm`, with `η` uniform keyed by (seed, ISO week, type) and scaled to about ±6 %. It is a moving average of keyed shocks, not a recursion, so a week's value doesn't depend on where the history starts.
- `ε(sku, day)`: uniform in ±0.25, keyed by (seed, date, sku).
- `project(sku, day)`: 2–3 days a year, chosen by keyed draws, on which one B2B customer orders 5–10 days' demand of one SKU (a school fit-out before September, an office refurbishment). These are listed in the configuration, so they are deterministic and easy to strike.

Every random draw is keyed by its date or week rather than by its position in a sequence. A day's figure therefore doesn't depend on the day the dataset is generated.

**Customer orders (Q6).** Each customer has delivery weekdays (online shop: Monday to Friday; 00000001 and 00000002: Tuesday and Thursday; the rest one weekday each, spread over the week) and an order lead of 2–15 working days (online shop 2, the rest 5–15). On each weekday, each SKU's `D` is split over the customers that buy it and deliver that day, by their weights. The split is in whole units and sums exactly; the export distributors get whole pallets, so their share can differ from the exact split by under one pallet. Each customer delivering that day gets **one order**: one line per SKU it buys that has a non-zero share, required on that day, created its lead time earlier. Every ninth order ships in two, as today. Project days add a separate order. The sum of order lines by required date is the daily demand, apart from the export distributors' pallet rounding. A unit test pins this.

### Supply (weekly)

The stock model and its proofs are today's, with a week as the bucket:

- **Safety stock**: finished goods cover 3 weekdays of average demand, intermediates 2 days of average use, and raw materials lead time × average daily consumption × 1.2. Each target is rounded up to the lot multiple, and is at least one multiple. The two later increases stay, re-pointed at locker 2 grey and cabinet blue.
- **Production**: at each Thursday's planning run, one production order per made pair whose projected stock falls below next week's need plus safety. The quantity is order-up-to, rounded to the lot, at least the minimum lot. Intermediates finish Monday–Tuesday and finished goods Wednesday–Thursday of the week they are made in, and they cover the following week's shipments.
- **Purchasing**: at the same planning run, one purchase order per supplier and week holds every raw material that needs replenishing. It is planned for the next week's Monday (steel) or Tuesday (supplies) and received in full on that day. Lead times stay planning parameters (as in #126).
- **Order within a week**: receipts Monday–Tuesday, intermediate completions Monday–Tuesday after the receipts, finished completions Wednesday–Thursday. Shipments run every weekday from the stock the previous week built. `replay.ts` proves no balance goes negative on any day of the window.
- **Make pairs: 16** (4 intermediates, 12 SKUs). **Buy pairs: 14**, one per raw material. All of them are at 00000001, and each has planning parameters, a safety-stock target and an opening balance.

### Today: what is open

The rules of #126 "Today: what is open" are kept, with one plant. So there is exactly one of each partial document: a partially shipped order, an open shipment, a partially received purchase order and a partially completed production order (whenever one is in progress). There is also one overdue top-up purchase order, three open requisitions and two converted ones, all at 00000001. Customer orders created before today but due later are open, which gives 2–15 working days of visible open demand.

### Forecasts (about 3,100 rows)

There is one row per SKU at 00000001 for every weekday from tomorrow through the same calendar date twelve months on, rounded half-up to whole units. Rows that round to 0 are omitted. The quantity is the model's expected value, `base × mix × season × weekday × trend`, with no drift, noise or projects. That is a perfect forecast of the generator's mean, and the history's noise shows up as forecast error once those days become history (Q9). No forecast carries a customer (DEM-001). The forecast overlaps the open customer orders of the next weeks, which the slice 3 netting consumes (DEM-007, D04).

### Volumes (estimates, refined by the generator)

The history runs from the 1st of the month 24 months ago to yesterday, about 540 weekdays:

| Kind | About |
|---|---|
| Customer orders / lines | 1,800 / 5,000 |
| Shipments and goods issues | 2,000 each |
| Production orders and completions | 1,250 each |
| Purchase orders / receipts | 220 / 220 |
| Stock movements | 14,000 |
| Forecasts | 3,100 |
| Masters | 30 materials, 18 BOMs, 30 planning parameter sets, 32 safety-stock targets (30 plus the two later increases), 1 location, 10 customers, 2 suppliers |

Tiny (two months) comes to about 700 documents and 1,100 movements, plus the same 3,100 forecasts.

## 📝 The configuration

`test-tenant-config.json` keeps its sections and its Zod schema, with these changes:

| Key | Change |
|---|---|
| `horizon` | `historyMonths: 24` stays. `forecastMonths: 12` now means "daily rows through the same date twelve months on". |
| `shape` | `locations: 1`, `suppliers: 2`, `rawMaterials: 14`, `intermediates: 4`. `finishedProducts` becomes `{ types: 5, skus: 12 }`. `alternateBoms: { product: "00000018", count: 3 }`. |
| `limits` | `documents: 12000`, `movements: 20000` (Q12). |
| `demand` | `growthPerYear: "0.06"` (compounding), `noise: "0.25"`, plus new keys: `drift { weeks: 8, decay: "0.7", amplitude: "0.06" }`, `weekday` (5 factors), `seasonality` (named profiles, read at mid-month and interpolated), `types[] { name, products[], baseDaily, profile }`, `products[] { material, type, mix, enteredIn }`, `customers[] { customer, deliveryDays[], leadWorkingDays, wholePacks, shares }` and `projects[] { customer, material, month, days }`. The monthly `monthlyBase` key goes. |
| `supply` | `safetyStock` coverage is stated in **days** (`finishedDays: 3`, `intermediateDays: 2`, `rawLeadTimeFactor: "1.2"`). `planningWeekday: 4` (Thursday) is new. The `waste`, `topUps` and `requisitions` entries name location 00000001 only. |
| `catalogue` | The lists above. `purchasedIntermediates` is empty. |

The schema's cross-checks follow: the shape matches the catalogue, every SKU belongs to exactly one type, the mixes of a type sum to 1, every customer's delivery days are weekdays, and every raw material has exactly one supplier.

## 📝 API Contracts

No change. `POST /api/tenants/test/reset` keeps its contract, `dataset` included (BACKWARD_COMPATIBILITY.md §4). Only what it writes, and how long that takes, change.

## 📝 UI/UX

No new screen. What changes is what Test shows:

- **Forecasts**: about 3,100 daily rows on a paged list (the forecast list already pages, spec `implemented/2026-10-21--2036UTC-forecast-paging-e08-proofs.md`).
- **Location pickers**: one entry, and supplier pickers two.
- **Stock report and ledgers**: daily movement on every weekday.

The reset dialog's "takes longer" note on Realistic stays true.

## 📝 Edge Cases & Failure Scenarios

| Case | Behaviour |
|---|---|
| Today is a weekend day | No demand, shipment, receipt or completion is dated on a weekend. Today's partial documents still use today's date, as a user would (as #126). The forecast starts on the next weekday. |
| Today is Thursday, the planning day | Next week's production and purchase orders are created today and are open. Before today, the previous week's are mostly received or completed. |
| Today is the 1st of a month | Nothing special: the buckets are days and weeks, and only the history start is month-aligned. |
| A project day falls in the open window | It shows as one unusually large open order, which is realistic. A unit test checks the window over every day of a year (lesson of 2026-10-21) and asserts only properties that always hold. |
| The colour mix gives a SKU 0 units on a day | No line for it that day. Low-volume SKUs (workshop red, about 1.75 a day) have intermittent demand, which is realistic, and the forecast omits days that round to 0. |
| A configuration drives a balance negative or exceeds `limits` | `generateTestTenantDataset` throws, the unit tests catch it, and at runtime the seed fails closed (as #126). |

## 📝 Risks & Impact Review

- **Seed duration.** The volume more than doubles (about 8,700 documents against 3,550), and the reset blocks other requests while it writes, yielding between documents (lesson of 2026-10-24). Expect 15–20 s locally against today's 7.6 s, under a ≤ 30 s budget and well under the proxy's 120 s. Measure it at the end of the generator phase, before the tests are rebased on it. The levers, in order: forecasts seeded with one material and one location lookup instead of one per row (`ForecastService.seedDemo` resolves both per row today, 6,200 lookups); then production every other week for the low-volume SKUs; then the shape, which is the owner's call.
- **Unit test time.** The replay tests generate the dataset for every day of a window (lesson of 2026-10-21). Two years of daily data per generation multiplies their cost. Keep the per-anchor plan cache, and run the full-window property checks on tiny's horizon with one full realistic generation.
- **Tiny grows** to about 700 documents plus 3,100 forecasts, against about 550 today. The startup seed is still a few seconds. If forecasts dominate, tiny gets `forecastMonths: 3` (a one-line `test-datasets.ts` override, like its `historyMonths`).
- **Test churn.** The tests that name the old plants, suppliers or simple products change: `named-records.test.ts` (the last location and supplier), `named-records-api.test.ts` (unchanged first names), the material and location filters in the two `planning-parameters` tests (`<= "00000026"` / `<= "00000004"`), `purchasing.test.ts` (unchanged first rows), `supply-plan.test.ts`, `demand-plan.test.ts`, `test-tenant-config.schema.test.ts`, and the forecast tests that count monthly rows. IDs 00000001–00000021 keep their meaning except 00000013 and 00000004's description, which limits the churn (#126 Q9).
- **Existing deployments** keep their Test data until the admin resets Test, as with #126.
- **Not a protected surface.** No schema, route, config contract or command changes.

## 📝 Decisions in play

- **D04**: the dataset adds data, not features. Daily forecasts use the existing per-day `Forecast` entity.
- **D06**: the reset regenerates the dataset, and the seeder writes through the services.
- **R02/R04**: the catalogue keeps the type rules (no finished component, no cycles) and gives the three office-cabinet BOMs distinct priorities.
- **R09**: non-negative stock is proven by the replay on every day.
- **N04/N06**: no calendars, capacities or source lists are introduced. Weekdays-only and the weekly planning day are generator choices.

## 📋 Implementation Plan

### Phase 1 — Configuration and daily demand

1. The `test-tenant-config.json` and schema changes from "The configuration", with a test for each new cross-check.
2. `calendar.ts`: ISO weeks, the weekday index and the mid-month interpolation weight. `random.ts`: keyed draws by date and by week.
3. `demand-plan.ts`: `dailyDemand`, the delivery-day split and the customer orders. Tests: the sum of lines by required date equals `D`, apart from the export distributors' pallet rounding; the yearly totals rise by about 6 %; the seasonal shape shows in the monthly totals; adjacent days differ (noise); the same `today` gives the same output.

### Phase 2 — Weekly supply, forecasts and timeline

4. `supply-plan.ts`: weekly order-up-to, daily safety coverage and a single plant. Tests: lot rounding, explosion over shared intermediates, and safety coverage.
5. `planForecasts`: daily expected values with zero days omitted. Tests: row count, weekdays only, no noise.
6. `timeline.ts` and `generate-dataset.ts`: the week and day bands, today's documents and the volumes. `replay.ts` proves non-negative balances and the limits. **Measure the realistic seed here** (spike) and record it in the run log.

### Phase 3 — Seeder, tests and paperwork

7. `ForecastService.seedDemo` resolves materials and locations once, if Phase 2's measurement needs it.
8. Update the unit and integration tests in "Test churn". Run the touched integration files and `test-reset-realistic.test.ts`.
9. Paperwork: the help topic and messages if they describe four plants (grep `Poznań`, `Łódź`, `Gdańsk`); the amended specs' headers; this spec's implementation notes; move this spec to `implemented/`.

## ✅ Acceptance criteria

- [ ] A realistic reset writes one location, two suppliers, ten customers, 30 materials (12 finished in five types, four intermediates, fourteen raw including five paints) and 18 BOMs.
- [ ] Customer-order lines summed by required date give a non-zero daily figure on most weekdays for the high-volume SKUs, over two years. The yearly total grows by about 6 %, the monthly totals show each type's season, and no two consecutive weeks are identical.
- [ ] Forecast rows exist per SKU for the weekdays of the next twelve months, with daily dates and none on weekends.
- [ ] Production and purchase orders run weekly, two suppliers in all. No balance goes negative on any day (replay).
- [ ] Tiny uses the same masters with a two-month history, and the integration suite passes on it.
- [ ] The realistic reset finishes within the measured budget (≤ 30 s locally), recorded in the run log.
- [ ] 100 % coverage, lint, typecheck and build pass.
