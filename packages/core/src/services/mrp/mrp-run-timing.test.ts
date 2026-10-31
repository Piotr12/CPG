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
 * #277 adds Open production orders, each pinning its output's one revision of four components homed
 * at the same site, as a plant stocks what it consumes, and Open transfers from each material's home
 * to a hub, a third of them part-dispatched, with dates before the horizon and over it.
 */
const SIZES = [
  { name: "realistic", materials: 30, locations: 1, lines: 7_800, forecasts: 3_100, productionOrders: 40, transfers: 20, budgetMs: 1_000 },
  { name: "ten times", materials: 300, locations: 10, lines: 78_000, forecasts: 31_000, productionOrders: 400, transfers: 200, budgetMs: 5_000 },
] as const;
/** The lines of each material's one BOM revision (#277). */
const COMPONENTS = 4;
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

function seed({ materials, locations, lines, forecasts, productionOrders, transfers }: (typeof SIZES)[number]): string[] {
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
    `${seq(materials)} insert into bom (id, tenant_code, code, output_id, active, revision, created_at, version) select 'bom' || x, 'prod', ${code}, 'm' || x, 1, 1, 0, 1 from s`,
    `${seq(materials)} insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) select 'r' || x, 'prod', 'bom' || x, 1, 1, '2026-01-01', 0 from s`,
    `${seq(materials * COMPONENTS)} insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator)
      select 'bc' || x, 'prod', 'r' || (1 + (x - 1) / ${COMPONENTS}), 1 + (x - 1) % ${COMPONENTS},
        'm' || (1 + ((x - 1) / ${COMPONENTS} + (1 + (x - 1) % ${COMPONENTS}) * ${locations}) % ${materials}),
        '0.250000', '0.25', 'each', '1', '1' from s`,
    `${seq(productionOrders)} insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator,
        planned_start, planned_finish, lead_time_days, produced, abandoned, status, created_at, updated_at, version)
      select 'po' || x, 'prod', ${code}, 'm' || (1 + x % ${materials}), ${home(`1 + x % ${materials}`)}, 'r' || (1 + x % ${materials}), '100.000000', '100', 'each', '1', '1',
        date('2026-10-20', '+' || (x * 3 % 80) || ' days'), date('2026-10-25', '+' || (x * 3 % 80) || ' days'), 5, case when x % 3 = 0 then '40.000000' else '0.000000' end, '0.000000', 'open', 0, 0, 1 from s`,
    "insert into location (id, tenant_code, code, name, created_at) values ('hub', 'prod', '99999999', 'Hub', 0)",
    `${seq(transfers)} insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator,
        planned_dispatch, planned_arrival, dispatched, received, written_off, abandoned, status, created_at, updated_at, version)
      select 't' || x, 'prod', ${code}, 'm' || (1 + x % ${materials}), ${home(`1 + x % ${materials}`)}, 'hub', '50.000000', '50', 'each', '1', '1',
        date('2026-10-20', '+' || (x * 7 % 80) || ' days'), date('2026-10-22', '+' || (x * 7 % 80) || ' days'),
        case when x % 3 = 0 then '20.000000' else '0.000000' end, '0.000000', '0.000000', '0.000000', 'open', 0, 0, 1 from s`,
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
    const [{ n: rows }] = await orm.em.getConnection().execute<{ n: number }[]>("select count(*) as n from mrp_daily_result");
    const [{ pairs }] = await orm.em.getConnection().execute<{ pairs: number }[]>("select pairs from mrp_run order by code desc limit 1");
    const [{ figures }] = await orm.em.getConnection().execute<{ figures: number }[]>(
      "select count(*) as figures from mrp_daily_result where dependent_demand <> '0.000000' or transfer_out <> '0.000000' or transfer_in <> '0.000000'",
    );
    process.stdout.write(
      `MRP run, ${size.name} (${pairs} pairs, ${rows} daily rows, ${size.lines} order lines, ${size.productionOrders} production orders, ${size.transfers} transfers): ` +
        `${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`,
    );
    // Every material at its home, plus the hub for each transferred material that receives something (#277 Q9).
    expect(pairs).toBeGreaterThan(size.materials);
    expect(pairs).toBeLessThanOrEqual(size.materials + Math.min(size.transfers, size.materials));
    expect(rows).toBe(pairs * 90);
    expect(figures).toBeGreaterThan(0);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);
});
