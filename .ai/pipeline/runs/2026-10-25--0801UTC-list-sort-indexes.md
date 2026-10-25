# Execution plan — index the paged lists' date and status sorts

**Date:** 2026-10-25 08:01 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Issue:** #220 · **Spec PR:** #234
Source doc: .ai/specs/2026-10-25--0755UTC-list-sort-indexes.md
**Status:** in progress

## Goal

Every date and status sort of a paged document list, in both directions, reads its first page through an index instead of sorting the tenant's documents, with no change to any order, page or screen.

## Scope

- `packages/db`: 18 index declarations on `production_order`, `purchase_order`, `purchase_requisition`, `customer_order` and `transfer`, plus one migration, `list_sort_indexes`. The ascending indexes use `properties`; the descending ones use an `expression` (the spec's Proposed Solution explains why).
- Tests: a migration test in `packages/db`, a plan test in `packages/core/src/services/`, and the migration counts that move.

**Non-goals:** search (FTS), keyset paging, the page count, sorts by a reference's ID, forecasts, the masters' lists, and the purchase-order lines' requisition join (spec Q6; filed as its own issue).

## Implementation Plan

### Phase 1: indexes, migration and proof

1. Declare the indexes, generate the migration, and check that it contains only `create index` / `drop index`. Update the migration lists and counts (`orm.test.ts`, `core/src/database.test.ts`, `system-status.service.test.ts`, `smoke.test.ts`, rollback-by-count tests).
2. Migration test: a populated upgrade keeps rows, the 18 indexes exist, the schema diff is empty for the five tables, and down drops them.
3. Plan test: for each key and direction, the real service query reads through the named index with no `TEMP B-TREE`, on an empty and on a seeded database.
4. Timings at 100,000 documents per list, before and after the migration, plus how long the migration takes → `timings.md` beside this plan (evidence, not a test).

### Phase 2: paperwork

5. File the Q6 follow-up issue, and add the lesson on index direction for mixed-direction `ORDER BY` and on `expression` desc indexes.
6. Move the spec to `implemented/` once spec PR #234 has merged (merge `main` first).

## Risks

- The planner may pick another plan on the seeded database than on an empty one. The test pins both.
- The spec move depends on #234 merging first (precedent #204 → #207).

## Log

- 08:01 — Spec written and reviewed on #234. A scratch benchmark (100,000 rows per list) measured the before and after figures quoted in the spec. A fresh-context review found that `columns: [{ sort: "desc" }]` indexes never leave the schema diff empty; the spec now requires `expression` indexes.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: indexes, migration and proof

- [ ] 1.1 Declare the indexes and generate the migration
- [ ] 1.2 Migration test
- [ ] 1.3 Plan test
- [ ] 1.4 Record the timings

### Phase 2: paperwork

- [ ] 2.1 File the follow-up issue and add the lesson
- [ ] 2.2 Move the spec to implemented/ after #234 merges
