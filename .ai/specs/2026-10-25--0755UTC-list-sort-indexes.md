# The paged document lists sort by a date or status from an index, not by sorting the whole tenant

**Status:** ready
**Created:** 2026-10-25 07:55 UTC
**Issue:** #220 (follow-up to #217, decision D5 of `.ai/pipeline/runs/2026-10-24--2206UTC-list-sort-search-units/PLAN.md`) · **Design authority:** `.ai/specs/product-brief.md` (A04: best-effort performance, no numeric targets), lesson 2026-10-23 "EXPLAIN the query MikroORM really sends"

## 📝 TLDR

Since #217 every paged document list can be sorted by a column header, but only the default order (by ID) is served by an index. A sort by a planned date, a required date or a status makes SQLite read and sort every document of the tenant before it returns the first page. That costs a few milliseconds today. At 100,000 documents it costs 35–86 ms for page 1 and up to 420 ms for the last page. This spec proposes 18 additive indexes, one ascending and one descending per date or status sort key of the five document tables. With them, page 1 of every such sort, in both directions, answers in 2–5 ms at that size. Nothing a user sees changes except the speed: same orders, same pages, same search.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | At what size do we design and measure? | 100,000 documents per list in one tenant (the benchmark below), with the masters a realistic tenant has (2,000 materials, 20 locations, 200 suppliers, 500 customers). | The issue asks to measure "at the row cap", but the product has no row cap and the PRD sets no numeric targets (A04). 100,000 is well past the "few thousand" D5 assumed, and still small enough to seed in seconds. The indexes don't depend on the figure: it only sizes the evidence. |
| Q2 | Which sort keys get an index? | The sort keys on a paged list's own columns: production orders' `plannedFinish`, `plannedStart` and `status`; purchase orders' `status`; requisitions' `requiredDate` and `status`; customer orders' `status`; transfers' `plannedDispatch` and `status`. | These are the only sorts where SQLite reads and sorts the whole tenant before page 1 (`USE TEMP B-TREE FOR ORDER BY`). A sort by a reference's business ID (output, supplier, customer, material, location, source) already starts from the referenced table's `(tenant, code)` index and answers page 1 in 2–15 ms at 100,000. The masters' lists aren't paged and are sorted after reading or are small. Forecasts sort by date, then by material and location IDs, which live in other tables, so an index on `forecast` can't order it; it answers page 1 in 15 ms at 100,000 forecasts. |
| Q3 | How is a descending sort served, given that ties stay in ascending ID order (#217 D3)? | A second, descending index per key: `(tenant, column DESC, code)`. The ascending index `(tenant, column, code)` serves the ascending sort. | An index read backwards gives `column DESC, code DESC`, which isn't the list's order, so without a companion index a descending sort still sorts the whole tenant (35–48 ms for page 1, measured). Breaking ties by descending ID instead would let one index serve both directions, but it changes the order of every descending list, the unpaged in-memory ones included (`compareBoms` and the others promise ascending IDs). The companion index keeps every order unchanged and can be dropped on its own. It costs about 3 MB per index per 100,000 rows (measured with `dbstat`). |
| Q4 | Does the search get an index or full-text search? | No. `LIKE '%word%'` stays as it is. | A pattern with a leading wildcard can't use a B-tree index, and FTS5 needs raw SQL, which ESLint bans in `core` (issue #220). Measured at 100,000: a search's count takes 20–60 ms and its first page 2–31 ms. That's acceptable for best-effort performance (A04). |
| Q5 | Do deep pages (offset) or the page count change? | No. | With the indexes the last of 1,000 pages takes 36–87 ms, and the count of a list 10–55 ms. Both are linear in the tenant's documents whatever the sort, and keyset paging would change the URL contract (#217 D4). Neither is what this issue asks for. |
| Q6 | The purchase order list costs ~140 ms per page at 100,000 whatever the sort. Is that fixed here? | No. It's filed as its own follow-up issue. | The cost isn't the sort. Reading the page's lines with their requisitions makes MikroORM add a `left join (purchase_requisition inner join material inner join location)` for the tenant filter, and SQLite materializes it over every requisition of the tenant on every page. It's a different cause with a different fix, and it ships on its own. |
| Q7 | How is the effect proven in CI? | By the query plan of the real service query, never by a timing: every key and direction must read through its named index, with no temporary sort. The timings are recorded once, in the run folder. | Timing assertions are flaky on shared CI runners. The plan is deterministic, and it is what the timings follow from. |

## 📝 Problem Statement

#217 made the lists sort by any column, and D5 deliberately shipped it without new indexes because the lists hold a few thousand rows. This spec revisits that choice with a benchmark. It seeded one tenant with 100,000 documents per list, called the real `list` of each service and ran `explain query plan` on the SQL MikroORM sent (lesson 2026-10-23):

| List, sort | Page 1 now | Last page now | Page 1 with the index (asc / desc) |
|---|---|---|---|
| Production orders by planned finish | 80 ms | 417 ms | 4 / 4 ms |
| Production orders by planned start | 86 ms | 368 ms | 4 / 4 ms |
| Production orders by status | 68 ms | 280 ms | 5 / 4 ms |
| Requisitions by required date | 35 ms | 169 ms | 2 / 2 ms |
| Requisitions by status | 35 ms | 170 ms | 2 / 2 ms |
| Customer orders by status | 35 ms | 103 ms | 5 / 4 ms |
| Transfers by planned dispatch | 49 ms | 302 ms | 3 / 3 ms |
| Transfers by status | 48 ms | 259 ms | 3 / 3 ms |
| Purchase orders by status | 190 ms | 259 ms | 143 / 153 ms (Q6) |

At 10,000 documents every sort answers in under 25 ms with or without the indexes, so today's tenants don't notice. The cost grows linearly with the tenant. Since better-sqlite3 is synchronous (lesson 2026-10-24), every one of those milliseconds blocks the whole server, not only the user who sorted.

## 📝 Proposed Solution

Declare the indexes on the entities, so `db:migration:create` emits them and the snapshot records them. Each key gets an ascending index:

```ts
{ properties: ["tenant", "plannedFinish", "code"] }
```

and a named descending one, declared as an `expression`:

```ts
{ name: "production_order_tenant_code_planned_finish_desc_code_index",
  expression: "create index `production_order_tenant_code_planned_finish_desc_code_index` on `production_order` (`tenant_code`, `planned_finish` desc, `code`)" }
```

The `expression` form is required. MikroORM 7 also accepts `columns: [{ name, sort: "desc" }]`, but it reads SQLite indexes back without their column direction. Its schema diff then never matches, so `getUpdateSchemaSQL()` keeps proposing `drop index …; create index …` (checked on a throwaway entity), and the schema-sync assertions in `orm.test.ts` and `document-lifecycle-migration.test.ts` would fail. The expression form leaves an empty diff. It's raw SQL in an entity definition in `@cpg/db`, which the ESLint raw-SQL ban (on `core` and `app` calls) doesn't cover and isn't meant to. A small helper in the entities folder builds the five statements, so the descending indexes are written once.

| Table | Sort keys (ascending + descending index each) |
|---|---|
| `production_order` | `planned_finish`, `planned_start`, `status` |
| `purchase_order` | `status` |
| `purchase_requisition` | `required_date`, `status` |
| `customer_order` | `status` |
| `transfer` | `planned_dispatch`, `status` |

No service, schema, route or screen changes. `listOrderBy` and the sort-key maps stay as #217 left them.

**Alternatives considered:** breaking ties by descending ID (Q3: changes visible order); a single index per key, accepting a full sort for descending (Q3: leaves half the sorts slow); denormalizing reference business IDs onto the documents so reference sorts are indexed (Q2: they're already fast at page 1, and it adds write paths); FTS5 for search (Q4: raw SQL).

## 📝 Data Model

One migration, `list_sort_indexes`: 18 `create index` statements on the five tables, and 18 `drop index` statements on the way down. No column, constraint or row changes, and no table rebuild: the generated SQL must contain nothing but those statements (lesson 2026-10-23 on generated migrations). The ascending indexes take MikroORM's generated names (`<table>_tenant_code_<column>_code_index`). The descending ones are `expression` indexes named `<table>_tenant_code_<column>_desc_code_index`, so their names never collide with the ascending ones.

## 📝 Edge Cases & Failure Scenarios

- **Deploy overlap** (lesson 2026-10-21): the migration is additive. The previous image keeps reading and writing the same columns, and its queries may use the new indexes too. A `kamal rollback` leaves the indexes in place, which is harmless; `down()` drops them.
- **Migration time on a large tenant:** the indexes are built inside the startup migration, before `/up` answers, and kamal-proxy keeps traffic on the old container until then. SQLite builds each one in a single sorted pass. Step 4 measures the migration at 100,000 documents per list and records it.
- **Planner choice:** SQLite picks plans by cost, so a plan could change after an upgrade or on very skewed data. The plan test pins the choice on an empty and on a populated database, so a regression fails CI.
- **Write cost:** each insert or status change on these tables updates up to six more index entries. That's negligible next to MikroORM's per-call cost (lesson 2026-10-22).

## 📝 Risks & Impact Review

- **Storage:** about 3 MB per index per 100,000 rows, so about 54 MB for all 18 at 100,000 documents per list. The five tables themselves take 42 MB at that size. Each index can be dropped on its own if its sort proves unused.
- **Migration counts move** (lesson 2026-10-23): `orm.test.ts`, `core/src/database.test.ts`, `system-status.service.test.ts`, `smoke.test.ts` and every rollback-by-count test.
- **No protected surface changes** (`BACKWARD_COMPATIBILITY.md`): no API, payload, order or message changes.

## 📝 Decisions in play

Relies on A04 (best-effort performance, no numeric targets), and revisits #217's D5 for these nine sort keys only, as D5 itself foresaw. D3 (ties by ascending business ID) is kept.

## 📋 Implementation Plan

### Phase 1: indexes, migration and proof

1. **Declare the indexes and generate the migration.** Add the 18 index definitions to the five entities, run `npm run db:migration:create -- list_sort_indexes`, and check that the generated SQL is only `create index` / `drop index`. Commit it with the snapshot and `migrations/index.ts`. Update the migration lists and counts in the tests named under Risks. *Test:* the existing migration and schema tests pass with the new count.
2. **Migration test** (`packages/db/src/list-sort-index-migration.test.ts`, after `location-guard-index-migration.test.ts`): apply every migration but this one, insert a document in each of the five tables, then migrate up. Assert that the 18 indexes exist, that the rows are unchanged, and that `orm.schema.getUpdateSchemaSQL()` is empty for the five tables, which proves the descending `expression` indexes stay in sync. Migrate down and assert the indexes are gone and the rows are unchanged.
3. **Plan test** (`packages/core/src/services/list-sort-indexes.test.ts`): one table-driven file directly under `services/`, because it spans five concepts and a `lists/` service folder holding only a test would break the concept-folder rule. For every key in the table above and both directions, call the real service's `list({ sort, dir })` on a `selectTenant` fork, capture the page query with `initOrm(…, { onQuery })` and `explain query plan` it. Assert the exact `USING INDEX <expected name> (tenant_code=?)` row for the document table, and no `TEMP B-TREE` in any row, which also catches a partial sort (`… FOR RIGHT PART OF ORDER BY`). Run it on an empty database and on one seeded with a few hundred documents per table, so the planner's choice is pinned in both cases.
4. **Record the timings** (evidence, not a test): re-run the benchmark on the final branch, before and after the migration, at 100,000 documents per list, including how long the migration takes. Record the method and figures in the run folder's `timings.md`.

### Phase 2: paperwork

5. File the Q6 follow-up issue (the purchase order lines' requisition join) and cite its number in the PR. Add a lesson on index direction versus mixed-direction `ORDER BY`. Move this spec to `implemented/`.
