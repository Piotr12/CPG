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

- [ ] 1.1 The configuration and schema changes, with a test per new cross-check
- [ ] 1.2 Calendar and keyed draws by date and week
- [ ] 1.3 Daily demand, customer streams, customer orders and projects

### Phase 2: Weekly supply, forecasts and timeline

- [ ] 2.1 Weekly order-up-to supply on one plant
- [ ] 2.2 Daily forecasts
- [ ] 2.3 Timeline, dataset generation, replay and the seed measurement

### Phase 3: Seeder, tests and paperwork

- [ ] 3.1 ForecastService.seedDemo lookups
- [ ] 3.2 Unit and integration tests the dataset moves
- [ ] 3.3 Paperwork, spec to implemented, lessons

## Log

- 2026-10-25 18:35 UTC — #237 classified as a feature; the spec (merged via #238) is `ready` and unimplemented; no implementation PR exists. Plan drafted: 9 steps, so the flat `om-auto-create-pr` engine.
- Deviation from the skill default: the PR body says `Refs #237`, not `Closes`, because the spec (Implementation Plan step 9) says the owner closes #237.
