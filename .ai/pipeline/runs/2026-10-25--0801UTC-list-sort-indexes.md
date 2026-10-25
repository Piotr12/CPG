# Execution plan — index the paged lists' date and status sorts

**Date:** 2026-10-25 08:01 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Issue:** #220 · **Spec PR:** #234
Source doc: .ai/specs/2026-10-25--0755UTC-list-sort-indexes.md
**Status:** in progress

## Goal

Every date and status sort of a paged document list, in both directions, reads its first page through an index instead of sorting the tenant's documents, with no change to any order, page or screen.

## Scope

- `packages/db`: 18 index declarations on `production_order`, `purchase_order`, `purchase_requisition`, `customer_order` and `transfer`, plus one migration, `list_sort_indexes`. Both directions are `expression` indexes, built by one helper, `listSortIndexes` (`db/src/entities/lists/`); the spec's Proposed Solution explains why the descending ones must be.
- Tests: a migration test in `packages/db`, a plan test in `packages/core/src/services/`, and the migration counts that move.

**Non-goals:** search (FTS), keyset paging, the page count, sorts by a reference's ID, forecasts, the masters' lists, and the purchase-order lines' requisition join (spec Q6; filed as its own issue).

## Implementation Plan

### Phase 1: indexes, migration and proof

1. Declare the indexes, generate the migration, and check that it contains only `create index` / `drop index`. Update the migration lists and counts (`orm.test.ts`, `core/src/database.test.ts`, `system-status.service.test.ts`, `smoke.test.ts`, rollback-by-count tests).
2. Migration test: a populated upgrade keeps rows, the 18 indexes exist, the schema diff is empty for the five tables, and down drops them.
3. Plan test: for each key and direction, the real service query reads through the named index with no `TEMP B-TREE`, on an empty and on a seeded database.
4. Timings at 100,000 documents per list, before and after the migration, plus how long the migration takes, in this plan's Timings section (evidence, not a test).

### Phase 2: paperwork

5. File the Q6 follow-up issue, and add the lesson on index direction for mixed-direction `ORDER BY` and on `expression` desc indexes.
6. Move the spec to `implemented/` once spec PR #234 has merged (merge `main` first). Add implementation notes for the three deviations recorded in the log: both directions are expressions, the timings live in this plan, and the seeded plan-test case runs `ANALYZE`.

## Risks

- With statistics the planner could pick another plan. The seeded plan-test case runs `ANALYZE`, so the test pins the plan both without statistics (as in production) and with them.
- The spec move depends on #234 merging first (precedent #204 → #207).

## Log

- 08:01 — Spec written and reviewed on #234. A scratch benchmark (100,000 rows per list) measured the before and after figures quoted in the spec. A fresh-context review found that `columns: [{ sort: "desc" }]` indexes never leave the schema diff empty; the spec now requires `expression` indexes.
- 08:20 — 1.1: both index directions come from one helper, `listSortIndexes` (`db/src/entities/lists/`), and both are `expression` indexes. That deviates from the spec's "ascending ones use `properties`": it keeps the names and SQL of all 18 in one place, and the migration and schema diff come out identical. The generated migration is 18 `create index` and 18 `drop index` statements, with no rebuild. Counts moved: `orm.test.ts`/`database.test.ts` lists, 31→32 in `orm.test.ts`, `system-status.service.test.ts` and `smoke.test.ts`; one more `down()` in the six rollback chains and in `transfer-reversal.entity.test.ts`; the forecast loop 17→18. Both "adopts …" tests now filter `list_sort` out with the tables it indexes (lesson 2026-10-23).
- 08:30 — 1.2/1.3: mutation checks. With `columns: [{ sort: "desc" }]` instead of an expression, the migration test fails on the schema diff. Applied only up to the previous migration, all 36 plan cases fail.
- 08:45 — 1.4: timings below. The migration takes 1.0 s at 100,000 rows in each of the five tables.
- 08:50 — 2.1: filed #236 (the purchase-order lines' requisition join, spec Q6). Lesson added under Database.

- 09:20 — Review (`om-auto-review-pr`, fresh-context reviewer): APPROVE, with no blockers or majors. Fixed: the plan's Scope and step 1.4 text; the seeded plan-test case now runs `ANALYZE`, because without statistics both cases planned the same; page sizes come from the services' constants; `listSortIndexName` is no longer exported; the lesson's path. Open: 2.2 waits for #234.

## Timings (step 1.4)

