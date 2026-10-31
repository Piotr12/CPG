import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { initOrm, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { MRP_FIGURES } from "./mrp-run-view";

/*
 * The MRP report's reads (E18-S01) over a stored run at the realistic size (30 pairs, 2,700 daily rows)
 * and at ten times it (300 pairs at 10 locations, 27,000 rows). These absolute counts are the spec's
 * budget contract (`2026-10-31--0907UTC-mrp-report`, "Budget") and don't track the dataset. The run is
 * seeded with SQL: the report reads stored rows, so planning them is not what is measured.
 */
const SIZES = [
  { name: "realistic", pairs: 30, locations: 1, budgetMs: 100 },
  { name: "ten times", pairs: 300, locations: 10, budgetMs: 250 },
] as const;
/** The CI bound: far looser than the budget, which the printed figures are checked against when run alone. */
const CI_FACTOR = 6;
const RUNS = 3;
const DAYS = 90;
const INDEX = "mrp_daily_result_tenant_code_run_id_material_location_date_unique";

const seq = (count: number) => `with recursive s(x) as (select 1 union all select x + 1 from s where x < ${count})`;
const code = (n: string) => `printf('%08d', ${n})`;

/** Material `n` is planned at location `1 + n % locations`, as in `mrp-run-timing.test.ts`; its balance dips below zero on a day of its own. */
function seed({ pairs, locations }: (typeof SIZES)[number]): string[] {
  const figures = MRP_FIGURES.map((figure) => figure.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
  const value = (figure: string) =>
    figure === "projected_before" || figure === "projected_after" ? `case when d = m % ${DAYS} then '-1.500000' else '10.000000' end` : "'0.000000'";
  return [
    `${seq(pairs)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'm' || x, 'prod', ${code("x")}, 'finished', 'Product ' || x, 'each', 0 from s`,
    `${seq(locations)} insert into location (id, tenant_code, code, name, created_at) select 'l' || x, 'prod', ${code("x")}, 'Site ' || x, 0 from s`,
    `insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
      values ('run', 'prod', '00000001', 0, '2026-10-31', ${DAYS}, 'manual', 1, ${pairs}, 'anna-id', 'anna', 'ui')`,
    `${seq(pairs * DAYS)}, r(x, m, d) as (select x, 1 + (x - 1) / ${DAYS}, (x - 1) % ${DAYS} from s)
      insert into mrp_daily_result (id, tenant_code, run_id, material, location, date, ${figures.join(", ")})
      select 'r' || x, 'prod', 'run', ${code("m")}, ${code(`1 + m % ${locations}`)}, date('2026-10-31', '+' || d || ' days'), ${figures.map(value).join(", ")} from r`,
  ];
}

describe.each(SIZES)("the MRP report's reads at the $name size", (size) => {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  let orm: Orm;
  let container: AppContainer;
  const lastPage = Math.ceil(size.pairs / size.locations / 25);
  const reads: [string, Record<string, string>][] = [
    ["page 1, unfiltered", {}],
    ["by material", { material: "00000001" }],
    ["by location", { location: "00000001" }],
    ["by material and location", { material: "00000010", location: "00000001" }],
    ["the last page by location", { location: "00000001", page: String(lastPage) }],
  ];
  const latest = async (query: Record<string, string>) => (await scopeForTenant(container, "prod")).cradle.mrpRunService.latest(query);

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-report-reads-")) });
    await migrateDatabase(config);
    // No ANALYZE: production never runs it, so SQLite plans by the schema alone.
    orm = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    for (const statement of seed(size)) await orm.em.getConnection().execute(statement);
    container = createAppContainer(config, orm);
  }, 120_000);
  afterAll(async () => {
    await orm.close();
  });

  it.each(reads)("reads %s through the run's unique index, in its order, with no sort", async (_name, query) => {
    queries.length = 0;
    const report = await latest(query);
    expect(report.plans.length).toBeGreaterThan(0);
    const sent = queries.filter(({ sql }) => sql.includes("from `mrp_daily_result`"));
    // The page's rows, and the filtered count when a filter is set (lesson 2026-10-25, "EXPLAIN the query MikroORM really sends").
    expect(sent).toHaveLength(query.material || query.location ? 2 : 1);
    for (const { sql, params } of sent) {
      const plan = (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])).map(({ detail }) => detail);
      // The rows through the unique index's `(tenant, run)` prefix, plus `material` when filtered by it;
      // the count also joins its run, by key, for the tenant filter. Nothing walks the tenant.
      const rows = plan.filter((line) => line.startsWith("SEARCH m0 "));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatch(new RegExp(`^SEARCH m0 USING (COVERING )?INDEX ${INDEX} \\(tenant_code=\\? AND run_id=\\?${query.material ? " AND material=\\?" : ""}`));
      // A location without a material isn't in the index's prefix, so SQLite reads in material order and
      // sorts only the last terms, one material's few rows at a time: never the whole run.
      const sorts = query.location && !query.material && !sql.startsWith("select count") ? ["USE TEMP B-TREE FOR LAST TERM OF ORDER BY"] : [];
      expect(plan.filter((line) => line.includes("TEMP B-TREE"))).toEqual(sorts);
      for (const join of plan.filter((line) => !line.startsWith("SEARCH m0 ") && !line.includes("TEMP B-TREE"))) {
        expect(join).toMatch(/^SEARCH r1 USING INDEX sqlite_autoindex_mrp_run_1 \(id=\?\)$/);
      }
    }
  });

  it("answers every read within its budget, fastest of three", async () => {
    const figures: string[] = [];
    for (const [name, query] of reads) {
      let fastest = Infinity;
      for (let attempt = 0; attempt < RUNS; attempt += 1) {
        const started = performance.now();
        await latest(query);
        fastest = Math.min(fastest, performance.now() - started);
      }
      figures.push(`${name} ${fastest.toFixed(0)} ms`);
      expect(fastest, name).toBeLessThan(CI_FACTOR * size.budgetMs);
    }
    process.stdout.write(`MRP report reads, ${size.name} (${size.pairs} pairs, ${size.pairs * DAYS} daily rows), fastest of ${RUNS}: ${figures.join(", ")}\n`);
  }, 2 * reads.length * RUNS * CI_FACTOR * size.budgetMs + 60_000);
});
