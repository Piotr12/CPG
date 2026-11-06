import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { holdWriteGate, initOrm, MrpRecommendation, MrpRun, type MrpRunCreation, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { planMrp } from "../../domain/mrp/plan-mrp";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { MRP_BATCH_LIMIT } from "./mrp-batch.service";

/*
 * An MRP run at the realistic Test dataset's size as #261 left it (30 materials at one location, 7,800
 * customer-order lines, 3,100 daily forecasts) and at ten times those counts. These absolute counts are
 * the spec's budget contract (`2026-10-27--0556UTC-mrp-runs`, Risks) and don't track the dataset. Each
 * material is stocked at one location and ordered there, so pairs scale with the materials; half the
 * lines are Open, the other half Completed, and those of the forecasts' months consume them (#275).
 * Forecasts run daily from the first of today's month, and each pair has a safety target with one
 * change inside the horizon.
 *
 * Purchasing (#276, spec `2026-10-31--0905UTC-mrp-purchasing-supply`, Risks) is a chosen contract too,
 * well above the realistic dataset's: two lines per purchase order, a third of the orders Open, half the
 * requisitions Open, and at ten times also `fullOrders` Open orders of 100 lines, the most an order holds.
 *
 * #277 adds Open production orders, each pinning its output's one revision of four components homed
 * at the same site, as a plant stocks what it consumes, and Open transfers from each material's home
 * to a hub, a third of them part-dispatched, with dates before the horizon and over it.
 *
 * #278 gives every material a Buy set at its home with the worst-case lot rule for the rows written:
 * minimum 0 and multiple 0.000001, so each day whose balance falls below its target gets a proposal
 * of exactly its need. A second measurement adds, for each material at its home, an Open order line of
 * 1,000 due on every horizon day, which no receipt covers: each day of every material then gets a
 * proposal, the most recommendations a run can write beside its daily rows.
 *
 * #281 explodes Make proposals level by level. The materials are split in thirds: the top third is Make
 * at home with an active BOM of four components from the middle third, the middle third is Make too with
 * BOMs from the bottom third, and the bottom third is Buy, its BOMs inactive (production orders still pin
 * them). Every component is homed at its parent's site, so the run has two exploding levels and no new pair.
 *
 * #282 chooses each Make proposal's BOM by feasibility: every top-third material has a second, priority-2 BOM
 * of four other middle-third components, so its proposals test two candidates when the first is short. Every
 * open order line is of an even material, and its overdue ones count today, so an even component can supply
 * nothing; the middle third's odd materials hold 1,500 instead of 500. With one location an even output's
 * priority 1 has an even component and its priority 2 doesn't, so its proposals fall back and claim. With ten,
 * a component shares its output's home and so its parity: every proposal is provisional, the cached path. The
 * claim path's cost is bounded by #282's uncached measurement, which walked 90 days for every check.
 *
 * #283 gives each bottom-third revision, which only production orders pin, a fifth line of a retired, inactive
 * material no active BOM uses, so about a third of the production orders are at risk. A Make proposal no BOM
 * can supply is now a provisional action, stored apart from the recommendations, and a Make component is sized
 * a second time for its provisional demand.
 *
 * #369 makes a provisional parent's needs real demand when MRP can supply all it is short of. So that the second
 * sizing stays timed at scale (#376), each location has an unplanned part: no planning parameter set and no stock,
 * only an open requisition today larger than any need, so its projection never falls short and no exception stops
 * it. Every top-third priority-1 revision takes it as a fifth line at its parent's home. A proposal through that
 * revision is short of it, which MRP can't supply (`canSupply`), so a provisional one's needs stay provisional and
 * its middle-third components are sized a second time for them.
 */
const SIZES = [
  {
    name: "realistic", materials: 30, locations: 1, lines: 7_800, forecasts: 3_100, orders: 1_200, requisitions: 100, fullOrders: 0,
    productionOrders: 40, transfers: 20, budgetMs: 1_000,
  },
  {
    name: "ten times", materials: 300, locations: 10, lines: 78_000, forecasts: 31_000, orders: 12_000, requisitions: 1_000, fullOrders: 100,
    productionOrders: 400, transfers: 200, budgetMs: 5_000,
  },
] as const;
/** Lines per order of the plain purchase orders. */
const ORDER_LINES = 2;
/** Lines of each full purchase order. */
const FULL_ORDER_LINES = 100;
/** The lines of each material's one BOM revision (#277). */
const COMPONENTS = 4;
/** The codes of each location's unplanned part (#376) and of its requisition, apart from the masters' and documents' own. */
const UNPLANNED_CODE = "printf('9990%04d', x)";
/** Its requisition's quantity: more than every need its parents can explode into it, the worst case's included. */
const UNPLANNED_SUPPLY = 100_000_000;
/** The spec's bound on the longest stretch a ten-times run keeps the event loop from reading sockets. */
const STALL_BUDGET_MS = 250;
/** E19-S03 Q13: an automatic run on the realistic fixture, plan and batch together, and a batch of exactly the cap's candidates. */
const AUTOMATIC_BUDGET_MS = 3_000;
const BATCH_AT_CAP_BUDGET_MS = 15_000;
/** Production orders in the batch at the cap: the realistic automatic run's Make share of it (#320 Q10). */
const MAKE_AT_CAP = 525;
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

function seed({ materials, locations, lines, forecasts, orders, requisitions, fullOrders, productionOrders, transfers }: (typeof SIZES)[number]): string[] {
  /** A third of the materials: the levels of #281's BOMs. */
  const third = materials / 3;
  /** Material `n` lives at location `1 + n % locations`. */
  const home = (material: string) => `'l' || (1 + (${material}) % ${locations})`;
  return [
    `${seq(materials)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'm' || x, 'prod', ${code}, 'finished', 'Product ' || x, 'each', 0 from s`,
    `${seq(locations)} insert into location (id, tenant_code, code, name, created_at) select 'l' || x, 'prod', ${code}, 'Site ' || x, 0 from s`,
    "insert into customer (id, tenant_code, code, name, created_at) values ('k1', 'prod', '00000001', 'Retail', 0)",
    // Odd materials carry no open order line (below); since #282 the middle third's odd ones, components of the top
    // third's BOMs, hold enough stock to supply them.
    `${seq(materials)} insert into stock_balance (id, tenant_code, material_id, location_id, quantity, version)
      select 'b' || x, 'prod', 'm' || x, ${home("x")}, case when x % 2 = 1 and x > ${third} and x <= ${2 * third} then '1500.000000' else '500.000000' end, 1 from s`,
    `${seq(lines)} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at)
      select 'o' || x, 'prod', ${code}, 'k1', ${home(`1 + x % ${materials}`)}, 'open', 0, 0 from s`,
    `${seq(lines)} insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, fulfilled, status)
      select 'ol' || x, 'prod', 'o' || x, 1, 'm' || (1 + x % ${materials}), '10.000000', '10', 'each', '1', '1', ${spread(7)},
        case when x % 2 = 0 then '10.000000' else '0.000000' end, case when x % 2 = 0 then 'completed' else 'open' end from s`,
    `${seq(forecasts)} insert into forecast (id, tenant_code, material_id, location_id, date, quantity)
      select 'f' || x, 'prod', 'm' || (1 + (x - 1) % ${materials}), ${home(`1 + (x - 1) % ${materials}`)}, date('2026-10-01', '+' || ((x - 1) / ${materials}) || ' days'), '5.000000' from s`,
    `${seq(2 * materials)} insert into safety_stock_target (id, tenant_code, material_id, location_id, effective_from, quantity, version)
      select 't' || x, 'prod', 'm' || (1 + (x - 1) % ${materials}), ${home(`1 + (x - 1) % ${materials}`)},
        case when x <= ${materials} then '2026-01-01' else '2026-11-26' end, case when x <= ${materials} then '20.000000' else '40.000000' end, 1 from s`,
    `${seq(materials)} insert into planning_parameter_set (id, tenant_code, material_id, location_id, procurement, lead_time_days, minimum_quantity, lot_multiple, version)
      select 'pp' || x, 'prod', 'm' || x, ${home("x")}, case when x <= ${2 * third} then 'make' else 'buy' end, 3, '0.000000', '0.000001', 1 from s`,
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
    `${seq(materials)} insert into bom (id, tenant_code, code, output_id, active, revision, created_at, version)
      select 'bom' || x, 'prod', ${code}, 'm' || x, x <= ${2 * third}, 1, 0, 1 from s`,
    `${seq(materials)} insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) select 'rev' || x, 'prod', 'bom' || x, 1, 1, '2026-01-01', 0 from s`,
    // Parent `p` of third `k` takes components of the next third (the bottom third its own), each a multiple
    // of `locations` along so it shares the parent's home; the third is a multiple of `locations`.
    `${seq(materials * COMPONENTS)} insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator)
      select 'bc' || x, 'prod', 'rev' || p, 1 + c,
        'm' || (min(k + 1, 2) * ${third} + 1 + ((p - 1 - k * ${third}) + (c + (k = 2)) * ${locations}) % ${third}),
        '0.250000', '0.25', 'each', '1', '1'
      from (select x, p, c, (p - 1) / ${third} as k from (select x, 1 + (x - 1) / ${COMPONENTS} as p, (x - 1) % ${COMPONENTS} as c from s))`,
    // Each top-third output's priority-2 alternative (#282): four other middle-third components at the same home, an odd
    // number of homes along each, so with one location an even output's are all odd while its priority 1 mixes parities.
    `${seq(third)} insert into bom (id, tenant_code, code, output_id, active, revision, created_at, version)
      select 'bomb' || x, 'prod', printf('%08d', ${materials} + x), 'm' || x, 1, 1, 0, 1 from s`,
    `${seq(third)} insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) select 'revb' || x, 'prod', 'bomb' || x, 1, 2, '2026-01-01', 0 from s`,
    `${seq(third * COMPONENTS)} insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator)
      select 'bcb' || x, 'prod', 'revb' || p, 1 + c, 'm' || (${third} + 1 + ((p - 1) + (2 * c + 1) * ${locations}) % ${third}), '0.250000', '0.25', 'each', '1', '1'
      from (select x, 1 + (x - 1) / ${COMPONENTS} as p, (x - 1) % ${COMPONENTS} as c from s)`,
    `${seq(productionOrders)} insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator,
        planned_start, planned_finish, lead_time_days, produced, abandoned, status, created_at, updated_at, version)
      select 'mo' || x, 'prod', ${code}, 'm' || (1 + x % ${materials}), ${home(`1 + x % ${materials}`)}, 'rev' || (1 + x % ${materials}), '100.000000', '100', 'each', '1', '1',
        date('2026-10-20', '+' || (x * 3 % 80) || ' days'), date('2026-10-25', '+' || (x * 3 % 80) || ' days'), 5, case when x % 3 = 0 then '40.000000' else '0.000000' end, '0.000000', 'open', 0, 0, 1 from s`,
    // #283: a retired material on every bottom-third revision only, so the orders pinning those revisions are at risk.
    "insert into material (id, tenant_code, code, type, description, base_unit, active, created_at) values ('mx', 'prod', '99999998', 'raw', 'Retired', 'each', 0, 0)",
    `${seq(third)} insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator)
      select 'bcx' || x, 'prod', 'rev' || (${2 * third} + x), 1 + ${COMPONENTS}, 'mx', '0.250000', '0.25', 'each', '1', '1' from s`,
    // #376: each location's unplanned part, on every top-third priority-1 revision at its parent's home. Its requisition
    // is tentative supply, so it covers the part's projection but no feasibility test.
    `${seq(locations)} insert into material (id, tenant_code, code, type, description, base_unit, created_at) select 'mn' || x, 'prod', ${UNPLANNED_CODE}, 'raw', 'Unplanned part ' || x, 'each', 0 from s`,
    `${seq(locations)} insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, status, created_at)
      select 'rn' || x, 'prod', ${UNPLANNED_CODE}, 'mn' || x, 'l' || x, '${UNPLANNED_SUPPLY}.000000', '${UNPLANNED_SUPPLY}', 'each', '1', '1', '2026-10-27', '0.000000', 'open', 0 from s`,
    `${seq(third)} insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator)
      select 'bcn' || x, 'prod', 'rev' || x, 1 + ${COMPONENTS}, 'mn' || (1 + x % ${locations}), '0.250000', '0.25', 'each', '1', '1' from s`,
    "insert into location (id, tenant_code, code, name, created_at) values ('hub', 'prod', '99999999', 'Hub', 0)",
    `${seq(transfers)} insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator,
        planned_dispatch, planned_arrival, dispatched, received, written_off, abandoned, status, created_at, updated_at, version)
      select 'tr' || x, 'prod', ${code}, 'm' || (1 + x % ${materials}), ${home(`1 + x % ${materials}`)}, 'hub', '50.000000', '50', 'each', '1', '1',
        date('2026-10-20', '+' || (x * 7 % 80) || ' days'), date('2026-10-22', '+' || (x * 7 % 80) || ' days'),
        case when x % 3 = 0 then '20.000000' else '0.000000' end, '0.000000', '0.000000', '0.000000', 'open', 0, 0, 1 from s`,
  ];
}

describe.each(SIZES)("an MRP run at the $name size", (size) => {
  let orm: Orm;
  let run: () => Promise<unknown>;
  let engineOnly: () => Promise<number>;
  let accept: (run: string, proposal: string) => Promise<unknown>;
  let rolledBack: <T>(work: (cradle: AppContainer["cradle"]) => Promise<T>) => Promise<T>;
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
    // An accept plans the tenant again under the write gate (E19-S01 spec, Risks), as the wrappers run it.
    accept = async (runId, proposal) => {
      const { cradle } = await scopeForTenant(container, "prod");
      return inRequestTransaction(cradle.em, () => cradle.mrpAcceptanceService.accept(runId, proposal, ACTOR));
    };
    // Work timed in a transaction that is then rolled back, so every attempt starts from the same data (E19-S03).
    const ROLLBACK = new Error("roll back the timed work");
    rolledBack = async (work) => {
      const { cradle } = await scopeForTenant(container, "prod");
      let result!: Awaited<ReturnType<typeof work>>;
      await inRequestTransaction(cradle.em, async () => {
        result = await work(cradle);
        throw ROLLBACK;
      }).catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
      return result;
    };
    // The engine is one synchronous call, so its own time is a stall the heartbeat also counts (#275).
    engineOnly = async () => {
      const { cradle } = await scopeForTenant(container, "prod");
      const inputs = await cradle.mrpSnapshotService.load(NOW.toISOString().slice(0, 10));
      const started = performance.now();
      planMrp(inputs, NOW.toISOString().slice(0, 10));
      return performance.now() - started;
    };
  }, 120_000);
  afterAll(async () => {
    vi.useRealTimers();
    await orm.close();
  });

  /** The fastest of three runs, and the longest gap between event-loop ticks across them. */
  async function measure(work: (attempt: number) => Promise<unknown> = () => run()): Promise<{ fastest: number; longestStall: number }> {
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
      await work(attempt).finally(() => (running = false));
      fastest = Math.min(fastest, performance.now() - started);
    }
    return { fastest, longestStall };
  }
  const count = async (sql: string) => (await orm.em.getConnection().execute<{ n: number }[]>(sql))[0].n;

  it("stays within its budget, fastest of three, and never keeps the server from reading its sockets for long", async () => {
    const { fastest, longestStall } = await measure();
    const [{ n: rows }] = await orm.em.getConnection().execute<{ n: number }[]>("select count(*) as n from mrp_daily_result");
    const [{ pairs }] = await orm.em.getConnection().execute<{ pairs: number }[]>("select pairs from mrp_run order by code desc limit 1");
    const proposals = await count("select count(*) as n from mrp_recommendation");
    const exceptions = await count("select count(*) as n from mrp_run_exception");
    const made = await count("select count(*) as n from mrp_recommendation where kind = 'production-order'");
    const lines = await count("select count(*) as n from bom_component c join bom_revision r on r.id = c.revision_id join bom b on b.id = r.bom_id where b.active = 1");
    // #282: proposals planned through a priority-2 alternative, and provisional ones (one row each).
    const fallbacks = await count(`select count(*) as n from mrp_recommendation where bom > '${String(size.materials).padStart(8, "0")}'`);
    const provisional = await count("select count(*) as n from mrp_run_exception where exception_code = 'NO_FEASIBLE_BOM'");
    // #283: provisional actions, those sized for a provisional parent's need among them, and at-risk orders.
    const actions = await count("select count(*) as n from mrp_run_exception where exception_code = 'PROVISIONAL_PRODUCTION'");
    const driven = await count("select count(*) as n from mrp_run_exception where exception_code = 'PROVISIONAL_PRODUCTION' and details like '%provisional-demand%'");
    const atRisk = await count("select count(*) as n from mrp_run_exception where exception_code = 'AT_RISK_PRODUCTION'");
    // E18-S03: each fallback's rejected BOMs, one row per proposal that passed over a BOM.
    const rejections = await count("select count(*) as n from mrp_run_exception where exception_code = 'BOM_REJECTIONS'");
    // #380: the pairs with ranked shortages, one row each, ranked while the run writes them, so the ranking is inside the measured run.
    const shortages = await count("select count(*) as n from mrp_run_exception where exception_code = 'SHORTAGE'");
    const engine = await engineOnly();
    process.stdout.write(
      `MRP run, ${size.name} (${pairs} pairs, ${rows} daily rows, ${proposals} recommendations of which ${made} exploded, ${fallbacks} through a fallback BOM, ${provisional} No Feasible BOM, ` +
        `${actions} provisional actions of which ${driven} for a provisional parent, ${atRisk} at-risk orders, ${rejections} fallbacks explained, ${shortages} pairs with shortages, ${exceptions} mrp_run_exception rows, ${lines} active BOM lines, ` +
        `${size.lines} order lines, ${size.forecasts} forecasts, ` +
        `${size.orders + size.fullOrders} purchase orders with ${size.orders * ORDER_LINES + size.fullOrders * FULL_ORDER_LINES} lines, ${size.requisitions} requisitions, ` +
        `${size.productionOrders} production orders, ${size.transfers} transfers): ` +
        `${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms, planMrp alone ${engine.toFixed(0)} ms\n`,
    );
    const forecast = await orm.em.getConnection().execute<{ n: number }[]>("select count(*) as n from mrp_daily_result where forecast_demand <> '0.000000'");
    const safety = await orm.em.getConnection().execute<{ n: number }[]>("select count(*) as n from mrp_daily_result where safety_target = '40.000000'");
    expect(forecast[0].n).toBeGreaterThan(0);
    // Day 30, 26 November, through day 89, at each material's home.
    expect(safety).toEqual([{ n: size.materials * 60 }]);
    // Every material at its home, plus the hub for each transferred material that receives something (#277 Q9), plus each
    // location's unplanned part (#376).
    expect(pairs).toBeGreaterThan(size.materials + size.locations);
    expect(pairs).toBeLessThanOrEqual(size.materials + size.locations + Math.min(size.transfers, size.materials));
    expect(rows).toBe(pairs * 90);
    // Where demand outruns the stock and receipts, the run proposes (#278), and explodes its Make proposals (#281), executable or provisional (#283).
    expect(proposals).toBeGreaterThan(0);
    expect(made + actions).toBeGreaterThan(0);
    // Provisional output counts in no balance, so some requirements stay short after proposals: the run ranked and stored them (#380).
    expect(shortages).toBeGreaterThan(0);
    // The fixture's BOMs are acyclic, valid and usable, and every component has its parameters but the unplanned parts, which
    // never fall short (#376): no pair is stopped (#280, #281, #282). Counted by the codes meant, since the table also holds
    // transfers' and feasibility's exceptions and the warnings.
    expect(
      await count(
        "select count(*) as n from mrp_run_exception where exception_code in ('INVALID_UOM_CONVERSION', 'MISSING_PLANNING_PARAMETERS', 'MISSING_BOM', 'MISSING_USABLE_BOM', 'CYCLIC_BOM')",
      ),
    ).toBe(0);
    // Provisional proposals at both sizes, each a provisional action, and actions for their components' needs; with one
    // location also fallbacks, each an executable proposal claiming its components (above). At-risk orders at both sizes.
    expect(provisional).toBeGreaterThan(0);
    expect(actions).toBe(provisional + driven);
    expect(atRisk).toBeGreaterThan(0);
    // At ten times every top-third proposal is provisional through priority 1, short of the unplanned part, which MRP can't
    // supply (#369): its needs stay provisional and its Make components are sized a second time for them (E17-S03 Q6, #376).
    // With one location none is provisional, since each falls back to a feasible priority 2, and the run has no such action.
    expect(driven > 0).toBe(size.locations > 1);
    if (size.locations === 1) {
      expect(fallbacks).toBeGreaterThan(0);
      expect(made).toBeGreaterThan(0);
      // Every proposal through a priority-2 alternative passed over priority 1, so the run explains it (E18-S03).
      expect(rejections).toBeGreaterThanOrEqual(fallbacks);
    }
    // The run counted the pipeline it read: some days carry tentative and dependable supply, dependent demand and transfers.
    const supplied = await orm.em
      .getConnection()
      .execute<{ tentative: number; dependable: number; dependent: number; transfers: number }[]>(
        "select sum(tentative_supply != '0.000000') as tentative, sum(dependable_supply != '0.000000') as dependable, " +
          "sum(dependent_demand != '0.000000') as dependent, sum(transfer_out != '0.000000' or transfer_in != '0.000000') as transfers from mrp_daily_result",
      );
    expect(supplied[0].tentative).toBeGreaterThan(0);
    expect(supplied[0].dependable).toBeGreaterThan(0);
    expect(supplied[0].dependent).toBeGreaterThan(0);
    expect(supplied[0].transfers).toBeGreaterThan(0);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);

  it("accepts a Buy proposal, planning the tenant again, within the run's budget (E19-S01)", async () => {
    // One proposal of three different pairs of active masters: accepting one leaves the others as they were (spec Q2).
    const proposals = await orm.em.getConnection().execute<{ id: string; run: string }[]>(
      `select min(r.id) as id, m.code as run from mrp_recommendation r join mrp_run m on m.id = r.run_id
         join material t on t.code = r.material and t.tenant_code = r.tenant_code and t.active = 1
         join location l on l.code = r.location and l.tenant_code = r.tenant_code and l.active = 1
       where r.kind = 'purchase-requisition' and r.accepted_document is null group by r.material, r.location order by r.material, r.location limit ${RUNS}`,
    );
    expect(proposals).toHaveLength(RUNS);
    const before = await count("select count(*) as n from purchase_requisition where mrp_run is not null");

    const { fastest, longestStall } = await measure((attempt) => accept(proposals[attempt].run, proposals[attempt].id));

    process.stdout.write(`MRP accept, ${size.name}: ${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`);
    expect(await count("select count(*) as n from purchase_requisition where mrp_run is not null")).toBe(before + RUNS);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);

  // Only the realistic fixture plans feasible Make proposals: at ten times every Make need is provisional (#282's shape).
  it.runIf(size.locations === 1)("accepts a Make proposal, planning the tenant again, within the run's budget (#320 Q10)", async () => {
    // One feasible Make proposal of three different pairs of active masters, as for Buy above.
    const proposals = await orm.em.getConnection().execute<{ id: string; run: string }[]>(
      `select min(r.id) as id, m.code as run from mrp_recommendation r join mrp_run m on m.id = r.run_id
         join material t on t.code = r.material and t.tenant_code = r.tenant_code and t.active = 1
         join location l on l.code = r.location and l.tenant_code = r.tenant_code and l.active = 1
       where r.kind = 'production-order' and r.bom is not null and r.accepted_document is null group by r.material, r.location order by r.material, r.location limit ${RUNS}`,
    );
    expect(proposals).toHaveLength(RUNS);
    const before = await count("select count(*) as n from production_order where mrp_run is not null");

    const { fastest, longestStall } = await measure((attempt) => accept(proposals[attempt].run, proposals[attempt].id));

    process.stdout.write(`MRP accept of a Make proposal, ${size.name}: ${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`);
    expect(await count("select count(*) as n from production_order where mrp_run is not null")).toBe(before + RUNS);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);

  it("runs automatically, creating every Buy and Make proposal in one batch, within its budget (E19-S03 Q13, #320 Q10)", async () => {
    const outcomes: MrpRunCreation[] = [];
    let candidates = 0;
    let made = 0;
    const { fastest, longestStall } = await measure(async () => {
      const view = await rolledBack(async (cradle) => {
        const answer = await cradle.mrpRunService.run(ACTOR, { mode: "automatic" });
        // Counted inside the timed transaction: its run, not the committed one, is what the batch created from.
        candidates = await cradle.em.count(MrpRecommendation, {});
        made = await cradle.em.count(MrpRecommendation, { kind: "production-order" });
        return answer;
      });
      outcomes.push(view.creation!);
    });

    process.stdout.write(
      `MRP automatic run, ${size.name} (${candidates - made} Buy and ${made} Make proposals, outcome ${JSON.stringify(outcomes[0])}): ${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`,
    );
    // Rolled back, the three attempts planned the same data and came to the same outcome.
    expect(outcomes).toEqual([outcomes[0], outcomes[0], outcomes[0]]);
    expect(candidates).toBeGreaterThan(0);
    // The realistic fixture's feasible Make proposals join the batch (#320); at ten times every Make need is provisional.
    if (size.locations === 1) expect(made).toBeGreaterThan(0);
    if (size.locations === 1) {
      expect(outcomes[0]).toEqual({ status: "created", documents: candidates });
      expect(fastest).toBeLessThan(CI_FACTOR * AUTOMATIC_BUDGET_MS);
    }
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, 2 * RUNS * CI_FACTOR * BATCH_AT_CAP_BUDGET_MS);

  it("writes a recommendation for every day of every material in the worst case, and still stays within its budget (#278)", async () => {
    const execute = (sql: string) => orm.em.getConnection().execute(sql);
    const days = 90;
    await execute(`${seq(size.materials)} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at)
      select 'wo' || x, 'prod', printf('%08d', ${size.lines} + x), 'k1', 'l' || (1 + x % ${size.locations}), 'open', 0, 0 from s`);
    await execute(`${seq(size.materials * days)} insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, fulfilled, status)
      select 'wl' || x, 'prod', 'wo' || o, 1 + (x - 1) % ${days}, 'm' || o, '1000.000000', '1000', 'each', '1', '1', date('2026-10-27', '+' || ((x - 1) % ${days}) || ' days'), '0.000000', 'open'
      from (select x, 1 + (x - 1) / ${days} as o from s)`);
    const { fastest, longestStall } = await measure();
    const rows = await count("select count(*) as n from mrp_daily_result");
    const recommendations = await count("select count(*) as n from mrp_recommendation");
    // A Make proposal no BOM can supply is a provisional action since #283; those sized for a provisional parent's need come on top.
    const infeasible = await count("select count(*) as n from mrp_run_exception where exception_code = 'PROVISIONAL_PRODUCTION' and details not like '%provisional-demand%'");
    const proposals = recommendations + infeasible;
    const exceptions = await count("select count(*) as n from mrp_run_exception");
    process.stdout.write(
      `MRP run, worst case for proposals, ${size.name} (${rows} daily rows, ${recommendations} recommendations and ${infeasible} infeasible Make proposals, ${await count("select count(*) as n from mrp_run_exception where exception_code = 'SHORTAGE'")} pairs with shortages, ${exceptions} mrp_run_exception rows, ${size.lines + size.materials * days} order lines): ` +
        `${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms, planMrp alone ${(await engineOnly()).toFixed(0)} ms\n`,
    );
    // Every day but, for some materials, today: overdue purchase-order lines all land today and can cover it.
    expect(proposals).toBeGreaterThanOrEqual(size.materials * (days - 1));
    expect(proposals).toBeLessThanOrEqual(size.materials * days);
    expect(fastest).toBeLessThan(CI_FACTOR * size.budgetMs);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, testTimeout);

  // Ten times the worst case has more Buy proposals than the cap, so the batch at exactly the cap is timed there.
  it.runIf(size.locations > 1)("creates a batch of exactly the cap's candidates within its budget (E19-S03 Q13, Q15)", async () => {
    const execute = (sql: string) => orm.em.getConnection().execute(sql);
    // The worst case (above) left its run's recommendations, all Buy: every Make need there is provisional. Keep the first
    // Buy proposals of active masters, and since #320 add the realistic run's Make share (95 of 449, about 21%), one
    // production-order proposal per Make pair pinned to its active priority-1 BOM, whose components are all active.
    const made = MAKE_AT_CAP;
    await execute(`delete from mrp_recommendation where kind = 'production-order' or material = '99999998'`);
    await execute(`delete from mrp_recommendation where id not in (select id from mrp_recommendation order by material, location, need_date limit ${MRP_BATCH_LIMIT - made})`);
    await execute(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity, lead_time_days, bom, bom_revision)
      select 'mk' || m.id || d.day, 'prod', (select id from mrp_run order by code desc limit 1), m.code, l.code, 'production-order', d.day, '10.000000', p.lead_time_days, b.code, b.revision
      from planning_parameter_set p join material m on m.id = p.material_id join location l on l.id = p.location_id join bom b on b.id = 'bom' || substr(m.id, 2)
        cross join (select '2026-11-20' as day union all select '2026-11-21' union all select '2026-11-22') d
      where p.procurement = 'make' and b.active = 1 order by m.code, d.day limit ${made}`);
    expect(await count("select count(*) as n from mrp_recommendation")).toBe(MRP_BATCH_LIMIT);
    expect(await count("select count(*) as n from mrp_recommendation where kind = 'production-order'")).toBe(made);
    const outcomes: MrpRunCreation[] = [];

    const { fastest, longestStall } = await measure(async () => {
      const outcome = await rolledBack(async (cradle) => {
        await holdWriteGate(cradle.em);
        const run = await cradle.em.findOneOrFail(MrpRun, {}, { orderBy: { code: "desc" } });
        return cradle.mrpBatchService.createAll(run, ACTOR);
      });
      outcomes.push(outcome.creation);
    });

    process.stdout.write(`MRP automatic batch at the cap, ${size.name} (${MRP_BATCH_LIMIT - made} requisitions and ${made} production orders): ${fastest.toFixed(0)} ms fastest of ${RUNS}, longest event-loop stall ${longestStall.toFixed(0)} ms\n`);
    expect(outcomes[0]).toEqual({ status: "created", documents: MRP_BATCH_LIMIT });
    expect(fastest).toBeLessThan(CI_FACTOR * BATCH_AT_CAP_BUDGET_MS);
    expect(longestStall).toBeLessThan(CI_FACTOR * STALL_BUDGET_MS);
  }, 2 * RUNS * CI_FACTOR * BATCH_AT_CAP_BUDGET_MS);
});
