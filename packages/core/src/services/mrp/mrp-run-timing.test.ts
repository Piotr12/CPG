import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { initOrm, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";

/*
 * An MRP run at the realistic Test dataset's size as #261 left it (30 materials at one location, 7,800
 * customer-order lines, 3,100 daily forecasts) and at ten times those counts. These absolute counts are
 * the spec's budget contract (`2026-10-27--0556UTC-mrp-runs`, Risks) and don't track the dataset. Each
 * material is stocked at one location and ordered there, so pairs scale with the materials; half the
 * lines are Open. Forecasts aren't read until E15-S01, which only has to extend this benchmark.
 *
 * Purchasing (#276, spec `2026-10-31--0905UTC-mrp-purchasing-supply`, Risks) is a chosen contract too,
 * well above the realistic dataset's: two lines per purchase order, a third of the orders Open, half the
 * requisitions Open, and at ten times also `fullOrders` Open orders of 100 lines, the most an order holds.
 */
const SIZES = [
  { name: "realistic", materials: 30, locations: 1, lines: 7_800, forecasts: 3_100, orders: 1_200, requisitions: 100, fullOrders: 0, budgetMs: 1_000 },
  { name: "ten times", materials: 300, locations: 10, lines: 78_000, forecasts: 31_000, orders: 12_000, requisitions: 1_000, fullOrders: 100, budgetMs: 5_000 },
] as const;
/** Lines per order of the plain purchase orders. */
const ORDER_LINES = 2;
/** Lines of each full purchase order. */
const FULL_ORDER_LINES = 100;
/** The spec's bound on the longest stretch a ten-times run keeps the event loop from reading sockets. */
const STALL_BUDGET_MS = 250;
/**
 * The CI bounds: the assertions are far looser than the budgets, which this test checks on the figures
 * it prints when run alone. Under the parallel coverage run on a CI runner a read took ~10× longer than
 * locally (lesson 2026-10-25, "A timing test's own bound must fail before Vitest's 5 s timeout").
 */
const CI_FACTOR = 6;
const RUNS = 3;
const NOW = new Date("2026-10-27T09:00:00.000Z");
const ACTOR: AuditActor = { userId: "planner-id", username: "planner", sessionId: null, channel: "ui", token: null };

const seq = (count: number) => `with recursive s(x) as (select 1 union all select x + 1 from s where x < ${count})`;
const code = "printf('%08d', x)";
/** Two years of dates around today, in an order other than the IDs'. */
const spread = (step: number) => `date('2025-10-27', '+' || (x * ${step} % 730) || ' days')`;

function seed({ materials, locations, lines, forecasts, orders, requisitions, fullOrders }: (typeof SIZES)[number]): string[] {
  /** Material `n` lives at location `1 + n % locations`. */
  const home = (material: string) => `'l' || (1 + (${material}) % ${locations})`;
  return [
    `${seq(materials)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'm' || x, 'prod', ${code}, 'finished', 'Product ' || x, 'each', 0 from s`,
    `${seq(locations)} insert into location (id, tenant_code, code, name, created_at) select 'l' || x, 'prod', ${code}, 'Site ' || x, 0 from s`,
    "insert into customer (id, tenant_code, code, name, created_at) values ('k1', 'prod', '00000001', 'Retail', 0)",
    `${seq(materials)} insert into stock_balance (id, tenant_code, material_id, location_id, quantity, version) select 'b' || x, 'prod', 'm' || x, ${home("x")}, '500.000000', 1 from s`,
    `${seq(lines)} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at)
      select 'o' || x, 'prod', ${code}, 'k1', ${home(`1 + x % ${materials}`)}, 'open', 0, 0 from s`,
    `${seq(lines)} insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, fulfilled, status)
      select 'ol' || x, 'prod', 'o' || x, 1, 'm' || (1 + x % ${materials}), '10.000000', '10', 'each', '1', '1', ${spread(7)},
        case when x % 2 = 0 then '10.000000' else '0.000000' end, case when x % 2 = 0 then 'completed' else 'open' end from s`,
    `${seq(forecasts)} insert into forecast (id, tenant_code, material_id, location_id, date, quantity)
      select 'f' || x, 'prod', 'm' || (1 + (x - 1) % ${materials}), ${home(`1 + (x - 1) % ${materials}`)}, date('2026-10-27', '+' || ((x - 1) / ${materials}) || ' days'), '5.000000' from s`,
    "insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'prod', '00000001', 'Mill', 0)",
    // Order `x` delivers material `1 + x % materials` to its home; every third plain order, and every full one, is Open.
    `${seq(orders + fullOrders)} insert into purchase_order (id, tenant_code, code, supplier_id, location_id, status, created_at, updated_at)
      select 'po' || x, 'prod', ${code}, 's1', ${home(`1 + x % ${materials}`)}, case when x % 3 = 0 or x > ${orders} then 'open' else 'completed' end, 0, 0 from s`,
    `${seq(orders * ORDER_LINES)} insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date, received, status)
      select 'pl' || x, 'prod', 'po' || o, 1 + (x - 1) % ${ORDER_LINES}, 'm' || (1 + o % ${materials}), '10.000000', '10', 'each', '1', '1', ${spread(3)},
        case when o % 3 = 0 then '0.000000' else '10.000000' end, case when o % 3 = 0 then 'open' else 'completed' end
      from (select x, 1 + (x - 1) / ${ORDER_LINES} as o from s)`,
    // `seq(0)` would still yield one row, so a size without full orders skips the statement.
    ...(fullOrders === 0 ? [] : [`${seq(fullOrders * FULL_ORDER_LINES)} insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date, status)
      select 'pf' || x, 'prod', 'po' || o, 1 + (x - 1) % ${FULL_ORDER_LINES}, 'm' || (1 + o % ${materials}), '10.000000', '10', 'each', '1', '1', ${spread(3)}, 'open'
      from (select x, ${orders} + 1 + (x - 1) / ${FULL_ORDER_LINES} as o from s)`]),
    `${seq(requisitions)} insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, status, created_at)
      select 'r' || x, 'prod', ${code}, 'm' || (1 + x % ${materials}), ${home(`1 + x % ${materials}`)}, '10.000000', '10', 'each', '1', '1', ${spread(5)},
        case when x % 2 = 0 then '0.000000' else '10.000000' end, case when x % 2 = 0 then 'open' else 'completed' end, 0 from s`,
  ];
}

describe.each(SIZES)("an MRP run at the $name size", (size) => {
  let orm: Orm;
  let run: () => Promise<unknown>;
  const testTimeout = 2 * RUNS * CI_FACTOR * size.budgetMs + 60_000;

  beforeAll(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-timing-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    // No ANALYZE: production never runs it, so SQLite plans by the schema alone.
    for (const statement of seed(size)) await orm.em.getConnection().execute(statement);
    const container = createAppContainer(config, orm);
    run = async () => {
      const { cradle } = await scopeForTenant(container, "prod");
      return inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ACTOR));
    };
  }, 120_000);
  afterAll(async () => {
    vi.useRealTimers();
    await orm.close();
  });

  it("stays within its budget, fastest of three, and never keeps the server from reading its sockets for long", async () => {
    let fastest = Infinity;
    let longestStall = 0;
    for (let attempt = 0; attempt < RUNS; attempt += 1) {
      // A heartbeat on the event loop: the longest gap between its ticks is how long the run kept every other request waiting.
      let last = performance.now();
      let running = true;
      const beat = () => {
        const now = performance.now();
        longestStall = Math.max(longestStall, now - last);
        last = now;
        if (running) setImmediate(beat);
      };
      setImmediate(beat);
      const started = performance.now();
      await run().finally(() => (running = false));
      fastest = Math.min(fastest, performance.now() - started);
    }
    const rows = await orm.em.getConnection().execute<{ n: number }[]>("select count(*) as n from mrp_daily_result");
    process.stdout.write(
      `MRP run, ${size.name} (${size.materials} pairs, ${size.materials * 90} daily rows, ${size.lines} order lines, ` +
        `${size.orders + size.fullOrders} purchase orders with ${size.orders * ORDER_LINES + size.fullOrders * FULL_ORDER_LINES} lines, ${size.requisitions} requisitions): ` +
        `${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`,
    );
    expect(rows).toEqual([{ n: size.materials * 90 }]);
    // The run counted the pipeline it read: some days carry tentative and dependable supply.
    const supplied = await orm.em
      .getConnection()
      .execute<{ tentative: number; dependable: number }[]>(
        "select sum(tentative_supply != '0.000000') as tentative, sum(dependable_supply != '0.000000') as dependable from mrp_daily_result",
      );
    expect(supplied[0].tentative).toBeGreaterThan(0);
    expect(supplied[0].dependable).toBeGreaterThan(0);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);
});
