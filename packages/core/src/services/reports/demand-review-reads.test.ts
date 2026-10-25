import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { initOrm, selectTenant, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DemandReviewService } from "./demand-review.service";

// The demand review's reads on ten times the realistic Test dataset (1,053 goods-issue lines, 988
// order lines, 120 forecasts, #240): each window query must start from its #240 index (lesson
// 2026-10-23: EXPLAIN the query MikroORM sends), and a whole read must stay well inside its budget.

const ISSUES = 10_530;
const ORDER_LINES = 9_880;
const FORECASTS = 1_200;
/**
 * The spec's budget is 300 ms per read at this size, checked on the figure this test prints when run
 * alone (158 ms for months on the author's machine, #240). The assertion is far looser: under the
 * parallel coverage run the same read took 815 ms locally, and CI runners are slower still.
 */
const CI_BOUND_MS = 3_000;

const seq = (count: number) => `with recursive s(x) as (select 1 union all select x + 1 from s where x < ${count})`;
const code = "printf('%08d', x)";
/** Two years of dates around today, in an order other than the IDs'. */
const spread = (step: number) => `date('2025-10-25', '+' || (x * ${step} % 730) || ' days')`;
const SEED = [
  `${seq(10)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'm' || x, 'prod', ${code}, 'finished', 'Product ' || x, 'each', 0 from s`,
  `${seq(10)} insert into material_conversion (id, tenant_code, material_id, unit, numerator, denominator) select 'c' || x, 'prod', 'm' || x, 'SU', '1', '1.5' from s`,
  "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'prod', '00000001', 'Plant', 0), ('l2', 'prod', '00000002', 'Store', 0)",
  "insert into customer (id, tenant_code, code, name, created_at) values ('k1', 'prod', '00000001', 'Retail', 0)",
  `${seq(ORDER_LINES)} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at)
    select 'o' || x, 'prod', ${code}, 'k1', 'l' || (1 + x % 2), 'open', 0, 0 from s`,
  `${seq(ORDER_LINES)} insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, fulfilled, status)
    select 'ol' || x, 'prod', 'o' || x, 0, 'm' || (1 + x % 10), '10.000000', '10', 'each', '1', '1', ${spread(7)},
      case when x % 2 = 0 then '10.000000' else '0.000000' end, case when x % 2 = 0 then 'completed' else 'open' end from s`,
  `${seq(ISSUES)} insert into shipment (id, tenant_code, code, order_id, planned_date, created_at) select 'sh' || x, 'prod', ${code}, 'o' || (1 + (x - 1) % ${ORDER_LINES}), '2026-01-01', 0 from s`,
  `${seq(ISSUES)} insert into shipment_line (id, tenant_code, shipment_id, position, order_line_id, quantity, entered_quantity, entered_unit, numerator, denominator)
    select 'sl' || x, 'prod', 'sh' || x, 0, 'ol' || (1 + (x - 1) % ${ORDER_LINES}), '5.000000', '5', 'each', '1', '1' from s`,
  `${seq(ISSUES)} insert into goods_issue (id, tenant_code, code, shipment_id, business_date, created_at) select 'gi' || x, 'prod', ${code}, 'sh' || x, ${spread(11)}, 0 from s`,
  `${seq(ISSUES)} insert into goods_issue_line (id, tenant_code, issue_id, position, shipment_line_id, quantity, entered_quantity, entered_unit, numerator, denominator)
    select 'gl' || x, 'prod', 'gi' || x, 0, 'sl' || x, '5.000000', '5', 'each', '1', '1' from s`,
  `${seq(ISSUES)} insert into stock_movement (id, tenant_code, posting_id, position, type, material_id, location_id, business_date, occurred_at, quantity, base_unit,
      entered_quantity, entered_unit, numerator, denominator, balance_before, balance_after, reason, actor_username, channel)
    select 'sm' || x, 'prod', 'gi' || x, 0, 'goods-issue', 'm' || (1 + (1 + (x - 1) % ${ORDER_LINES}) % 10), 'l' || (1 + (1 + (x - 1) % ${ORDER_LINES}) % 2), ${spread(11)}, 0,
      '-5.000000', 'each', '-5', 'each', '1', '1', '5.000000', '0.000000', 'x', 'seed', 'ui' from s`,
  `${seq(FORECASTS)} insert into forecast (id, tenant_code, material_id, location_id, date, quantity)
    select 'f' || x, 'prod', 'm' || (1 + (x - 1) % 10), 'l' || (1 + ((x - 1) / 10) % 2), date('2024-01-01', '+' || ((x - 1) / 20) || ' months'), '100.000000' from s`,
];

describe("the demand review's reads at ten times the realistic dataset", () => {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  let orm: Orm;
  const read = (query: Record<string, unknown>) => {
    const em = orm.em.fork();
    selectTenant(em, "prod");
    return new DemandReviewService({ em }).read(query);
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-demand-reads-")), "cpg.sqlite") }, {
      onQuery: (sql, params) => (queries.push({ sql, params }), sql),
    });
    await orm.migrator.up();
    // No ANALYZE: production never runs it, so SQLite plans by the schema alone.
    for (const statement of SEED) await orm.em.getConnection().execute(statement);
  });
  afterAll(async () => {
    vi.useRealTimers();
    await orm.close();
  });

  it.each([
    { table: "stock_movement", index: "stock_movement_tenant_code_type_business_date_index" },
    { table: "customer_order_line", index: "customer_order_line_tenant_code_required_date_index" },
    { table: "forecast", index: "forecast_tenant_code_date_index" },
  ])("reads $table for the window through $index", async ({ table, index }) => {
    queries.length = 0;
    await read({ bucket: "week" });
    const sent = queries.filter(({ sql }) => sql.includes(` from \`${table}\` as `));
    expect(sent).toHaveLength(1);
    const plan = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sent[0].sql}`, [...sent[0].params]);
    expect(plan.map(({ detail }) => detail).join("\n")).toContain(`USING INDEX ${index} (tenant_code=? AND `);
  });

  it.each(["day", "week", "month"])("reads every product per %s within the budget", async (bucket) => {
    // The fastest of three reads: a parallel test run (and coverage) slows a single one down.
    let fastest = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      const view = await read({ bucket });
      fastest = Math.min(fastest, performance.now() - started);
      expect(view.rows).toHaveLength(10);
    }
    process.stdout.write(`demand review, ${bucket} buckets, 10 products, 10x realistic: ${fastest.toFixed(0)} ms\n`);
    expect(fastest).toBeLessThan(CI_BOUND_MS);
  });
});