**Method.** A throwaway Vitest file, not committed (script below), seeded one tenant (`prod`) with raw SQL: 2,000 materials, 20 locations, 200 suppliers, 500 customers, and 100,000 documents in each of the five lists, with random dates over 700 days and random statuses. Purchase and customer orders had one line each, and there were 100,000 forecasts. It migrated to `Migration20261023201801_shipment_edit_cancel` and timed each service's real `list` (median of 3), on page 1, the last page (1,000) and a search for `12`. It then ran this branch's migration, timed it, and measured again. Plans come from `explain query plan` on the SQL MikroORM sent. The database had no `ANALYZE` statistics, as in production. Machine: the developer's Apple-silicon Mac, Node 24, SQLite 3.51.

**Migration:** `list_sort_indexes` took **1,027 ms** for 18 indexes over the five 100,000-row tables. It runs at startup, before `/up` answers.

| List, sort | Page 1 before → after | Last page before → after | Plan after |
|---|---|---|---|
| Production orders, planned finish asc / desc | 69 / 68 → 5 / 5 ms | 233 / 261 → 96 / 93 ms | `…_planned_finish_code_index` / `…_planned_finish_desc_code_index` |
| Production orders, planned start asc / desc | 68 / 68 → 4 / 4 ms | 253 / 216 → 92 / 96 ms | `…_planned_start_(desc_)code_index` |
| Production orders, status asc / desc | 71 / 80 → 4 / 5 ms | 180 / 180 → 79 / 77 ms | `…_status_(desc_)code_index` |
| Purchase orders, status asc / desc | 176 / 170 → 146 / 151 ms | 223 / 221 → 197 / 177 ms | `…_status_(desc_)code_index`; the rest is the lines' requisition join (spec Q6) |
| Requisitions, required date asc / desc | 37 / 37 → 2 / 2 ms | 153 / 174 → 53 / 52 ms | `…_required_date_(desc_)code_index` |
| Requisitions, status asc / desc | 36 / 38 → 2 / 2 ms | 108 / 108 → 39 / 40 ms | `…_status_(desc_)code_index` |
| Customer orders, status asc / desc | 47 / 44 → 11 / 14 ms | 94 / 97 → 50 / 54 ms | `…_status_(desc_)code_index` (page 1 includes its lines) |
| Transfers, planned dispatch asc / desc | 45 / 45 → 4 / 3 ms | 202 / 209 → 73 / 64 ms | `…_planned_dispatch_(desc_)code_index` |
| Transfers, status asc / desc | 45 / 47 → 3 / 3 ms | 120 / 114 → 43 / 42 ms | `…_status_(desc_)code_index` |

**Unchanged, for the record** (after): counts take 30–47 ms per list and searches 30–59 ms. Sorts by ID or by a reference's ID answer page 1 in 2–15 ms. The purchase-order list costs about 150 ms per page whatever the sort (the Q6 follow-up). Every `before` plan for the sorts above was `USE TEMP B-TREE FOR ORDER BY`; every `after` plan is a `SEARCH … USING INDEX <name> (tenant_code=?)` with no temporary sort.

<details><summary>Benchmark script (throwaway, run from <code>packages/core/src/</code> with <code>SCRATCH_N=100000</code>)</summary>

