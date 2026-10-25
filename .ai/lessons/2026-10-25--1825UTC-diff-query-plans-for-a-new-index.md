# Diff every query plan before adding an index

**Context:** #247 added a `material (tenant_code, id)` index for one `id IN` read and found it moved an unrelated
join (the completions list then probed materials by tenant inside its loop), so it dropped the index. #257 had to add
five more tenant-led indexes and needed to know what else they move.

**Why a plan test isn't enough:** `list-page-reads.test.ts` checks the `IN` reads of the paged lists only. Without
ANALYZE statistics SQLite's cost estimates are crude, and a new index on a table can change the join order of any
query that touches that table.

**How (about two minutes):**

1. In `packages/db/src/orm.ts`, temporarily wrap the native handle's `prepare` after `cacheStatements(db)`, logging
   every statement that starts with `select` to the file named by an env var (separate statements with `\0`; MikroORM
   inlines most values, so the text alone is enough).
2. Run `PLAN_LOG=/tmp/plans.log npx vitest run packages/core`. #257 logged 54,429 distinct selects.
3. In a throwaway test under `packages/db`, migrate an empty database, `explain query plan` each distinct statement
   (bind `null` for any `?`: without statistics the values don't change the plan), drop the new indexes, explain
   again, recreate them.
4. Classify each changed plan by its walks: a `SEARCH … (tenant_code=?)` alone, a `SCAN`, or a keyset range
   `(tenant_code=? AND id>?)`. Read every plan that gains one, and find out which code sends it.
5. Revert `orm.ts` and delete the throwaway test.

In #257, 773 plans changed: 44 lost a walk, 16 lost a temp sort, 712 reordered with the same walked tables, and one
gained a walk: a whole-tenant `count(TransferReversal)` that only tests send.
