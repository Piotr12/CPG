# Execution plan — demand review

**Date:** 2026-10-25 10:26 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Issue:** #240 · **Spec PR:** #241 (merged) · **Depends on:** #239 (merged in #242)
Source doc: .ai/specs/2026-10-25--0913UTC-demand-review.md
**Status:** in progress

## Goal

A Demand review screen (Sales → Demand review) and `GET /api/tenants/{t}/reports/demand-review` showing, per day, week or month, what shipped and what is still to ship (open customer orders plus forecast not yet ordered, netted by D08), in base units or SU.

## Scope

The spec's Phasing splits the work into two PRs, both tracked on #240:

- **PR 1 — Phase 1, demand data and API** (branch `feat/demand-review-data`): `core/src/domain/demand/` (buckets, D08 netting, tally), three indexes and their migration, `demand-review.schema.ts`, `DemandReviewService`, the API route, `BACKWARD_COMPATIBILITY.md`, the acceptance-doc statuses, the API integration test. It refers to #240 without closing it.
- **PR 2 — Phase 2, the screen** (branch `feat/demand-review-screen`, stacked on PR 1): chart tokens and the colour rule, `StackedColumnChart`, `ChartLegend`, `SegmentedControl`, `FilterMultiSelect`, the page and its components, nav, help, EN/PL, the screen integration test, QA screenshots, and the spec moved to `implemented/`. It closes #240.

The `@cpg/ui` pieces of Phase 2 (steps 6 and 7) touch only `packages/ui`, the design-token tests and two docs, so they are built in parallel with Phase 1 by two worker tasks forked off this plan commit, and merged into the Phase 2 branch.

**Non-goals:** KPI tiles (Q9), an `.xlsx` export, free From/To dates, editing forecasts, MRP (#14), a chart library.

## Implementation Plan

### Phase 1: Demand data and API (PR 1)

1. Domain: `demand-buckets.ts`, `forecast-netting.ts`, `demand-tally.ts`, the forecast entity comment reworded to D08; tests for the D08 cases, bucket frames (month, year, W53), `offset`, the tally's reversal, overdue and location cases.
2. Indexes: three entity indexes, `npm run db:migration:create -- demand-review-indexes`, `create index` only, an EXPLAIN test per query, migration counts moved.
3. Service and validator: `demand-review.schema.ts`, `DemandReviewService.read`, container and cradle lines; service tests on a real SQLite file; the 10× benchmark.
4. Route: `GET /api/tenants/[tenant]/reports/demand-review`, `BACKWARD_COMPATIBILITY.md`, route test, `tests/integration/demand-review-api.test.ts`.
5. Acceptance doc: DEM-002…013 set to *Partially verified* with the netting tests as evidence.

### Phase 2: Demand review screen (PR 2)

6. Tokens and chart (worker): chart tokens, the colour rule in `tests/design-tokens.test.ts`, `tokens.test.ts`, the design system spec and `engineering-standards.md`; `StackedColumnChart`, `ChartLegend`.
7. Filter controls (worker): `SegmentedControl`, `FilterMultiSelect`.
8. Screen: page, `components/reports/demand-review-*`, EN/PL, nav entry, help topic, menu-shape tests, `BACKWARD_COMPATIBILITY.md` UI route.
9. Integration and QA: `tests/integration/demand-review.test.ts`, `navigation.test.ts`, QA screenshots (1440 light/dark, 390); spec moved to `implemented/`.

## Risks

- The migration moves every migration count (lesson 2026-10-23).
- ISO week-year edges (2026 has W53) and the current month's forecast placement are easy to get subtly wrong: hand-computed tests.
- Performance at 10× the realistic dataset: budget 300 ms per read, measured and recorded.
- No Docker on this machine: integration files run against a local standalone server (lesson 2026-10-23).
- A stacked PR 2 must be rebased onto `main` once PR 1 is squash-merged.

## Log

- 10:26 — Feature route: spec merged (#241), SU merged (#242), nothing built, no open PR references #240. 9 steps, so the plain engine. Two PRs as the spec's Phasing says; the `@cpg/ui` steps 6–7 go to two parallel workers.
- 10:40 — Workers dispatched for steps 2.1 (chart) and 2.2 (filter controls), forked off the plan commit. 2.2 finished (e6fbb040 on cez/9969e46c). 2.1's first run died on a network error after committing most of its work; a continuation finished it (f8807162 on cez/69b02d2e).
- 11:35 — 1.1 done: buckets, D08 netting, tally, 30 tests at 100%.
- 12:00 — Deviation from the spec's indexes and reads, found by the 10× benchmark: the first service read goods-issue lines joined to their issue (`goods_issue(tenant, business_date)`). SQLite with no statistics (production never runs ANALYZE) planned it from `goods_issue_line`'s bare `tenant_code` index, whatever the join or an `issue IN (…)` list, and the month read took 814 ms, most of it hydrating populated entities and every issue's movements. Shipped now comes from the ledger: each goods-issue line posts one movement of its base quantity, out of its order's location, on the issue's business date, so one partial read of `stock_movement` by a new `(tenant, type, business_date)` index replaces the four-way join, and reversed lines come from the few `StockReversal` links of the window instead of every issue's movements. The `goods_issue` index is dropped from the migration. All reads use partial loads. Month read: 158 ms.
- 12:05 — Deviation: a repeated `material`/`location` value is deduplicated rather than refused ("unique" in the spec), so no new message is needed.
- 13:10 — Phase 1 gate: lint 0 (one pre-existing warning in `bom.service.ts`), typecheck 0, test:coverage 0 (4,377 tests, 100%), build 0. No Docker here: `demand-review-api.test.ts` and `smoke.test.ts` ran against a fresh standalone server copy (lesson 2026-10-23): 2 files, 8 tests passed.

## Phase 1 timings (10× the realistic dataset, `demand-review-reads.test.ts` run alone)

| Bucket | Read, fastest of three |
| --- | --- |
| day (43 buckets) | 52 ms |
| week (27 buckets) | 95 ms |
| month (16 buckets) | 158 ms |

Budget: 300 ms. Under the full parallel coverage run the month read took 815 ms, so the test's CI bound is 3 s.

## Progress

PR: #244 (Phase 1)

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Demand data and API

- [x] 1.1 Domain: buckets, D08 netting, tally — 9109ba49
- [x] 1.2 Indexes and migration — 99121a74
- [x] 1.3 Service and validator — a1a96573
- [x] 1.4 API route and integration test — 9e6dd5e5
- [x] 1.5 Acceptance doc statuses — 9e6dd5e5

### Phase 2: Demand review screen

- [ ] 2.1 Chart tokens and chart components
- [ ] 2.2 Filter controls
- [ ] 2.3 Screen, nav, help, messages
- [ ] 2.4 Integration test, QA, spec moved