```ts
// SCRATCH — issue #220 measurement, never committed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "vitest";
import { initOrm, selectTenant, type Orm } from "@cpg/db";
import { ProductionOrderService } from "./services/production-orders/production-order.service";
import { PurchaseOrderService } from "./services/purchase-orders/purchase-order.service";
import { PurchaseRequisitionService } from "./services/purchase-requisitions/purchase-requisition.service";
import { CustomerOrderService } from "./services/customer-orders/customer-order.service";
import { TransferService } from "./services/transfers/transfer.service";
import { ForecastService } from "./services/forecasts/forecast.service";

const N = Number(process.env.SCRATCH_N ?? 100000);
const out = (s: string) => process.stdout.write(s + "\n");
const pad = "printf('%08d', x)";

async function seed(orm: Orm) {
  const sql = (q: string) => orm.em.getConnection().execute(q);
  const seq = (n: number) => `with recursive s(x) as (select 1 union all select x + 1 from s where x < ${n})`;
  await sql(`${seq(2000)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'm'||x, 'prod', ${pad}, 'finished', 'Material '||x||' steel cabinet', 'each', 0 from s`);
  await sql(`${seq(20)} insert into location (id, tenant_code, code, name, created_at) select 'l'||x, 'prod', ${pad}, 'Plant '||x, 0 from s`);
  await sql(`${seq(200)} insert into supplier (id, tenant_code, code, name, created_at) select 's'||x, 'prod', ${pad}, 'Supplier '||x, 0 from s`);
  await sql(`${seq(500)} insert into customer (id, tenant_code, code, name, created_at) select 'c'||x, 'prod', ${pad}, 'Customer '||x, 0 from s`);
  await sql(`${seq(2000)} insert into bom (id, tenant_code, code, output_id, revision, created_at) select 'b'||x, 'prod', ${pad}, 'm'||x, 1, 0 from s`);
  await sql(`${seq(2000)} insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) select 'r'||x, 'prod', 'b'||x, 1, 1, '2026-01-01', 0 from s`);
  const status = (x: string) => `case abs(random()) % 4 when 0 then 'open' when 1 then 'completed' when 2 then 'closed-early' else 'cancelled' end`;
  const day = `date('2026-01-01', '+' || (abs(random()) % 700) || ' days')`;
  await sql(`${seq(N)} insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_finish, planned_start, lead_time_days, status, created_at, updated_at)
    select 'po'||x, 'prod', ${pad}, 'm'||(1 + abs(random()) % 2000), 'l'||(1 + abs(random()) % 20), 'r1', '1.000000', '1', 'each', '1', '1', ${day}, ${day}, 1, ${status("x")}, 0, 0 from s`);
  await sql(`${seq(N)} insert into purchase_order (id, tenant_code, code, supplier_id, location_id, status, created_at, updated_at)
    select 'pu'||x, 'prod', ${pad}, 's'||(1 + abs(random()) % 200), 'l'||(1 + abs(random()) % 20), case abs(random()) % 3 when 0 then 'open' when 1 then 'completed' else 'cancelled' end, 0, 0 from s`);
  await sql(`${seq(N)} insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, status, created_at)
    select 'pr'||x, 'prod', ${pad}, 'm'||(1 + abs(random()) % 2000), 'l'||(1 + abs(random()) % 20), '1.000000', '1', 'each', '1', '1', ${day}, '0.000000', case abs(random()) % 3 when 0 then 'open' when 1 then 'converted' else 'cancelled' end, 0 from s`);
  await sql(`${seq(N)} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at)
    select 'co'||x, 'prod', ${pad}, 'c'||(1 + abs(random()) % 500), 'l'||(1 + abs(random()) % 20), ${status("x")}, 0, 0 from s`);
  await sql(`${seq(N)} insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_dispatch, planned_arrival, status, created_at, updated_at)
    select 't'||x, 'prod', ${pad}, 'm'||(1 + abs(random()) % 2000), 'l'||(1 + abs(random()) % 20), 'l'||(1 + abs(random()) % 20), '1.000000', '1', 'each', '1', '1', ${day}, ${day}, 'open', 0, 0 from s`);
  await sql(`insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date)
    select 'pl'||id, 'prod', id, 0, 'm1', '1.000000', '1', 'each', '1', '1', '2026-05-01' from purchase_order`);
  await sql(`insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date)
    select 'cl'||id, 'prod', id, 0, 'm1', '1.000000', '1', 'each', '1', '1', '2026-05-01' from customer_order`);
  // forecasts: 1000 materials x 10 locations x N/10000 days
  const days = Math.max(1, Math.round(N / 10000));
  await sql(`with recursive m(x) as (select 1 union all select x + 1 from m where x < 1000), l(y) as (select 1 union all select y + 1 from l where y < 10), d(z) as (select 0 union all select z + 1 from d where z < ${days - 1})
    insert into forecast (id, tenant_code, material_id, location_id, date, quantity) select 'f'||x||'-'||y||'-'||z, 'prod', 'm'||x, 'l'||y, date('2026-01-01', '+' || z || ' days'), '1.000000' from m, l, d`);
}

const INDEXES = [
  "create index ix_po_finish on production_order (tenant_code, planned_finish, code)",
  "create index ix_po_start on production_order (tenant_code, planned_start, code)",
  "create index ix_po_status on production_order (tenant_code, status, code)",
  "create index ix_pu_status on purchase_order (tenant_code, status, code)",
  "create index ix_pr_date on purchase_requisition (tenant_code, required_date, code)",
  "create index ix_pr_status on purchase_requisition (tenant_code, status, code)",
  "create index ix_co_status on customer_order (tenant_code, status, code)",
  "create index ix_t_dispatch on transfer (tenant_code, planned_dispatch, code)",
  "create index ix_t_status on transfer (tenant_code, status, code)",
];
if (process.env.SCRATCH_DESC) INDEXES.push(...INDEXES.map((ix) => ix.replace(/ix_(\w+) on (\w+) \(tenant_code, (\w+), code\)/, "ix_$1_desc on $2 (tenant_code, $3 desc, code)")));

type Lister = { name: string; sorts: string[]; list: (o: Record<string, unknown>) => Promise<unknown>; count: (q: string) => Promise<unknown>; lastPage: number };

it.skipIf(process.env.SCRATCH_PO)("measures #220", { timeout: 3_600_000 }, async () => {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-220-")), "cpg.sqlite") }, { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
  await orm.migrator.up({ to: "Migration20261023201801_shipment_edit_cancel" });
  let t = performance.now();
  await seed(orm);
  out(`seeded N=${N} in ${Math.round(performance.now() - t)} ms`);
  const em = () => { const e = orm.em.fork(); selectTenant(e, "prod"); return e; };
  const last = Math.ceil(N / 100);
  const listers: Lister[] = [
    { name: "production", sorts: ["id", "output", "location", "finish", "start", "status"], list: (o) => new ProductionOrderService({ em: em() }).list(o as never), count: (q) => new ProductionOrderService({ em: em() }).count({ q }), lastPage: last },
    { name: "purchase", sorts: ["id", "supplier", "location", "status"], list: (o) => new PurchaseOrderService({ em: em() } as never).list(o as never), count: (q) => new PurchaseOrderService({ em: em() } as never).count({ q }), lastPage: last },
    { name: "requisition", sorts: ["id", "material", "location", "requiredDate", "status"], list: (o) => new PurchaseRequisitionService({ em: em() } as never).list(o as never), count: (q) => new PurchaseRequisitionService({ em: em() } as never).count({ q }), lastPage: last },
    { name: "customer", sorts: ["id", "customer", "location", "status"], list: (o) => new CustomerOrderService({ em: em() }).list(o as never), count: (q) => new CustomerOrderService({ em: em() }).count({ q }), lastPage: last },
    { name: "transfer", sorts: ["id", "material", "source", "plannedDispatch", "status"], list: (o) => new TransferService({ em: em() }).list(o as never), count: (q) => new TransferService({ em: em() }).count({ q }), lastPage: last },
    { name: "forecast", sorts: ["material", "location", "date"], list: (o) => new ForecastService({ em: em() }).list({}, o as never), count: (q) => new ForecastService({ em: em() }).count({}, { q }), lastPage: last },
  ];
  const time = async (fn: () => Promise<unknown>) => { const xs: number[] = []; for (let i = 0; i < 3; i++) { const s = performance.now(); await fn(); xs.push(performance.now() - s); } return Math.round(xs.sort((a, b) => a - b)[1]); };
  const plan = async (fn: () => Promise<unknown>) => {
    queries.length = 0; await fn();
    const q = queries.find((x) => /^select/i.test(x.sql) && /limit/i.test(x.sql)) ?? queries[0];
    return (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${q.sql}`, [...q.params])).map((r) => r.detail).join(" | ");
  };
  for (const phase of ["before", "after"]) {
    if (phase === "after") { const m = performance.now(); await orm.migrator.up(); out(`migration list_sort_indexes took ${Math.round(performance.now() - m)} ms`); }
    out(`\n### ${phase}`);
    for (const l of listers) {
      out(`- ${l.name}: count ${await time(() => l.count(""))} ms, search "steel 12" count ${await time(() => l.count("steel 12"))} ms, page1 search ${await time(() => l.list({ q: "steel 12" }))} ms`);
      for (const sort of l.sorts) for (const dir of ["asc", "desc"]) {
        const p1 = await time(() => l.list({ sort, dir }));
        const pl = await time(() => l.list({ sort, dir, page: l.lastPage }));
        const pq = await time(() => l.list({ sort, dir, q: "12" }));
        out(`  - ${sort} ${dir}: page1 ${p1} ms, last ${pl} ms, q=12 ${pq} ms :: ${await plan(() => l.list({ sort, dir }))}`);
      }
    }
  }
  await orm.close();
});

