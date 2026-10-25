# Execution plan — single-site, daily-demand realistic Test dataset

**Date:** 2026-10-25 18:35 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 237` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** .ai/specs/2026-10-25--0848UTC-single-site-daily-dataset.md
**Issue:** #237 (stays open: the PR references it without a closing keyword, as the spec asks)
**Spec PR:** #238 (merged)
**Status:** in progress

## Goal

Rework the generated Test dataset (`packages/core/src/domain/demo/`) into the single-site planning scenario of the spec: one plant, five furniture types in twelve colour SKUs, two suppliers, four customers with a growing and a declining trend, two years of **daily** demand with trend, seasonality and noise, weekly production and purchasing, and a daily twelve-month forecast. Tiny follows the same catalogue over its two-month history.

## Scope

- `test-tenant-config.json` and its Zod schema with the new cross-checks.
- `calendar.ts`, `random.ts`: day/week helpers and keyed draws by date and week.
- `demand-plan.ts`: daily demand `D(sku, day)`, customer streams, customer orders, projects, daily forecasts.
- `supply-plan.ts`: weekly order-up-to on a single plant, safety in days.
- `timeline.ts`, `generate-dataset.ts`, `ledger.ts`, `replay.ts`: week and day bands, today's documents.
- `ForecastService.seedDemo` lookups, if the seed measurement needs it.
- The unit and integration tests that name the old plants, suppliers, customers, products or monthly forecasts.
- Paperwork: help/messages if they describe the old network, amended specs' headers, this spec to `implemented/`.

## Non-goals

- No schema change, migration, route, screen or reset API change (spec "API Contracts").
- No calendars, capacities or source lists (N04/N06).
- The integration tests' self-contained fixtures (`tests/setup/demo-fixtures.ts` and unit fixtures) keep their own names.

## Implementation Plan

### Phase 1 — Configuration and daily demand

1. The configuration and schema changes, with a test per new cross-check.
2. Calendar (ISO weeks, weekday index, day counts, mid-month interpolation) and keyed draws by date and week.
3. Daily demand, customer shares and cumulative streams, customer orders, projects, with the spec's tests.

### Phase 2 — Weekly supply, forecasts and timeline

4. Weekly order-up-to supply on one plant with daily safety coverage.
5. Daily forecasts: expected value per SKU and weekday, zero days omitted.
6. Timeline and dataset generation, replay, limits; measure the realistic seed and record it here.

### Phase 3 — Seeder, tests and paperwork

7. `ForecastService.seedDemo` resolves materials and locations once, if the measurement needs it.
8. Update the unit and integration tests the new dataset moves; run the touched integration files and `test-reset-realistic.test.ts`.
9. Paperwork: help/messages sweep, amended specs' headers, spec implementation notes and move to `implemented/`, lessons.

## Risks

- Seed duration (≤ 30 s budget): measured in step 6.
- Unit-test time: full-window replay checks run on tiny's horizon, plus one realistic generation.
- Movement count near the 20,000 cap: tune lots (low-volume SKUs every other week) if it overshoots.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Configuration and daily demand

- [x] 1.1 The configuration and schema changes, with a test per new cross-check — 5c3c87f5
- [x] 1.2 Calendar and keyed draws by date and week — 5c3c87f5
- [x] 1.3 Daily demand, customer streams, customer orders and projects — 5c3c87f5

### Phase 2: Weekly supply, forecasts and timeline

- [x] 2.1 Weekly order-up-to supply on one plant — 795d0948
- [x] 2.2 Daily forecasts — 795d0948
- [x] 2.3 Timeline, dataset generation, replay and the seed measurement — 795d0948

### Phase 3: Seeder, tests and paperwork

- [x] 3.1 ForecastService.seedDemo lookups — 9527bbec
- [ ] 3.2 Unit and integration tests the dataset moves
- [ ] 3.3 Paperwork, spec to implemented, lessons

## Log

- 2026-10-25 18:35 UTC — #237 classified as a feature; the spec (merged via #238) is `ready` and unimplemented; no implementation PR exists. Plan drafted: 9 steps, so the flat `om-auto-create-pr` engine.
- Deviation from the skill default: the PR body says `Refs #237`, not `Closes`, because the spec (Implementation Plan step 9) says the owner closes #237.
- 2026-10-25 19:10 UTC — Generator rewritten (config, schema, calendar, random, customer shares, daily demand, weekly supply, daily forecasts). First generation: 6,932 documents / 19,583 movements, too close to the 20,000 cap; the spec's lever applied: larger minimum lots on the seven low-volume colour SKUs, made about every other week → 6,322 documents / 17,520 movements on 2026-10-21.
- 2026-10-25 19:20 UTC — Scratch check (not committed): `generateTestTenantDataset` on **every day of 2025-01-01…2027-12-31** passes the replay for both datasets (no negative balance, under the limits): realistic max 6,458 documents / 17,930 movements, tiny max 802 / 2,088. The committed replay test covers tiny over two years and realistic over December 2026–January 2027.
- 2026-10-25 19:25 UTC — Demand statistics (anchor 2026-10): 61.8 units a weekday in the first year; business ×1.103 year over year; online shop ×1.0985 a quarter, hardware chain ×0.9846; December and August dips, lockers peaking June–July, office cabinets in March and October.
- 2026-10-25 19:30 UTC — Forecasts were 85 % of a generation's time (3,132 rows a day); planned once per anchor month and sliced per day: tiny over a year of days went 3.8 s → 0.75 s.
- 2026-10-25 20:10 UTC — **Seed measurement** (unit-test harness, fresh SQLite, today 2026-10-21): realistic **14.7 s** (budget ≤ 30 s; was 7.6 s), tiny 1.8 s. Forecast seed 0.30 s → 0.06 s with batched lookups (step 7 kept: small, existing helpers). Tiny keeps `forecastMonths: 12`: its forecasts are not what its startup spends time on.
- Deviation, flagged for the owner: with Q10's weekly purchasing (created Thursday, received the next Monday or Tuesday) no purchase order is open on Wednesdays and Thursdays, so the partially received purchase order of "Today: what is open" exists from Thursday's run to its receipt, five days a week, like the partially completed production order "whenever one is in progress". Ordering two weeks ahead would keep one open every day but changes Q10's answer.
- Deviation: `demand.types` carries no `products` list; each `demand.products` entry names its type, so a SKU's type is stated once. `catalogue.purchasedIntermediates` is dropped rather than left empty, and `buy.suppliers` became `buy.supplier` (exactly one supplier per material, Q4).
- Deviation: streams split each day's D by giving each unit to the buyer owed most of its exact share (largest deficit). Every buyer's running total stays within a unit of its exact running share, and no daily stream goes negative, which rounding each customer's running total separately can't promise with three buyers.
