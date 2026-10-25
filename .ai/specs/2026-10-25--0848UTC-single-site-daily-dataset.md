# The realistic Test dataset becomes one plant, five furniture types, two suppliers and daily demand

**Status:** ready. The owner answered Q1–Q14 on #237 on 2026-10-25.
**Created:** 2026-10-25 08:48 UTC
**Issue:** #237. It stays open to track the implementation.
**Amends:** `implemented/2026-10-21--0718UTC-test-tenant-dataset.md` (#126: the shape, the demand and supply model, the forecasts) and `implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md` (#163: what tiny shares with realistic, Q11 below).

## 📝 TLDR

The realistic dataset today has four plants, six suppliers, ten customers and ten finished products, and demand, production and purchasing all run on **monthly** cadences. The forecast is twelve monthly rows per product, each dated the 1st of its month. The owner wants a dataset for **single-site planning**:

- **one plant**, Main plant, Wrocław, making **five furniture types** (the five composed products of today) from **shared intermediates and components**;
- the furniture sold in **paint colour variants**: three new paints, twelve finished SKUs;
- **two suppliers**;
- **four customers**:
  - the online shop buys every SKU and grows about **10 % a quarter**;
  - the hardware chain **declines slightly**;
  - two distributors buy the rest;
- **daily demand**: two years of daily history, a seasonal profile, **+10 % a year** for the business as a whole, and noise;
- **weekly** production and purchasing runs;
- a **daily forecast** for the next twelve months.

The change stays inside the generator and its configuration file. There is no schema change, no migration, no new endpoint and no new screen.

## Owner's requirements

Piotr12 gave these on 2026-10-25, in the session that opened #237 and in the answers on it. They are paraphrased only to make them a list:

1. Change how the real (realistic) Test dataset is created, not the dataset the integration tests use.
2. A realistic scenario for **a single location producing five different types of furniture**, with reusable components and intermediates within them.
3. The current material/BOM situation is fine; **add a few more paint colours**.
4. Not so many locations, so the owner can focus on single-site planning.
5. **Daily demand figures, not monthly**, matching all other metrics.
6. **Two years of history**, and **demand for the next year in daily buckets**.
7. **Seasonality**, an **upward trend** for the business overall, and **noise**: not a perfect time series. The overall growth is **10 % a year** (Q8 answer).
8. **Just two suppliers**, to keep purchasing small.
9. **Four customers**: one buys everything, the others buy some. One grows noticeably, roughly **10 % every quarter**, and one **decreases slightly**. The history must show both (Q5 answer).
10. An issue and a spec, with the questions answered on the issue. **#237 stays open** to track the implementation.

## ✅ Decisions (owner's answers on #237, 2026-10-25)

The questions, the alternatives and the suggested answers are in the [questions comment](https://github.com/Piotr12/CPG/issues/237#issuecomment-6395615225), and the owner's answers are in the [reply](https://github.com/Piotr12/CPG/issues/237#issuecomment-6395663217). "As suggested" means the owner accepted the suggested answer.

| # | Question | Decision |
|---|---|---|
| Q1 | Which five furniture types? | As suggested. Cabinet (00000005), Office cabinet, 2 doors (00000018), Locker, 2 compartments (00000019), Locker, 4 compartments (00000020) and Workshop cabinet (00000021). The five simple products leave the catalogue, and so does galvanised sheet. |
| Q2 | What are the new paint colours for? | As suggested. **Colour variants, painted at final assembly**: blue RAL 5010, white RAL 9016 and anthracite RAL 7016, twelve SKUs. The door and the side panel lose their paint, so the four intermediates are colour-neutral and shared. |
| Q3 | Which location? | As suggested. Only **00000001 Main plant, Wrocław**, and no transfers. |
| Q4 | Which two suppliers sell what? | As suggested. **00000001 Steel Service Centre** sells steel and welding wire. **00000002 Industrial Supplies Wholesale** (renamed) sells everything else. One supplier per material. |
| Q5 | Customers? | **Owner's answer: four customers.** One buys every SKU, the others buy some. One grows about 10 % a quarter and one declines slightly. See "Customers" for the cast. |
| Q6 | How does daily demand show up in the documents? | As suggested, adjusted for Q5. A daily series `D(sku, day)` is generated first. Each customer gets a **stream**, its time-varying share of `D`, and the streams sum to `D` exactly on every day. The online shop orders its stream every weekday. Each B2B customer orders, on its delivery day, its stream up to its next delivery. ⚠ Changed from the suggestion "lines summed by required date equal `D`": with a customer whose share grows by 10 % a quarter, the share must apply to the whole stream, not only to the days the customer is delivered. So the equality holds per customer and delivery period (and every day for the online shop), not for every day's B2B lumps. See "Customer orders". |
| Q7 | Which days carry demand? | As suggested. Monday to Friday, with no public holidays. |
| Q8 | Trend, seasonality and noise? | As suggested, with the **trend at +10 % a year** (owner's answer). Seasonality is a per-type monthly profile interpolated by day, times a weekday profile. Noise is a weekly drift of about ±6 % and ±25 % from day to day, plus 2–3 project orders a year. About 60 units a day at the history start. |
| Q9 | What does the forecast look like? | As suggested. One row per SKU and weekday for the next twelve months, the model's expected value, with zero days omitted. |
| Q10 | How often do production and purchasing run? | As suggested. Weekly, at Thursday's planning run. |
| Q11 | What happens to tiny? | As suggested. Tiny follows the new catalogue with its two-month history. |
| Q12 | How big may it get, and how long may a reset take? | As suggested. The caps are **12,000 documents / 20,000 movements** and the realistic reset's budget is **≤ 30 s** locally. Four customers instead of ten bring the estimate down to about 6,100 documents and 15,000 movements. |
| Q13 | Where do the alternate BOMs go? | As suggested. **Office cabinet, grey** gets three BOMs: standard, 2 mm sheet, and powder coat. |
| Q14 | Do the realism touches of #126 stay? | As suggested, at the one plant. There is only one export distributor now, and it orders whole pallets. |

## 📝 Problem Statement

The realistic dataset was built for #126's brief: a four-plant network with monthly granularity, because the owner then wanted periods in months (#126 requirement 3). Two things now get in the way of the planning work it is meant to support:

- **Monthly buckets don't match the system.** Stock, customer orders, shipments, receipts and completions are all dated by the day, and MRP will net by day (D04). A monthly forecast dated the 1st puts a month's demand on one day. The history has one order per customer and month, with required dates bunched in a shipping band. Nothing in it looks like daily demand.
- **Four plants hide the single-site problem.** Specialised plants with no transfers are four small independent planning problems. A planner who wants one site's material plan sees a quarter of the business. Six suppliers and ten customers add noise without adding a planning question.

## 📝 Proposed Solution

The generator keeps its architecture: a pure function of the configuration and today's date, a replay that proves balances stay non-negative, and a seeder that writes through the services' `seedDemo` paths (spec #126, "Proposed Solution"). What changes:

1. **The configuration file** describes the new business: one plant, two suppliers, four customers, the reduced catalogue with colour variants, and the daily demand parameters. See "The configuration".
2. **`demand-plan.ts` becomes daily.** It generates `D(sku, day)` for every weekday from the history start to the end of the forecast horizon. It splits `D` into the customers' streams and cuts customer orders from them.
3. **`supply-plan.ts` becomes weekly.** The order-up-to model stays, with a week as the bucket instead of a month.
4. **`planForecasts` emits daily rows**: the model's expected value per SKU and weekday.
5. **`timeline.ts`** places documents by week and day. Today's open and partial documents follow the same rules as now, with one plant.

**Alternatives considered:**

- **Keep monthly buckets and spread each forecast over its month's days.** Rejected. The history would still be monthly, and requirement 5 asks for daily demand everywhere.
- **Split each day's `D` only over the customers delivered that day** (the original Q6 suggestion). Rejected, because a weekly customer's share would apply to one day in five. Its volume would then depend on which other customers share its delivery day, and the 10 %-a-quarter and declining trends (requirement 9) could not be stated exactly.
- **A separate generator for realistic, leaving tiny on the old one.** Rejected (Q11). It means two catalogues and two demand models to maintain, the thing #163 Q1 avoided.

**Market check.** Demand-planning demo sets (the M5 competition's Walmart data, SAP IBP and Kinaxis sample models, the Odoo MRP demo) work with daily or weekly history: trend times seasonality times a day-of-week profile, with noise and occasional promotional or project spikes. Supply runs in weekly buckets. B2B customers in them order in lumps on fixed delivery days, while a web channel orders daily. This design follows that shape. Skipped: promotions with price effects, which need prices the product doesn't have (N01).

## 📝 The dataset

### The business

A furniture maker in Wrocław. It builds steel cabinets and lockers from four in-house intermediates and paints each item in the customer's colour at final assembly. It buys steel from one supplier and everything else from one wholesaler. Its growth comes from its own web shop, while its oldest retail customer slowly shrinks. IDs are the sequence the seed produces on a fresh generation. Where an ID keeps its old meaning, the tests that pin it keep working (#126 Q9).

**Location (1):** 00000001 Main plant, Wrocław.

**Suppliers (2):**

- 00000001 Steel Service Centre Sp. z o.o.: steel sheet 2 mm, steel sheet 1.0 mm, welding wire.
- 00000002 Industrial Supplies Wholesale Sp. z o.o. (renamed from Fasteners Wholesale): bolts, hinges, cam locks, clips, the five paints, powder coat, cardboard boxes.

### Customers (4)

IDs 00000001–00000004 keep their names. Customers 00000005–00000010 are removed.

| ID | Name | Buys | Delivery days, order lead | Trend |
|---|---|---|---|---|
| 00000001 | Hardware Store Chain Sp. z o.o. | the cabinets (3 colours) and workshop cabinets (2): 5 SKUs | Tuesday and Thursday; 5 working days | **declining**: −1.5 % a quarter in volume (about −6 % a year) |
| 00000002 | Office Interiors S.A. | office cabinets (3), lockers (4), cabinet white: 8 SKUs | Wednesday; 10 working days | takes the remainder (see below) |
| 00000003 | Online shop (direct sales) | **every SKU**: 12 | every weekday; 2 working days | **growing**: +10 % a quarter in volume (about +46 % a year) |
| 00000004 | Export distributor (DE) | cabinet red and blue, office cabinet grey, locker 2 and locker 4 grey, workshop grey and red: 7 SKUs, **in whole pallets** | Monday; 15 working days | takes the remainder |

Every SKU has the online shop and at least one of the two remainder customers among its buyers.

**Shares over time.** Let `q` be the quarters since the history start, a fraction. For each SKU:

- The online shop's share is `s₃(sku) × (1.10 / 1.10^¼)^q`.
- The hardware chain's share is `s₁(sku) × (0.985 / 1.10^¼)^q`.
- Office Interiors and the export distributor split the remainder, `1 − share₃ − share₁`, by fixed weights.

Because the business grows `1.10^¼` a quarter, the online shop's **volume** grows exactly 10 % a quarter in expectation, and the hardware chain's falls exactly 1.5 %.

Starting shares are configured per SKU: the online shop 0.15 on every SKU, and the hardware chain 0.45 on the cabinets and workshop cabinets. The schema checks that the remainder stays ≥ 0.2 for every SKU on every day up to the end of the forecast horizon, which is about 12 quarters. At that point the online shop holds about 0.35 of each SKU and the hardware chain about 0.28 of its SKUs.

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

The new paints take red and grey's conversion (ml) and buy values: lead time 10 days, minimum 20 l, multiple 5 l. Every other material keeps today's conversions and buy values.

### BOMs (18)

The intermediates keep today's recipes, minus the paint lines:

- Side panel: 4.5 kg steel 2 mm.
- Door: 3.2 kg steel 1.0 mm, 2 hinges, 1 cam lock.
- The frame and the shelf are unchanged.

A finished SKU's BOM is its type's BOM with **one paint line in its colour**. That line holds the type's own paint plus what its doors and panels used to carry:

| Type | Paint line |
|---|---|
| Cabinet | 1,150 ml (4 panels × 250 ml + 1 door × 150 ml) |
| Office cabinet | 700 ml (400 ml + 2 doors × 150 ml) |
| Locker 2 | 300 ml (2 doors) |
| Locker 4 | 600 ml (4 doors) |
| Workshop cabinet | 900 ml (600 ml + 2 doors × 150 ml) |

Every SKU shares the four intermediates, both sheets, the bolts, hinges, locks, clips and boxes. Only the paint line separates the colours of a type.

That gives 4 intermediate BOMs and 12 finished ones. Office cabinet, grey gets two more (Q13): priority 2 uses 2 mm sheet instead of 1.0 mm (5 % heavier by weight), and priority 3 uses powder coat (0.5 kg) instead of the grey paint line. So there are **18 BOMs**. History production uses priority 1 only.

### Demand

`D(sku, day)` for every weekday `day`, in whole base units:

```
D = round( base(type) × mix(sku) × season(type, day) × weekday(day) × trend(day) × drift(type, week) × (1 + ε(sku, day)) )
```

- `base(type)`: units per weekday at the history start. Cabinet 16, office cabinet 12, locker 2 15, locker 4 10, workshop cabinet 7: about 60 in all.
- `mix(sku)`: the colour shares within a type, summing to 1. Cabinet red 0.5, blue 0.25, white 0.25. Office grey 0.5, white 0.3, anthracite 0.2. Locker 2 grey 0.7, blue 0.3. Locker 4 grey 0.7, blue 0.3. Workshop grey 0.75, red 0.25.
- `season(type, day)`: a 12-value monthly profile per type, read as each month's mid-point value and interpolated linearly by day, so a month boundary has no step. Every profile has August at 0.85 and December at 0.75 (holidays). By type:
  - cabinet: flat apart from those two dips;
  - office cabinet: budget peaks in March and October;
  - lockers: today's `backToSchool` peak, since the distributors supply schools and gyms;
  - workshop cabinet: today's `spring` profile.
- `weekday(day)`: Monday 1.10, Tuesday 1.05, Wednesday 1.00, Thursday 0.95, Friday 0.90.
- `trend(day) = 1.10 ^ yearsSinceHistoryStart`: the business grows **10 % a year**. Over the history and the forecast that compounds to about ×1.33.
- `drift(type, week)`: a slow factor around 1, `1 + Σ_{i=0..7} 0.7^i · η(type, week − i) / norm`. `η` is uniform, keyed by (seed, ISO week, type) and scaled to about ±6 %. It is a moving average of keyed shocks, not a recursion, so a week's value doesn't depend on where the history starts.
- `ε(sku, day)`: uniform in ±0.25, keyed by (seed, date, sku).

Every random draw is keyed by its date or week, never by its position in a sequence. So a day's figure is the same whichever day the dataset is generated on.

**Customer streams.** Each SKU's `D` is split every day over its buyers by the shares in "Customers", in whole units, with **cumulative rounding**. Each customer's running total is the rounded running total of its exact share, so the streams sum to `D` exactly every day, and no customer drifts from its share even on SKUs that sell one or two a day.

**Customer orders.**

- **Online shop:** one order every weekday, holding that day's stream: one line per SKU with a non-zero quantity, required on the day, created two working days earlier.
- **B2B customers:** one order per delivery day, holding the customer's stream from that delivery day up to its next one (a replenishment for the coming period). It is created the customer's lead time earlier.
- **Export distributor:** each line is rounded to whole pallets and entered in pallets, and the difference carries into its next order. Its running total stays within one pallet of its stream.
- **Split shipments:** every ninth order in creation sequence ships in two, as today.
- **Projects:** 2–3 a year, listed in the configuration (customer, SKU, delivery day, 5–10 days of that SKU's demand). Each is one extra order from Office Interiors or the export distributor, such as a school fit-out before September or an office refurbishment. Projects come on top of `D` and are kept out of the forecast.

So the documents carry two kinds of daily figure. The online shop's lines are a daily series. The B2B lines are lumps on their delivery days, adding up to their stream over each delivery period. Summed over a week, all customer lines equal `D` plus the projects, apart from the export distributor's carried pallet difference. Unit tests pin these equalities.

### Supply (weekly)

The stock model and its proofs are today's, with a week as the bucket:

- **Safety stock**: finished goods cover 3 weekdays of average demand, intermediates 2 days of average use, and raw materials lead time × average daily consumption × 1.2. Each target is rounded up to the lot multiple, and is at least one multiple. The two later increases stay, re-pointed at locker 2 grey and cabinet blue.
- **Production**: at each Thursday's planning run, one production order per made pair whose projected stock falls below next week's need plus safety. The quantity is order-up-to, rounded to the lot, at least the minimum lot. Intermediates finish on Monday or Tuesday of the week they are made in, and finished goods on Wednesday or Thursday. Each week's production covers the following week's shipments.
- **Purchasing**: at the same planning run, one purchase order per supplier and week holds every raw material that needs replenishing. It is planned for the next week's Monday (steel) or Tuesday (supplies) and received in full that day. Lead times stay planning parameters (as in #126).
- **Order within a week**: receipts on Monday and Tuesday; intermediate completions on Monday and Tuesday, after the receipts; finished completions on Wednesday and Thursday. Shipments run every weekday from the stock the previous week built. `replay.ts` proves no balance goes negative on any day of the window.
- **Pairs**: 16 make pairs (4 intermediates, 12 SKUs) and 14 buy pairs, one per raw material. All are at 00000001, and each has planning parameters, a safety-stock target and an opening balance.

### Today: what is open

The rules of #126 "Today: what is open" are kept, with one plant. So there is one of each partial document:

- a partially shipped order;
- an open shipment;
- a partially received purchase order;
- a partially completed production order, whenever one is in progress.

There is also one overdue top-up purchase order, plus three open and two converted requisitions, all at 00000001. Customer orders created before today but due later are open, which gives 2–15 working days of visible open demand: the online shop's next two days, and each B2B customer's next one or two deliveries.

### Forecasts (about 3,100 rows)

There is one row per SKU at 00000001 for every weekday from tomorrow through the same calendar date twelve months on. The quantity is the model's expected value, `base × mix × season × weekday × trend`, with no drift, noise or projects, rounded half-up to whole units. Rows that round to 0 are omitted. That is a perfect forecast of the generator's mean, and the history's noise shows up as forecast error once those days become history (Q9). Forecasts are per SKU, not per customer (DEM-001). They overlap the open customer orders of the coming weeks, which the slice 3 netting consumes (DEM-007, D04).

### Volumes (estimates, refined by the generator)

The history runs from the 1st of the month 24 months ago to yesterday, about 540 weekdays and 108 weeks.

| Kind | About |
|---|---|
| Customer orders / lines | 960 / 5,900 (online shop 540 days; hardware chain 216 deliveries; Office Interiors and the export distributor 108 each; projects) |
| Shipments and goods issues | 1,070 each |
| Production orders and completions | 1,250 each |
| Purchase orders / receipts | 220 / 220 |
| **Documents** | **6,100** (cap 12,000) |
| **Stock movements** | **15,000** (cap 20,000) |
| Forecasts | 3,100 |
| Masters | 30 materials, 18 BOMs, 30 planning parameter sets, 32 safety-stock targets (30 plus the two later increases), 1 location, 4 customers, 2 suppliers |

Tiny (two months, about 9 weeks) comes to about 510 documents and 1,300 movements, plus the same 3,100 forecasts.

## 📝 The configuration

`test-tenant-config.json` keeps its sections and its Zod schema, with these changes:

| Key | Change |
|---|---|
| `horizon` | `historyMonths: 24` stays. `forecastMonths: 12` now means "daily rows through the same date twelve months on". |
| `shape` | `locations: 1`, `customers: 4`, `suppliers: 2`, `rawMaterials: 14`, `intermediates: 4`. `finishedProducts` becomes `{ types: 5, skus: 12 }`. `alternateBoms` becomes `{ product: "00000018", count: 3 }`. |
| `limits` | `documents: 12000`, `movements: 20000` (Q12). |
| `demand` | `growthPerYear: "0.10"` (compounding) and `noise: "0.25"`. New keys:<br>• `drift { weeks: 8, decay: "0.7", amplitude: "0.06" }`<br>• `weekday` (5 factors)<br>• `seasonality` (named profiles, read at mid-month and interpolated)<br>• `types[] { name, products[], baseDaily, profile }`<br>• `products[] { material, type, mix, enteredIn }`<br>• `customers[] { customer, deliveryDays[], leadWorkingDays, wholePacks, trend }`, where `trend` is `{ quarterlyGrowth, shares }` for a trending customer or `{ remainderWeights }` for a remainder customer<br>• `projects[] { customer, material, date, days }`<br>The monthly `monthlyBase` key goes. |
| `supply` | `safetyStock` coverage is stated in **days**: `finishedDays: 3`, `intermediateDays: 2`, `rawLeadTimeFactor: "1.2"`. `planningWeekday: 4` (Thursday) is new. The `waste`, `topUps` and `requisitions` entries name location 00000001 only. |
| `catalogue` | The lists above. `purchasedIntermediates` is empty. |

The schema's cross-checks follow the new shape:

- the shape matches the catalogue;
- every SKU belongs to exactly one type, and the mixes of a type sum to 1;
- every SKU has the online shop and at least one remainder customer among its buyers;
- exactly one customer buys every SKU;
- the remainder share stays ≥ 0.2 for every SKU on every day of the history and forecast horizon;
- every customer's delivery days are weekdays;
- every raw material has exactly one supplier.

## 📝 API Contracts

No change. `POST /api/tenants/test/reset` keeps its contract, `dataset` included (BACKWARD_COMPATIBILITY.md §4). Only what it writes, and how long that takes, change.

## 📝 UI/UX

No new screen. What changes is what Test shows:

- **Forecasts**: about 3,100 daily rows on a paged list (the forecast list already pages; spec `implemented/2026-10-21--2036UTC-forecast-paging-e08-proofs.md`).
- **Pickers**: the location picker has one entry, the supplier picker two and the customer picker four.
- **Stock report and ledgers**: daily movement on every weekday.
- **Customer-order list**: one online-shop order a day, with the B2B orders on their delivery days.

The reset dialog's "takes longer" note on Realistic stays true.

## 📝 Edge Cases & Failure Scenarios

| Case | Behaviour |
|---|---|
| Today is a weekend day | No demand, shipment, receipt or completion is dated on a weekend. Today's partial documents still use today's date, as a user would (as #126). The forecast starts on the next weekday. |
| Today is Thursday, the planning day | Next week's production and purchase orders are created today and are open. The previous week's are mostly received or completed by then. |
| Today is the 1st of a month | Nothing special: the buckets are days and weeks, and only the history start is month-aligned. |
| A project falls in the open window | It shows as one unusually large open order, which is realistic. A unit test checks the window over every day of a year (lesson of 2026-10-21) and asserts only properties that always hold. |
| A SKU's stream for a customer is 0 on a day or over a delivery period | No line for it. The order still exists if any of its lines is non-zero; otherwise that delivery is skipped. Low-volume SKUs (workshop red, about 1.75 a day in all) have intermittent online demand, which is realistic. The forecast omits days that round to 0. |
| The growing customer's share would push the remainder below its floor before the horizon ends | The schema refuses the configuration (cross-check above), so the unit tests fail before any seed. |
| A configuration drives a balance negative or exceeds `limits` | `generateTestTenantDataset` throws, the unit tests catch it, and at runtime the seed fails closed (as #126). |

## 📝 Risks & Impact Review

- **Seed duration.** The volume is about 1.7× today's (about 6,100 documents against 3,550). The reset blocks other requests while it writes, yielding between documents (lesson of 2026-10-24). Expect about 13 s locally against today's 7.6 s, under the ≤ 30 s budget and well under the proxy's 120 s. Measure it at the end of the generator phase, before the tests are rebased on it. The levers, in order:
  1. forecasts seeded with one material and one location lookup instead of one per row (`ForecastService.seedDemo` resolves both per row today: 6,200 lookups);
  2. production every other week for the low-volume SKUs;
  3. the shape, which is the owner's call.
- **Unit test time.** The replay tests generate the dataset for every day of a window (lesson of 2026-10-21), and two years of daily data multiplies their cost. Keep the per-anchor plan cache, and run the full-window property checks on tiny's horizon plus one full realistic generation.
- **Tiny's forecasts.** Tiny's documents shrink to about 510, but it gets 3,100 forecast rows against about 120 today. The startup seed stays a few seconds. If forecasts dominate it, tiny gets `forecastMonths: 3`, a one-line `test-datasets.ts` override like its `historyMonths`.
- **Test churn.** The tests that name the old plants, suppliers, customers or simple products change:
  - `named-records.test.ts`: the last location, supplier and customer;
  - `named-records-api.test.ts`: the first names stay;
  - the material and location filters in the two `planning-parameters` tests (`<= "00000026"`, `<= "00000004"`);
  - `purchasing.test.ts`: its first rows stay;
  - `supply-plan.test.ts`, `demand-plan.test.ts` and `test-tenant-config.schema.test.ts`;
  - the forecast tests that count monthly rows.

  IDs 00000001–00000021 keep their meaning, apart from 00000013 and 00000004's description, and customers 00000001–00000004 keep theirs. That limits the churn (#126 Q9). Grep for the removed customer names too.
- **Existing deployments** keep their Test data until the admin resets Test, as with #126.
- **Not a protected surface.** No schema, route, config contract or command changes.

## 📝 Decisions in play

- **D04**: the dataset adds data, not features. Daily forecasts use the existing per-day `Forecast` entity.
- **D06**: the reset regenerates the dataset, and the seeder writes through the services.
- **R02/R04**: the catalogue keeps the type rules (no finished component, no cycles), and the three office-cabinet BOMs have distinct priorities.
- **R09**: non-negative stock is proven by the replay on every day.
- **N04/N06**: no calendars, capacities or source lists are introduced. Weekdays only, the delivery days and the weekly planning day are generator choices.

## 📋 Implementation Plan

### Phase 1 — Configuration and daily demand

1. The `test-tenant-config.json` and schema changes from "The configuration", with a test for each new cross-check.
2. `calendar.ts`: ISO weeks, the weekday index, quarters since a date and the mid-month interpolation weight. `random.ts`: keyed draws by date and by week.
3. `demand-plan.ts`: `dailyDemand`, the customer shares over time, the cumulative-rounded streams and the customer orders. Tests:
   - streams sum to `D` every day;
   - each customer's lines over a delivery period equal its stream, and the export distributor's stay within one pallet;
   - yearly totals rise by 10 % ± 2 points;
   - the online shop's quarterly volume rises by 10 % ± 2 points a quarter across the history, and the hardware chain's falls by between 0.5 % and 3 % a quarter;
   - each type's season shows in its monthly totals;
   - adjacent days differ (noise);
   - the same `today` gives the same output.

### Phase 2 — Weekly supply, forecasts and timeline

4. `supply-plan.ts`: weekly order-up-to, daily safety coverage and a single plant. Tests: lot rounding, explosion over the shared intermediates, and safety coverage.
5. `planForecasts`: daily expected values, with zero days omitted. Tests: row count, weekdays only, no noise.
6. `timeline.ts` and `generate-dataset.ts`: the week and day bands, today's documents and the volumes. `replay.ts` proves non-negative balances and the limits. **Measure the realistic seed here** (spike) and record it in the run log.

### Phase 3 — Seeder, tests and paperwork

7. `ForecastService.seedDemo` resolves materials and locations once, if Phase 2's measurement needs it.
8. Update the unit and integration tests listed in "Test churn". Run the touched integration files and `test-reset-realistic.test.ts`.
9. Paperwork:
   - the help topic and the messages, if they describe four plants or ten customers (grep `Poznań`, `Łódź`, `Gdańsk` and the removed customer names);
   - the amended specs' headers;
   - this spec's implementation notes, and moving it to `implemented/`.

   The implementation PR references #237 without a closing keyword unless the owner says otherwise: the owner tracks the implementation on #237 and closes it.

## ✅ Acceptance criteria

- [ ] A realistic reset writes one location, two suppliers and four customers. It writes 30 materials: 12 finished SKUs in five types, four intermediates, and fourteen raw materials including five paints. It writes 18 BOMs.
- [ ] Over two years, customer-order lines show a non-zero daily figure from the online shop on most weekdays for the high-volume SKUs, and B2B lumps on their delivery days. The business's yearly total grows by about 10 %. The online shop's quarterly volume grows by about 10 % a quarter and the hardware chain's declines slightly. The monthly totals show each type's season, and no two consecutive weeks are identical.
- [ ] Forecast rows exist per SKU for the weekdays of the next twelve months, with daily dates and none on weekends.
- [ ] Production and purchase orders run weekly, from two suppliers in all. No balance goes negative on any day (replay).
- [ ] Tiny uses the same masters with a two-month history, and the integration suite passes on it.
- [ ] The realistic reset finishes within the measured budget (≤ 30 s locally), and the run log records the figure.
- [ ] 100 % coverage, lint, typecheck and build pass.