it.runIf(process.env.SCRATCH_PO)("profiles the purchase order list", { timeout: 600_000 }, async () => {
  const log: { sql: string; params: readonly unknown[] }[] = [];
  const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-220po-")), "cpg.sqlite") }, { onQuery: (sql, params) => (log.push({ sql, params }), sql) });
  await orm.migrator.up();
  await seed(orm);
  const e = orm.em.fork(); selectTenant(e, "prod");
  await new PurchaseOrderService({ em: e } as never).list({});
  log.length = 0;
  const e2 = orm.em.fork(); selectTenant(e2, "prod");
  await new PurchaseOrderService({ em: e2 } as never).list({});
  for (const q of [...log]) {
    const s = performance.now();
    await orm.em.getConnection().execute(q.sql, [...q.params]);
    const ms = Math.round(performance.now() - s);
    const planRows = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${q.sql}`, [...q.params]);
    out(`${ms} ms :: ${q.sql}\n    PLAN ${planRows.map((r) => r.detail).join(" | ")}`);
  }
  await orm.close();
});
```

</details>

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: indexes, migration and proof

- [x] 1.1 Declare the indexes and generate the migration — cb71a4f2
- [x] 1.2 Migration test — 81efb38a
- [x] 1.3 Plan test — 51dfa29b
- [x] 1.4 Record the timings — dd72e8b6

### Phase 2: paperwork

- [x] 2.1 File the follow-up issue and add the lesson — #236, see the lesson commit
- [ ] 2.2 Move the spec to implemented/ after #234 merges
