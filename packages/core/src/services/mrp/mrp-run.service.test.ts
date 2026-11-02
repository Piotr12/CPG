import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Bom, BomComponent, BomRevision, initOrm, isTenantOwned, Location, Material, MrpDailyResult, MrpRecommendation, MrpRun, MrpRunException, MRP_RECOMMENDATION_KINDS, ProductionOrder, Transfer, type MrpRecommendationKind, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { MRP_EXCEPTION_FALLBACK_MESSAGE, MRP_EXCEPTION_MESSAGES, mrpExceptionMessage } from "../../domain/mrp/exceptions/codes";
import { MRP_PROPOSAL_KINDS, type MrpProposalKind } from "../../domain/mrp/mrp-result";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { MRP_ROW_CHUNK, MRP_RUN_NOT_FOUND, MRP_RUN_SUPERSEDED } from "./mrp-run.service";
import { MRP_FIGURES, type MrpLatestView, type MrpRunView } from "./mrp-run-view";

// Thursday 1 October 2026: the horizon runs through 29 December.
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const BOT: AuditActor = { userId: "bot-id", username: "bot", sessionId: null, channel: "api", token: { id: "token-id", name: "planner" } };
const PLANT = "00000001";

let orm: Orm;
let container: AppContainer;
const scope = (tenant = "prod") => scopeForTenant(container, tenant);
/** A run as the write wrappers run it: inside one transaction on the scope's own `em`. */
const run = async (tenant = "prod", actor = ANNA): Promise<MrpRunView> => {
  const { cradle } = await scope(tenant);
  return inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(actor));
};
const latest = async (query: Record<string, unknown> = {}, tenant = "prod"): Promise<MrpLatestView> => (await scope(tenant)).cradle.mrpRunService.latest(query);
const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);
const rowsOf = (runId: string) => sql<{ n: number }>("select count(*) as n from mrp_daily_result r join mrp_run m on r.run_id = m.id where m.code = ? and m.tenant_code = 'prod'", [runId]);

async function material(tenant: string, description: string) {
  return (await scope(tenant)).cradle.materialService.create({ type: "finished", description, baseUnit: "each" }, ANNA);
}
async function location(tenant: string, name: string) {
  return (await scope(tenant)).cradle.locationService.create({ name }, ANNA);
}
async function stock(tenant: string, materialId: string, locationId: string, quantity: string) {
  await (await scope(tenant)).cradle.stockService.correct({ material: materialId, location: locationId, quantity, unit: "each", reason: "Count" }, ANNA);
}
async function order(tenant: string, locationId: string, lines: { material: string; quantity: string; requiredDate: string }[]) {
  return (await scope(tenant)).cradle.customerOrderService.create(
    { customer: "00000001", location: locationId, lines: lines.map((line) => ({ ...line, unit: "each" })) },
    ANNA,
  );
}
/** A planning parameter set at `locationId`: the API's six-decimal quantities, lead time 2 days. */
async function parameters(tenant: string, materialId: string, locationId: string, procurement: "make" | "buy", minimumQuantity: string, lotMultiple: string, leadTimeDays = 2) {
  await (await scope(tenant)).cradle.planningParameterService.create({ material: materialId, location: locationId, procurement, leadTimeDays, minimumQuantity, lotMultiple }, ANNA);
}
/** An active BOM of `output`, valid from 2026, made of a raw material of its own: a Make set may propose it (E16-S03). */
async function bom(tenant: string, output: string) {
  const { cradle } = await scope(tenant);
  const component = await cradle.materialService.create({ type: "raw", description: `Input of ${output}`, baseUnit: "each" }, ANNA);
  await cradle.bomService.create({ output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component.id, quantity: "1", unit: "each" }] }, ANNA);
  return component.id;
}
/** The stored day of one pair of a Prod run, by business IDs. */
async function day(runId: string, materialId: string, locationId: string, date: string) {
  const [row] = await sql(
    `select r.* from mrp_daily_result r join mrp_run m on r.run_id = m.id where m.tenant_code = 'prod' and m.code = ? and r.material = ? and r.location = ? and r.date = ?`,
    [runId, materialId, locationId, date],
  );
  return row;
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-run-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
  for (const tenant of ["prod", "test"]) {
    await (await scope(tenant)).cradle.customerService.create({ name: "Retail" }, ANNA);
    await location(tenant, "Plant");
  }
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await orm.close();
});

describe("MrpRunService.run", () => {
  it("plans every location of the tenant: 90 daily results for each planned pair, none omitted (MRP-001)", async () => {
    const cabinet = await material("prod", "Cabinet");
    const sites = [PLANT, (await location("prod", "Store")).id, (await location("prod", "Depot")).id];
    for (const [index, site] of sites.entries()) await order("prod", site, [{ material: cabinet.id, quantity: String(10 + index), requiredDate: "2026-10-10" }]);

    const view = await run();

    expect(view).toEqual({
      id: "00000001", createdAt: NOW, account: "anna", channel: "ui", mode: "manual", generation: 1,
      startDate: "2026-10-01", endDate: "2026-12-29", horizonDays: 90, pairs: 3, creation: null,
    });
    const stored = await sql<{ location: string; days: number; first: string; last: string }>(
      "select location, count(*) as days, min(date) as first, max(date) as last from mrp_daily_result group by location order by location",
    );
    expect(stored).toEqual(sites.map((site) => ({ location: site, days: 90, first: "2026-10-01", last: "2026-12-29" })));
    for (const [index, site] of sites.entries()) {
      expect(await day("00000001", cabinet.id, site, "2026-10-10")).toMatchObject({ firm_demand: `${10 + index}.000000`, projected_before: `-${10 + index}.000000` });
    }
  });

  it("plans one tenant only, and leaves the other tenant's latest run as it was (MRP-002, R05)", async () => {
    for (const tenant of ["prod", "test"]) await material(tenant, "Cabinet");
    await order("prod", PLANT, [{ material: "00000001", quantity: "40", requiredDate: "2026-10-12" }]);
    await order("test", PLANT, [{ material: "00000001", quantity: "70", requiredDate: "2026-10-12" }]);
    const testRun = await run("test");
    vi.setSystemTime(new Date("2026-10-01T10:00:00.000Z"));

    await run("prod");

    expect(await day("00000001", "00000001", PLANT, "2026-10-12")).toMatchObject({ tenant_code: "prod", firm_demand: "40.000000", projected_before: "-40.000000" });
    expect(await sql("select sum(firm_demand) as demand from mrp_daily_result where tenant_code = 'prod'")).toEqual([{ demand: 40 }]);
    expect((await latest({}, "test")).run).toEqual(testRun);
    expect(testRun.createdAt).toEqual(NOW);
    // Test unaffected: the Prod run's delete of superseded results reached none of Test's rows.
    expect(await sql("select count(*) as n from mrp_daily_result where tenant_code = 'test'")).toEqual([{ n: 90 }]);
    expect(await sql("select firm_demand from mrp_daily_result where tenant_code = 'test' and date = '2026-10-12'")).toEqual([{ firm_demand: "70.000000" }]);
    expect((await latest({}, "test")).plans[0].buckets[11]).toMatchObject({ date: "2026-10-12", firmDemand: "70.000000" });
  });

  it("stores a negative projection while physical stock stays put, and changes no stock, document or master (INV-008, MRP-008, R10)", async () => {
    const cabinet = await material("prod", "Cabinet");
    await stock("prod", cabinet.id, PLANT, "5");
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "20", requiredDate: "2026-10-05" }]);
    const before = await everyOtherTable();
    const audits = await sql<{ n: number }>("select count(*) as n from tenant_audit_event");

    await run();

    expect(await day("00000001", cabinet.id, PLANT, "2026-10-04")).toMatchObject({ projected_before: "5.000000", shortage: "0.000000" });
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-05")).toMatchObject({ firm_demand: "20.000000", projected_before: "-15.000000", projected_after: "-15.000000", shortage: "15.000000" });
    expect(await everyOtherTable()).toEqual(before);
    expect(await sql("select quantity from stock_balance")).toEqual([{ quantity: "5.000000" }]);
    const added = await sql("select action, subject_type, subject_id, subject_label, before, after, actor_username, channel from tenant_audit_event order by rowid desc limit ?", [1]);
    expect(await sql<{ n: number }>("select count(*) as n from tenant_audit_event")).toEqual([{ n: audits[0].n + 1 }]);
    expect(added).toEqual([{
      action: "mrp.mrp-run.created", subject_type: "MrpRun", subject_id: "00000001", subject_label: "00000001",
      before: null, after: JSON.stringify({ date: "2026-10-01", generation: 1 }), actor_username: "anna", channel: "ui",
    }]);
  });

  it("stores open production orders' output and component needs and open transfers' legs, changing no document (#277, R10)", async () => {
    const cabinet = await material("prod", "Cabinet");
    const steel = await (await scope()).cradle.materialService.create({ type: "raw", description: "Steel", baseUnit: "kg" }, ANNA);
    const store = await location("prod", "Store");
    await stock("prod", cabinet.id, PLANT, "50");
    await (await scope()).cradle.stockService.correct({ material: steel.id, location: PLANT, quantity: "100", unit: "kg", reason: "Count" }, ANNA);
    const { em } = (await scope()).cradle;
    const [output, input] = [await em.findOneOrFail(Material, { code: cabinet.id }), await em.findOneOrFail(Material, { code: steel.id })];
    const [plant, depot] = [await em.findOneOrFail(Location, { code: PLANT }), await em.findOneOrFail(Location, { code: store.id })];
    const revision = em.create(BomRevision, { bom: em.create(Bom, { code: "00000001", output, revision: 1 }), number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
    em.create(BomComponent, { revision, position: 1, material: input, quantity: "2.000000", enteredQuantity: "2", enteredUnit: "kg", numerator: "1", denominator: "1" });
    em.create(ProductionOrder, {
      code: "00000001", output, location: plant, recipe: revision, quantity: "10.000000", enteredQuantity: "10", enteredUnit: "each", numerator: "1", denominator: "1",
      plannedStart: "2026-10-05", plannedFinish: "2026-10-08", leadTimeDays: 3, produced: "4.000000",
    });
    em.create(Transfer, {
      code: "00000001", material: output, source: plant, destination: depot, quantity: "30.000000", enteredQuantity: "30", enteredUnit: "each", numerator: "1",
      denominator: "1", plannedDispatch: "2026-10-06", plannedArrival: "2026-10-07",
    });
    await em.flush();
    const before = await everyOtherTable();

    await run();

    expect(await day("00000001", steel.id, PLANT, "2026-10-05")).toMatchObject({ dependent_demand: "12.000000", projected_before: "88.000000" });
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-06")).toMatchObject({ transfer_out: "30.000000", projected_before: "20.000000" });
    expect(await day("00000001", cabinet.id, store.id, "2026-10-07")).toMatchObject({ transfer_in: "30.000000", projected_before: "30.000000" });
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-08")).toMatchObject({ dependable_supply: "6.000000", projected_before: "26.000000" });
    expect(await everyOtherTable()).toEqual(before);
  });

  it("stores a pair's forecast residual and its safety target on every day, and plans target-only and forecast-only pairs from zero (#275)", async () => {
    const cabinet = await material("prod", "Cabinet");
    const { cradle } = await scope();
    await cradle.forecastService.create({ material: cabinet.id, location: PLANT, date: "2026-10-10", quantity: "100", unit: "each" }, ANNA);
    await cradle.safetyStockTargetService.create({ material: cabinet.id, location: PLANT, effectiveFrom: "2026-09-01", quantity: "30" }, ANNA);
    // An order later in October consumes 60 of the forecast (D08).
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "60", requiredDate: "2026-10-20" }]);
    const target = await material("prod", "Shelf");
    await cradle.safetyStockTargetService.create({ material: target.id, location: PLANT, effectiveFrom: "2026-10-31", quantity: "5" }, ANNA);
    const forecastOnly = await material("prod", "Bracket");
    await cradle.forecastService.create({ material: forecastOnly.id, location: PLANT, date: "2026-11-02", quantity: "7", unit: "each" }, ANNA);

    expect((await run()).pairs).toBe(3);

    expect(await day("00000001", cabinet.id, PLANT, "2026-10-10")).toMatchObject({
      firm_demand: "0.000000", forecast_demand: "40.000000", safety_target: "30.000000", projected_before: "-40.000000", shortage: "40.000000",
    });
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-20")).toMatchObject({ firm_demand: "60.000000", forecast_demand: "0.000000", projected_before: "-100.000000" });
    expect(await sql("select count(*) as n from mrp_daily_result where material = ? and safety_target = '30.000000'", [cabinet.id])).toEqual([{ n: 90 }]);
    // A target-only pair is planned from zero: 0 before its target starts, 5 from 31 October.
    expect(await day("00000001", target.id, PLANT, "2026-10-30")).toMatchObject({ safety_target: "0.000000", projected_before: "0.000000" });
    expect(await day("00000001", target.id, PLANT, "2026-10-31")).toMatchObject({ safety_target: "5.000000", projected_before: "0.000000" });
    // A forecast-only pair is planned from zero too.
    expect(await day("00000001", forecastOnly.id, PLANT, "2026-11-02")).toMatchObject({ forecast_demand: "7.000000", projected_before: "-7.000000", shortage: "7.000000" });
  });

  it("counts an earlier residual of this month in today's row when it runs mid-month (D08)", async () => {
    vi.setSystemTime(new Date("2026-10-20T09:30:00.000Z"));
    const cabinet = await material("prod", "Cabinet");
    await (await scope()).cradle.forecastService.create({ material: cabinet.id, location: PLANT, date: "2026-10-05", quantity: "100", unit: "each" }, ANNA);
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "60", requiredDate: "2026-10-25" }]);

    expect(await run()).toMatchObject({ startDate: "2026-10-20", endDate: "2027-01-17" });

    expect(await day("00000001", cabinet.id, PLANT, "2026-10-20")).toMatchObject({ forecast_demand: "40.000000", projected_before: "-40.000000" });
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-25")).toMatchObject({ firm_demand: "60.000000", forecast_demand: "0.000000" });
  });

  it("stores a fractional negative balance with its sign outside the fraction", async () => {
    const cabinet = await material("prod", "Cabinet");
    await stock("prod", cabinet.id, PLANT, "4.5");
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "20", requiredDate: "2026-10-01" }]);

    await run();

    expect(await day("00000001", cabinet.id, PLANT, "2026-10-01")).toMatchObject({ projected_before: "-15.500000", shortage: "15.500000" });
    const { plans } = await latest();
    expect(plans[0].buckets[0]).toMatchObject({ date: "2026-10-01", firmDemand: "20.000000", projectedBefore: "-15.500000", projectedAfter: "-15.500000" });
  });

  it("numbers runs in sequence, and keeps the results of the latest run only (spec Q1)", async () => {
    const cabinet = await material("prod", "Cabinet");
    await stock("prod", cabinet.id, PLANT, "1");

    const first = await run();
    vi.setSystemTime(new Date("2026-10-01T11:00:00.000Z"));
    const second = await run("prod", BOT);

    expect([first.id, second.id]).toEqual(["00000001", "00000002"]);
    expect(second).toMatchObject({ account: "bot", channel: "api", createdAt: new Date("2026-10-01T11:00:00.000Z") });
    expect((await latest()).run).toEqual(second);
    expect(await rowsOf("00000001")).toEqual([{ n: 0 }]);
    expect(await rowsOf("00000002")).toEqual([{ n: 90 }]);
    expect(await sql("select code from mrp_run order by code")).toEqual([{ code: "00000001" }, { code: "00000002" }]);
  });

  it("stores the generation and the day it planned from, read when it runs", async () => {
    await sql("update tenant set generation = 7 where code = 'prod'");
    vi.setSystemTime(new Date("2026-12-15T23:59:00.000Z"));

    expect(await run()).toMatchObject({ generation: 7, startDate: "2026-12-15", endDate: "2027-03-14", pairs: 0 });
    expect(await sql("select count(*) as n from mrp_daily_result")).toEqual([{ n: 0 }]);
  });

  it("refuses a run once the tenant has used every eight-digit run ID", async () => {
    await sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
      values ('last', 'prod', '99999999', 0, '2026-09-30', 90, 'manual', 1, 0, 'anna-id', 'anna', 'ui')`);

    await expect(run()).rejects.toMatchObject({ code: "MRP_RUN_IDS_EXHAUSTED", status: 409 });
  });

  it("leaves no run, row or audit entry when a write fails after the first chunk was flushed", async () => {
    // More rows than one chunk, so a chunk is flushed before the failure.
    for (let index = 0; index < Math.ceil(MRP_ROW_CHUNK / 90) + 1; index += 1) {
      const product = await material("prod", `Product ${index}`);
      await stock("prod", product.id, PLANT, "1");
    }
    const audits = await sql("select id from tenant_audit_event order by id");
    const { cradle } = await scope();
    const flush = cradle.em.flush.bind(cradle.em);
    let flushes = 0;
    vi.spyOn(cradle.em, "flush").mockImplementation(async () => {
      flushes += 1;
      // The run and its audit entry, the first chunk, then the last rows fail.
      if (flushes === 3) throw new Error("disk full");
      return flush();
    });

    await expect(inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA))).rejects.toThrow("disk full");

    expect(flushes).toBe(3);
    expect(await sql("select count(*) as n from mrp_run")).toEqual([{ n: 0 }]);
    expect(await sql("select count(*) as n from mrp_daily_result")).toEqual([{ n: 0 }]);
    expect(await sql("select id from tenant_audit_event order by id")).toEqual(audits);
  });
});

describe("MrpRunService.latest", () => {
  it("says there is no run yet before the first one", async () => {
    await expect(latest()).rejects.toMatchObject({ code: "MRP_RUN_NOT_FOUND", message: MRP_RUN_NOT_FOUND, status: 404 });
  });

  it("pages the latest run by pair, 25 pairs at a time, by material then location, each with its 90 days in order", async () => {
    const store = (await location("prod", "Store")).id;
    for (let index = 0; index < 15; index += 1) {
      const product = await material("prod", `Product ${index}`);
      await stock("prod", product.id, store, "2");
      await stock("prod", product.id, PLANT, "1");
    }
    const view = await run();

    const first = await latest();
    const second = await latest({ page: "2", run: view.id });
    const past = await latest({ page: "3" });

    expect(first).toMatchObject({ run: view, page: 1, pageSize: 25, total: 30 });
    expect(first.plans).toHaveLength(25);
    expect(second.plans).toHaveLength(5);
    expect(past.plans).toEqual([]);
    const pairs = [...first.plans, ...second.plans].map(({ material, location }) => `${material}/${location}`);
    expect(pairs).toEqual([...pairs].sort());
    expect(pairs.slice(0, 2)).toEqual([`00000001/${PLANT}`, `00000001/${store}`]);
    expect(new Set(pairs).size).toBe(30);
    for (const plan of first.plans) {
      expect(plan.buckets.map(({ date }) => date)).toEqual(Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10)));
    }
    expect(Object.keys(first.plans[0].buckets[0])).toEqual(["date", ...MRP_FIGURES]);
    expect(first.plans[0].buckets[0]).toMatchObject({ projectedBefore: "1.000000", projectedAfter: "1.000000", shortage: "0.000000", forecastDemand: "0.000000" });
  });

  it("refuses a page of a run a newer one has replaced, so a client never mixes two runs", async () => {
    const first = await run();
    await run();

    await expect(latest({ run: first.id })).rejects.toMatchObject({ code: "MRP_RUN_SUPERSEDED", message: MRP_RUN_SUPERSEDED, status: 409, messageParams: { run: "00000001" } });
    expect((await latest({ run: "00000002" })).run.id).toBe("00000002");
    expect((await latest({ run: "00000002", generation: "1" })).run.id).toBe("00000002");
  });

  it("refuses a run of another dataset generation even under the same ID, as a Test reset restarts IDs (D06), and don't know a run past the latest", async () => {
    const first = await run("test");
    await sql("update tenant set generation = 2 where code = 'test'");
    await sql("delete from mrp_daily_result where tenant_code = 'test'");
    await sql("delete from mrp_run where tenant_code = 'test'");
    const restarted = await run("test");
    expect([first.id, first.generation, restarted.id, restarted.generation]).toEqual(["00000001", 1, "00000001", 2]);

    await expect(latest({ run: "00000001", generation: "1" }, "test")).rejects.toMatchObject({ code: "MRP_RUN_SUPERSEDED", status: 409, messageParams: { run: "00000001" } });
    await expect(latest({ run: "00000005", generation: "1" }, "test")).rejects.toMatchObject({ code: "MRP_RUN_SUPERSEDED", status: 409 });
    await expect(latest({ run: "00000005" }, "test")).rejects.toMatchObject({ code: "MRP_RUN_NOT_FOUND", message: MRP_RUN_NOT_FOUND, status: 404 });
    expect((await latest({ run: "00000001", generation: "2" }, "test")).run).toEqual(restarted);
  });

  it("keeps each day apart: demand on Monday and Wednesday are two stored days with their own balances, filtered to the pair (MRP-005)", async () => {
    const sheet = await material("prod", "Steel sheet");
    await stock("prod", sheet.id, PLANT, "50");
    await order("prod", PLANT, [
      { material: sheet.id, quantity: "10", requiredDate: "2026-10-05" },
      { material: sheet.id, quantity: "15", requiredDate: "2026-10-07" },
    ]);
    await run();

    const report = await latest({ material: sheet.id, location: PLANT });

    expect(report).toMatchObject({ total: 1, page: 1 });
    const [plan] = report.plans;
    const week = plan.buckets.filter(({ date }) => date >= "2026-10-05" && date <= "2026-10-07");
    expect(week.map(({ date, firmDemand, projectedBefore }) => ({ date, firmDemand, projectedBefore }))).toEqual([
      { date: "2026-10-05", firmDemand: "10.000000", projectedBefore: "40.000000" },
      { date: "2026-10-06", firmDemand: "0.000000", projectedBefore: "40.000000" },
      { date: "2026-10-07", firmDemand: "15.000000", projectedBefore: "25.000000" },
    ]);
    // Three stored rows, not a sum folded into one: what the report shows is what the run stored.
    for (const date of ["2026-10-05", "2026-10-06", "2026-10-07"]) expect(await day("00000001", sheet.id, PLANT, date)).toMatchObject({ date });
    expect(plan).toMatchObject({ lowestProjectedBefore: "25.000000", firstShortageDate: null });
  });

  it("names each plan's material and location, with their active flags, base unit and summary", async () => {
    const cabinet = await material("prod", "Cabinet");
    const depot = (await location("prod", "Depot")).id;
    await stock("prod", cabinet.id, depot, "5");
    await order("prod", depot, [{ material: cabinet.id, quantity: "20", requiredDate: "2026-10-04" }]);
    await run();
    // Planned by data whatever the flags (#274 Q5); the report says which records are inactive.
    await sql("update material set active = 0 where code = ? and tenant_code = 'prod'", [cabinet.id]);
    await sql("update location set active = 0 where code = ? and tenant_code = 'prod'", [depot]);

    const { plans } = await latest();

    expect(Object.keys(plans[0])).toEqual([
      "material", "materialDescription", "materialActive", "baseUnit", "location", "locationName", "locationActive", "lowestProjectedBefore", "firstShortageDate", "excess", "buckets", "proposals", "exceptions", "provisional", "marks",
    ]);
    expect(plans[0]).toMatchObject({
      material: cabinet.id, materialDescription: "Cabinet", materialActive: false, baseUnit: "each",
      location: depot, locationName: "Depot", locationActive: false,
      lowestProjectedBefore: "-15.000000", firstShortageDate: "2026-10-04", excess: "0.000000",
    });
  });

  it("filters by material, by location or both, counting and paging only the pairs they leave, by ID", async () => {
    const store = (await location("prod", "Store")).id;
    const products = [];
    for (let index = 0; index < 27; index += 1) products.push((await material("prod", `Product ${index}`)).id);
    // Stock posted in reverse ID order: the report's order comes from its own ORDER BY, whatever order the data arrived in.
    for (const product of [...products].reverse()) await stock("prod", product, store, "2");
    await stock("prod", products[0], PLANT, "1");
    const view = await run();
    expect(view.pairs).toBe(28);

    const byLocation = await latest({ location: store });
    const second = await latest({ location: store, page: "2", run: view.id, generation: "1" });
    expect(byLocation).toMatchObject({ total: 27, pageSize: 25 });
    expect(byLocation.plans.map((plan) => plan.material)).toEqual(products.slice(0, 25));
    expect(second.plans.map((plan) => `${plan.material}/${plan.location}`)).toEqual(products.slice(25).map((product) => `${product}/${store}`));
    expect(byLocation.plans.every((plan) => plan.location === store && plan.buckets.length === 90)).toBe(true);

    const byMaterial = await latest({ material: products[0] });
    expect(byMaterial.total).toBe(2);
    expect(byMaterial.plans.map((plan) => plan.location)).toEqual([PLANT, store]);

    const both = await latest({ material: products[0], location: PLANT });
    expect(both.total).toBe(1);
    expect(both.plans.map((plan) => [plan.material, plan.location, plan.buckets[0].projectedBefore])).toEqual([[products[0], PLANT, "1.000000"]]);

    expect(await latest({ material: "", location: "" })).toMatchObject({ total: 28 });
  });

  it("says a material or location this tenant doesn't have is not found, before looking for a run, the other tenant's included (R05)", async () => {
    const cabinet = await material("prod", "Cabinet");
    await expect(latest({ material: "99999999" })).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
    await expect(latest({ location: "99999999" })).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", status: 404 });
    await run("test");

    // Test numbers its own materials and has none: Prod's 00000001 is not Test's.
    await expect(latest({ material: cabinet.id }, "test")).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
    expect((await latest({ location: PLANT }, "test")).plans).toEqual([]);
  });

  it("leaves no plans for a material the tenant has but the run didn't plan", async () => {
    await material("prod", "Cabinet");
    const unplanned = await material("prod", "Shelf");
    await stock("prod", "00000001", PLANT, "3");
    await run();

    expect(await latest({ material: unplanned.id })).toMatchObject({ total: 0, plans: [] });
  });

  it("still refuses a filtered page of a run a newer one has replaced", async () => {
    const cabinet = await material("prod", "Cabinet");
    await stock("prod", cabinet.id, PLANT, "3");
    const first = await run();
    await run();

    await expect(latest({ material: cabinet.id, run: first.id })).rejects.toMatchObject({ code: "MRP_RUN_SUPERSEDED", status: 409 });
  });

  it.each([
    [{ page: "0" }, "page"],
    [{ page: "two" }, "page"],
    [{ run: "1" }, "run"],
    [{ generation: "1" }, "generation"],
    [{ run: "00000001", generation: "0" }, "generation"],
    [{ sort: "material" }, ""],
    [{ material: "12" }, "material"],
    [{ location: "plant" }, "location"],
  ])("refuses a malformed query %o", async (query, field) => {
    await run();

    await expect(latest(query)).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
    if (field) await expect(latest(query)).rejects.toHaveProperty(["fieldErrors", field]);
  });
});

describe("MrpRunService: replenishment proposals (#278)", () => {
  const recommendations = () =>
    sql("select m.code as run, r.material, r.location, r.kind, r.need_date, r.quantity, r.lead_time_days from mrp_recommendation r join mrp_run m on r.run_id = m.id order by m.code, r.material, r.location, r.need_date");
  /** A need on 5 October with the helper's lead time of 2 starts on 3 October, on time. */
  const onTime = { plannedStart: "2026-10-03", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false };

  it("stores a Buy and a Make proposal with their daily receipts, lists them with their plans, and keeps only the latest run's (MAT-016, R10)", async () => {
    const cabinet = await material("prod", "Cabinet");
    const store = (await location("prod", "Store")).id;
    await parameters("prod", cabinet.id, PLANT, "buy", "10.000000", "5.000000");
    await parameters("prod", cabinet.id, store, "make", "0.000000", "1.000000");
    const input = await bom("prod", cabinet.id);
    // The input on hand at the store makes the Make proposal feasible, so it is a proposal, not a provisional action (E17-S03).
    await stock("prod", input, store, "3");
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "3", requiredDate: "2026-10-05" }]);
    await order("prod", store, [{ material: cabinet.id, quantity: "3", requiredDate: "2026-10-05" }]);
    const before = await everyOtherTable();

    await run();

    expect(await everyOtherTable()).toEqual(before);
    expect(await recommendations()).toEqual([
      { run: "00000001", material: cabinet.id, location: PLANT, kind: "purchase-requisition", need_date: "2026-10-05", quantity: "10.000000", lead_time_days: 2 },
      { run: "00000001", material: cabinet.id, location: store, kind: "production-order", need_date: "2026-10-05", quantity: "3.000000", lead_time_days: 2 },
    ]);
    expect(await day("00000001", cabinet.id, PLANT, "2026-10-05")).toMatchObject({ proposed_receipts: "10.000000", projected_before: "-3.000000", projected_after: "7.000000", shortage: "3.000000" });
    expect(await day("00000001", cabinet.id, store, "2026-10-05")).toMatchObject({ proposed_receipts: "3.000000", projected_after: "0.000000" });
    const { plans } = await latest();
    const uuid = expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const none = { bom: null, bomRevision: null };
    expect(plans.map(({ material: item, location: site, proposals }) => [item, site, proposals])).toEqual([
      // Only a Buy proposal can be accepted until MRP chooses BOMs (E19-S01 Q1); neither is accepted yet.
      [cabinet.id, PLANT, [{ id: uuid, kind: "purchase-requisition", needDate: "2026-10-05", quantity: "10.000000", ...onTime, executable: true, document: null, ...none, rejectedBoms: [] }]],
      // The Make proposal names the BOM it is exploded through (#281, MRP-031)…
      // …and its first BOM passed over none (E18-S03).
      [cabinet.id, store, [{ id: uuid, kind: "production-order", needDate: "2026-10-05", quantity: "3.000000", ...onTime, executable: true, document: null, bom: "00000001", bomRevision: 1, rejectedBoms: [] }]],
      // …into its one input, planned at the store from its start, its stock covering the need.
      [input, store, []],
    ]);
    const [stored] = await sql<{ id: string }>("select id from mrp_recommendation where location = ?", [PLANT]);
    expect(plans[0].proposals[0].id).toBe(stored.id);
    await sql("update mrp_recommendation set accepted_document = '00000007' where id = ?", [stored.id]);
    expect((await latest()).plans[0].proposals[0]).toMatchObject({ id: stored.id, document: "00000007" });

    await run();
    expect((await recommendations()).map(({ run: code }) => code)).toEqual(["00000002", "00000002"]);
  });

  it("stores each proposal's lead time and lists a Late Supply and a Beyond Horizon proposal with their timing (#279, MRP-037, MRP-049)", async () => {
    const late = await material("prod", "Late");
    const far = await material("prod", "Far");
    await parameters("prod", late.id, PLANT, "buy", "0.000000", "1.000000", 7);
    await parameters("prod", far.id, PLANT, "buy", "0.000000", "1.000000", 120);
    await order("prod", PLANT, [
      { material: late.id, quantity: "5", requiredDate: "2026-10-04" },
      { material: far.id, quantity: "5", requiredDate: "2026-10-21" },
    ]);

    await run();

    expect((await recommendations()).map(({ material: item, need_date, lead_time_days }) => [item, need_date, lead_time_days])).toEqual([
      [late.id, "2026-10-04", 7],
      [far.id, "2026-10-21", 120],
    ]);
    const { plans } = await latest();
    const proposalOf = (item: string) => plans.find((plan) => plan.material === item)!.proposals;
    expect(proposalOf(late.id)).toEqual([
      { id: expect.any(String), kind: "purchase-requisition", needDate: "2026-10-04", quantity: "5.000000", plannedStart: "2026-10-01", plannedFinish: "2026-10-08", lateDays: 4, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] },
    ]);
    expect(proposalOf(far.id)).toEqual([
      { id: expect.any(String), kind: "purchase-requisition", needDate: "2026-10-21", quantity: "5.000000", plannedStart: "2026-10-01", plannedFinish: "2027-01-29", lateDays: 100, beyondHorizon: true, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] },
    ]);
    // The late receipt lands on its finish; the Beyond Horizon one in no stored day.
    expect(await day("00000001", late.id, PLANT, "2026-10-07")).toMatchObject({ proposed_receipts: "0.000000", projected_after: "-5.000000" });
    expect(await day("00000001", late.id, PLANT, "2026-10-08")).toMatchObject({ proposed_receipts: "5.000000", projected_after: "0.000000" });
    const [farReceipts] = await sql(
      "select count(*) as days from mrp_daily_result r join mrp_run m on r.run_id = m.id where m.code = '00000001' and r.material = ? and r.proposed_receipts <> '0.000000'",
      [far.id],
    );
    expect(farReceipts).toEqual({ days: 0 });
  });

  it("reads a row an older image wrote without a lead time as on time, finishing on its need date", async () => {
    const cabinet = await material("prod", "Cabinet");
    await parameters("prod", cabinet.id, PLANT, "buy", "0.000000", "1.000000", 9);
    await order("prod", PLANT, [{ material: cabinet.id, quantity: "3", requiredDate: "2026-10-05" }]);
    await run();
    // An older image's insert names no lead time and gets the column's default, 0 (the migration test).
    await sql("update mrp_recommendation set lead_time_days = 0");
    const { plans } = await latest();
    expect(plans[0].proposals).toEqual([
      { id: expect.any(String), kind: "purchase-requisition", needDate: "2026-10-05", quantity: "3.000000", plannedStart: "2026-10-05", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] },
    ]);
  });

  it("lists each page's proposals only, when a page ends between two locations of one material, and filtered by location", async () => {
    const store = (await location("prod", "Store")).id;
    for (let index = 0; index < 13; index += 1) {
      const product = await material("prod", `Product ${index}`);
      await stock("prod", product.id, store, "2");
      await stock("prod", product.id, PLANT, "1");
    }
    // Pair 25, the last on page 1, is 00000013 at the plant; its store pair opens page 2.
    for (const site of [PLANT, store]) {
      await parameters("prod", "00000013", site, "buy", "0.000000", "1.000000");
      await order("prod", site, [{ material: "00000013", quantity: site === PLANT ? "4" : "9", requiredDate: "2026-10-07" }]);
    }
    await run();

    const first = await latest();
    const second = await latest({ page: "2" });
    const proposalsOf = (view: MrpLatestView) => view.plans.filter(({ proposals }) => proposals.length > 0).map(({ material: item, location: site, proposals }) => [item, site, proposals.map(({ quantity }) => quantity)]);

    expect(proposalsOf(first)).toEqual([["00000013", PLANT, ["3.000000"]]]);
    expect(first.plans.at(-1)).toMatchObject({ material: "00000013", location: PLANT });
    expect(proposalsOf(second)).toEqual([["00000013", store, ["7.000000"]]]);
    expect(proposalsOf(await latest({ location: store }))).toEqual([["00000013", store, ["7.000000"]]]);
    expect((await latest({ material: "00000001" })).plans.every(({ proposals }) => proposals.length === 0)).toBe(true);
  });

  it("names the proposal kinds the engine sizes, and no other", () => {
    expect(MRP_RECOMMENDATION_KINDS).toEqual(MRP_PROPOSAL_KINDS);
    expectTypeOf<MrpRecommendationKind>().toEqualTypeOf<MrpProposalKind>();
  });
});

describe("MrpRunService: BOM explosion (#281)", () => {
  const typed = async (type: "finished" | "intermediate" | "raw", description: string) =>
    (await scope()).cradle.materialService.create({ type, description, baseUnit: "each" }, ANNA);
  const recipe = async (output: string, components: Record<string, string>) =>
    (await scope()).cradle.bomService.create(
      { output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: Object.entries(components).map(([material, quantity]) => ({ material, quantity, unit: "each" })) },
      ANNA,
    );

  it("MRP-027, MRP-031, MRP-047: stores F's and I's provisional actions apart from R's requisition, each level on its parent's start, with their BOM and revision", async () => {
    const f = await typed("finished", "Cabinet");
    const i = await typed("intermediate", "Frame");
    const r = await typed("raw", "Steel");
    const fBom = await recipe(f.id, { [i.id]: "2" });
    const iBom = await recipe(i.id, { [r.id]: "0.5" });
    await parameters("prod", f.id, PLANT, "make", "0.000000", "0.000001", 2);
    await parameters("prod", i.id, PLANT, "make", "0.000000", "0.000001", 3);
    await parameters("prod", r.id, PLANT, "buy", "0.000000", "0.000001", 1);
    await order("prod", PLANT, [{ material: f.id, quantity: "10", requiredDate: "2026-10-21" }]);

    await run();

    // Nothing is on hand, so F and I can't execute: only R's requisition is a recommendation, and nothing can accept F or I.
    expect(await sql("select material, kind, need_date, quantity, bom, bom_revision from mrp_recommendation order by material")).toEqual([
      { material: r.id, kind: "purchase-requisition", need_date: "2026-10-16", quantity: "10.000000", bom: null, bom_revision: null },
    ]);
    expect(await sql("select exception_code as code, material, date, details from mrp_run_exception where exception_code = 'PROVISIONAL_PRODUCTION' order by position")).toEqual([
      {
        code: "PROVISIONAL_PRODUCTION", material: f.id, date: "2026-10-21",
        details: JSON.stringify({ quantity: "10.000000", leadTimeDays: "2", bom: fBom.id, bomRevision: "1", components: `${i.id} 20.000000`, blockers: "no-feasible-bom", missing: `${fBom.id}/1: ${i.id} 20.000000 0.000000 20.000000`, order: `${fBom.id}/1` }),
      },
      {
        code: "PROVISIONAL_PRODUCTION", material: i.id, date: "2026-10-19",
        details: JSON.stringify({ quantity: "20.000000", leadTimeDays: "3", bom: iBom.id, bomRevision: "1", components: `${r.id} 10.000000`, blockers: "no-feasible-bom,provisional-demand", missing: `${iBom.id}/1: ${r.id} 10.000000 0.000000 10.000000`, order: `${iBom.id}/1` }),
      },
    ]);
    expect(await day("00000001", i.id, PLANT, "2026-10-19")).toMatchObject({ dependent_demand: "20.000000", projected_before: "-20.000000", proposed_receipts: "0.000000", projected_after: "-20.000000" });
    expect(await day("00000001", f.id, PLANT, "2026-10-21")).toMatchObject({ proposed_receipts: "0.000000", projected_after: "-10.000000" });
    expect(await day("00000001", r.id, PLANT, "2026-10-16")).toMatchObject({ dependent_demand: "10.000000", projected_before: "-10.000000" });
    const { plans } = await latest();
    expect(plans.map(({ material: item, proposals, provisional }) => [item, proposals.map(({ kind }) => kind), provisional])).toEqual([
      [f.id, [], [{
        kind: "production-order", needDate: "2026-10-21", quantity: "10.000000", plannedStart: "2026-10-19", plannedFinish: "2026-10-21", lateDays: 0, beyondHorizon: false,
        bom: fBom.id, bomRevision: 1, components: [{ material: i.id, quantity: "20.000000" }], blockers: ["no-feasible-bom"], missing: `${fBom.id}/1: ${i.id} 20.000000 0.000000 20.000000`,
        order: `${fBom.id}/1`,
        // The same rejection, structured (E18-S03): the API's and the screen's one shape.
        rejectedBoms: [{ bom: fBom.id, revision: 1, reason: "shortage", shortages: [{ material: i.id, required: "20.000000", available: "0.000000", shortage: "20.000000" }] }],
      }]],
      [i.id, [], [expect.objectContaining({ needDate: "2026-10-19", plannedStart: "2026-10-16", bom: iBom.id, components: [{ material: r.id, quantity: "10.000000" }], blockers: ["no-feasible-bom", "provisional-demand"] })]],
      [r.id, ["purchase-requisition"], []],
    ]);
    // Provisional rows are never listed as exceptions or marks.
    expect(plans.flatMap(({ exceptions }) => exceptions.map(({ code }) => code))).toEqual(["NO_FEASIBLE_BOM"]);
    expect(plans.flatMap(({ marks }) => marks)).toEqual([]);
  });

  it("MRP-028: a cycle written around the BOM service is stored as BOM Cycle on both members with its path, they get no proposal, and the rest plans", async () => {
    const x = await typed("intermediate", "Left");
    const y = await typed("intermediate", "Right");
    const other = await typed("intermediate", "Other");
    const xBom = await recipe(x.id, { [y.id]: "1" });
    await bom("prod", other.id);
    // The service refuses Y's recipe (R04, BOM-024), so it is written that way, as a restore could.
    const { em } = (await scope()).cradle;
    const [output, input] = [await em.findOneOrFail(Material, { code: y.id }), await em.findOneOrFail(Material, { code: x.id })];
    const revision = em.create(BomRevision, { bom: em.create(Bom, { code: "00000009", output, revision: 1 }), number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
    em.create(BomComponent, { revision, position: 1, material: input, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1" });
    await em.flush();
    for (const item of [x, y, other]) await parameters("prod", item.id, PLANT, "make", "0.000000", "1.000000");
    await order("prod", PLANT, [
      { material: x.id, quantity: "3", requiredDate: "2026-10-10" },
      { material: y.id, quantity: "3", requiredDate: "2026-10-10" },
      { material: other.id, quantity: "3", requiredDate: "2026-10-10" },
    ]);

    await run();

    const path = (from: string, via: string, to: string, back: string) => `${from} →(BOM ${via}) ${to} →(BOM ${back}) ${from}`;
    // Other's own input has no stock or parameters, so Other is provisional (No Feasible BOM, #282, stored apart since #283)
    // and its input adds Missing Planning Parameters: Other exploded, X and Y didn't.
    expect(await sql("select e.exception_code as code from mrp_run_exception e where e.material = ? order by e.position", [other.id])).toEqual([{ code: "NO_FEASIBLE_BOM" }, { code: "PROVISIONAL_PRODUCTION" }]);
    expect(await sql("select e.exception_code as code, e.material, e.details from mrp_run_exception e where e.exception_code = 'CYCLIC_BOM' order by e.position")).toEqual([
      { code: "CYCLIC_BOM", material: x.id, details: JSON.stringify({ path: path(x.id, xBom.id, y.id, "00000009") }) },
      { code: "CYCLIC_BOM", material: y.id, details: JSON.stringify({ path: path(y.id, "00000009", x.id, xBom.id) }) },
    ]);
    expect(await sql("select material from mrp_recommendation")).toEqual([]);
    const listed = (await latest()).plans.find(({ material: item }) => item === y.id)!.exceptions;
    expect(listed).toEqual([{ code: "CYCLIC_BOM", message: MRP_EXCEPTION_MESSAGES.CYCLIC_BOM, params: { material: y.id, location: PLANT, path: path(y.id, "00000009", x.id, xBom.id) } }]);
  });
});

describe("MrpRunService: planning exceptions (#280)", () => {
  const exceptions = () =>
    sql("select m.code as run, e.position, e.exception_code as code, e.material, e.location, e.date, e.details from mrp_run_exception e join mrp_run m on e.run_id = m.id order by m.code, e.position");
  const listed = (view: MrpLatestView) => view.plans.filter((plan) => plan.exceptions.length > 0).map(({ material: item, location: site, exceptions: list }) => [item, site, list]);

  it("MRP-036: a corrupt quantity written around the services makes the run complete with Invalid UoM Conversion for that material, stored and listed, and B still plans its proposal", async () => {
    const a = await material("prod", "Cabinet");
    const b = await material("prod", "Shelf");
    await parameters("prod", a.id, PLANT, "buy", "0.000000", "1.000000");
    await parameters("prod", b.id, PLANT, "buy", "10.000000", "5.000000");
    const written = await order("prod", PLANT, [
      { material: a.id, quantity: "3", requiredDate: "2026-10-05" },
      { material: b.id, quantity: "3", requiredDate: "2026-10-05" },
    ]);
    await sql("update customer_order_line set quantity = '3,5' where material_id = (select id from material where code = ? and tenant_code = 'prod')", [a.id]);

    await run();

    expect(await exceptions()).toEqual([
      { run: "00000001", position: 0, code: "INVALID_UOM_CONVERSION", material: a.id, location: PLANT, date: null, details: JSON.stringify({ record: "customer-order-line", document: `${written.id}/0` }) },
    ]);
    const { plans } = await latest();
    const params = { material: a.id, location: PLANT, record: "customer-order-line", document: `${written.id}/0` };
    expect(plans.map(({ material: item, proposals, exceptions: list }) => [item, proposals.map(({ quantity }) => quantity), list])).toEqual([
      [a.id, [], [{ code: "INVALID_UOM_CONVERSION", message: MRP_EXCEPTION_MESSAGES.INVALID_UOM_CONVERSION, params }]],
      [b.id, ["10.000000"], []],
    ]);
  });

  it("stores the same exceptions in the same positions on every run of the same data, replacing the previous run's (PRD §04 Invocation)", async () => {
    const a = await material("prod", "Cabinet");
    const store = (await location("prod", "Store")).id;
    await parameters("prod", a.id, store, "make", "0.000000", "1.000000");
    await order("prod", PLANT, [{ material: a.id, quantity: "3", requiredDate: "2026-10-05" }]);
    await order("prod", store, [{ material: a.id, quantity: "2", requiredDate: "2026-10-06" }]);

    await run();
    const first = await exceptions();
    await run();
    const second = await exceptions();

    expect(first.map(({ position, code, location: site, date, details }) => [position, code, site, date, details])).toEqual([
      [0, "MISSING_PLANNING_PARAMETERS", PLANT, "2026-10-05", JSON.stringify({ reason: "no-set" })],
      [1, "MISSING_BOM", store, "2026-10-06", null],
    ]);
    expect(second).toEqual(first.map((row) => ({ ...row, run: "00000002" })));
    expect(listed(await latest())).toEqual([
      [a.id, PLANT, [{ code: "MISSING_PLANNING_PARAMETERS", message: MRP_EXCEPTION_MESSAGES.MISSING_PLANNING_PARAMETERS, params: { material: a.id, location: PLANT, date: "2026-10-05", reason: "no-set" } }]],
      [a.id, store, [{ code: "MISSING_BOM", message: MRP_EXCEPTION_MESSAGES.MISSING_BOM, params: { material: a.id, location: store, date: "2026-10-06" } }]],
    ]);
    // Filtered by location, only that pair's exceptions are listed.
    expect(listed(await latest({ location: store })).map(([, site]) => site)).toEqual([store]);
  });

  it("stores an Insufficient Transfer Stock exception and lists it on its source's plan, its quantities as six-decimal texts (#277)", async () => {
    const a = await material("prod", "Cabinet");
    const store = (await location("prod", "Store")).id;
    await stock("prod", a.id, PLANT, "6");
    await parameters("prod", a.id, PLANT, "buy", "0.000000", "1.000000");
    await parameters("prod", a.id, store, "buy", "0.000000", "1.000000");
    const { cradle } = await scope();
    const created = await cradle.transferService.create({ material: a.id, source: PLANT, destination: store, quantity: "10", unit: "each", plannedDispatch: "2026-10-03", plannedArrival: "2026-10-04" }, ANNA);

    await run();

    expect(listed(await latest())).toEqual([
      [a.id, PLANT, [{
        code: "INSUFFICIENT_TRANSFER_STOCK",
        message: MRP_EXCEPTION_MESSAGES.INSUFFICIENT_TRANSFER_STOCK,
        params: { material: a.id, location: PLANT, date: "2026-10-03", transfer: created.id, destination: store, planned: "10.000000", available: "6.000000" },
      }]],
    ]);
  });

  it("stores overdue supply as warnings after the exceptions, and never lists them as exceptions, so the pair keeps its proposals (E18-S02, spec Q1)", async () => {
    const a = await material("prod", "Cabinet");
    const store = (await location("prod", "Store")).id;
    await stock("prod", a.id, PLANT, "6");
    await parameters("prod", a.id, PLANT, "buy", "0.000000", "1.000000");
    await parameters("prod", a.id, store, "buy", "0.000000", "1.000000");
    const { cradle } = await scope();
    await cradle.transferService.create({ material: a.id, source: PLANT, destination: store, quantity: "10", unit: "each", plannedDispatch: "2026-10-03", plannedArrival: "2026-10-04" }, ANNA);
    await cradle.supplierService.create({ name: "Timber" }, ANNA);
    const po = await cradle.purchaseOrderService.create({ supplier: "00000001", location: store, lines: [{ material: a.id, quantity: "4.5", unit: "each", plannedDate: "2026-09-28" }] }, ANNA);
    await order("prod", store, [{ material: a.id, quantity: "20", requiredDate: "2026-10-08" }]);

    await run();

    const rows = await exceptions();
    expect(rows.map(({ position, code, location: site, date, details }) => [position, code, site, date, details])).toEqual([
      [0, "INSUFFICIENT_TRANSFER_STOCK", PLANT, "2026-10-03", expect.any(String)],
      [1, "OVERDUE_SUPPLY", store, "2026-10-01", JSON.stringify({ source: "purchase-order", document: po.id, position: "1", plannedDate: "2026-09-28", quantity: "4.500000" })],
    ]);
    const { plans } = await latest();
    const atStore = plans.find((plan) => plan.location === store)!;
    expect(atStore.exceptions).toEqual([]);
    expect(atStore.proposals.map(({ quantity }) => quantity)).toEqual(["10.000000"]);
    expect(listed(await latest()).map(([, site, list]) => [site, (list as { code: string }[]).map(({ code }) => code)])).toEqual([[PLANT, ["INSUFFICIENT_TRANSFER_STOCK"]]]);
  });

  it("lists a stored code this image doesn't know with the fallback message, as after a rollback (spec Q7)", async () => {
    const a = await material("prod", "Cabinet");
    await stock("prod", a.id, PLANT, "1");
    await run();
    await sql(`insert into mrp_run_exception (id, tenant_code, run_id, position, exception_code, material, location, date, details)
      select 'x1', 'prod', id, 0, 'A_LATER_CODE', ?, ?, null, null from mrp_run where tenant_code = 'prod'`, [a.id, PLANT]);
    expect(listed(await latest())).toEqual([[a.id, PLANT, [{ code: "A_LATER_CODE", message: MRP_EXCEPTION_FALLBACK_MESSAGE, params: { material: a.id, location: PLANT } }]]]);
  });

  it("neither lists nor marks a warning row it can't read, such as one without a date or details (E18-S02)", async () => {
    const a = await material("prod", "Cabinet");
    await stock("prod", a.id, PLANT, "1");
    await run();
    await sql(`insert into mrp_run_exception (id, tenant_code, run_id, position, exception_code, material, location, date, details)
      select 'x1', 'prod', id, 0, 'OVERDUE_SUPPLY', ?, ?, null, null from mrp_run where tenant_code = 'prod'`, [a.id, PLANT]);
    const [plan] = (await latest()).plans;
    expect(plan).toMatchObject({ material: a.id, exceptions: [], marks: [] });
  });
});

describe("MrpRunService: weeks and marks (#285)", () => {
  /**
   * The issue's UX-018 run on Thursday 1 October 2026, at the Store: a purchase-order line of 30 planned
   * for 28 September, 25 in transit due 30 September, and a need of 5 on the 4th, three days ahead, with
   * a 7-day lead time: a proposal starting today and finishing on the 8th, 4 days late (MRP-037).
   */
  async function ux018() {
    const cabinet = await material("prod", "Cabinet");
    const store = (await location("prod", "Store")).id;
    const { cradle } = await scope();
    await cradle.supplierService.create({ name: "Timber" }, ANNA);
    const po = await cradle.purchaseOrderService.create({ supplier: "00000001", location: store, lines: [{ material: cabinet.id, quantity: "30", unit: "each", plannedDate: "2026-09-28" }] }, ANNA);
    const { em } = cradle;
    em.create(Transfer, {
      code: "00000001", material: await em.findOneOrFail(Material, { code: cabinet.id }), source: await em.findOneOrFail(Location, { code: PLANT }),
      destination: await em.findOneOrFail(Location, { code: store }), quantity: "25.000000", enteredQuantity: "25", enteredUnit: "each", numerator: "1", denominator: "1",
      plannedDispatch: "2026-09-29", plannedArrival: "2026-09-30", dispatched: "25.000000",
    });
    await em.flush();
    await parameters("prod", cabinet.id, store, "buy", "0.000000", "1.000000", 7);
    await order("prod", store, [{ material: cabinet.id, quantity: "60", requiredDate: "2026-10-04" }]);
    return { cabinet: cabinet.id, store, po: po.id };
  }

  it("UX-018: marks the overdue PO line and transfer on 1 October with their own dates, and the late proposal on its need date, filtered to the pair", async () => {
    const { cabinet, store, po } = await ux018();
    await run();

    const [plan] = (await latest({ material: cabinet, location: store })).plans;

    expect(plan.marks).toEqual([
      { kind: "overdue-supply", date: "2026-10-01", source: "purchase-order", document: po, position: 1, plannedDate: "2026-09-28", quantity: "30.000000" },
      { kind: "overdue-transfer", date: "2026-10-01", transfer: "00000001", stage: "in-transit", plannedDate: "2026-09-30", quantity: "25.000000" },
      { kind: "late-supply", date: "2026-10-04", proposal: plan.proposals[0].id, plannedFinish: "2026-10-08", lateDays: 4, quantity: "5.000000" },
    ]);
    // The need's own date is unchanged; the warnings aren't exceptions, and the pair keeps its proposal.
    expect(plan.proposals.map(({ needDate }) => needDate)).toEqual(["2026-10-04"]);
    expect(plan.exceptions).toEqual([]);
    expect(plan.buckets[0]).toMatchObject({ date: "2026-10-01", dependableSupply: "30.000000", transferIn: "25.000000" });
  });

  it("MRP-049: marks a Beyond Horizon proposal (100-day lead time, need 15 October, finish 9 January 2027) and adds it to no day", async () => {
    const far = await material("prod", "Far");
    await parameters("prod", far.id, PLANT, "buy", "0.000000", "1.000000", 100);
    await order("prod", PLANT, [{ material: far.id, quantity: "40", requiredDate: "2026-10-15" }]);
    await run();

    const [plan] = (await latest({ material: far.id, bucket: "week" })).plans;

    expect(plan.marks).toEqual([{ kind: "beyond-horizon", date: "2026-10-15", proposal: plan.proposals[0].id, plannedFinish: "2027-01-09", lateDays: 86, quantity: "40.000000" }]);
    expect(plan.buckets.every(({ proposedReceipts }) => proposedReceipts === "0.000000")).toBe(true);
    expect(plan.weeks!.every(({ proposedReceipts }) => proposedReceipts === "0.000000")).toBe(true);
    expect(plan.weeks!.find(({ week }) => week === 42)!.marks).toEqual(plan.marks);
  });

  it("#322: stores a requisition its lead time can't meet as a Late Requisition warning, marked on its required date and in its week", async () => {
    const sugar = await material("prod", "Sugar");
    await parameters("prod", sugar.id, PLANT, "buy", "0.000000", "1.000000", 3);
    const requisition = await (await scope()).cradle.purchaseRequisitionService.create({ material: sugar.id, location: PLANT, quantity: "5", unit: "each", requiredDate: "2026-10-02" }, ANNA);
    await run();

    const [plan] = (await latest({ material: sugar.id, bucket: "week" })).plans;

    const mark = { kind: "late-requisition", date: "2026-10-02", document: requisition.id, plannedDate: "2026-10-02", plannedFinish: "2026-10-04", lateDays: 2, quantity: "5.000000" };
    expect(plan.marks).toEqual([mark]);
    expect(plan.weeks![0].marks).toEqual([mark]);
    // A warning, never an exception: the requisition still counts on its own date.
    expect(plan.exceptions).toEqual([]);
    expect(plan.buckets[1]).toMatchObject({ date: "2026-10-02", tentativeSupply: "5.000000" });
    const rows = await sql<{ details: string }>("select details from mrp_run_exception where exception_code = 'LATE_REQUISITION'");
    expect(rows.map(({ details }) => JSON.parse(details))).toEqual([{ document: requisition.id, plannedDate: "2026-10-02", plannedFinish: "2026-10-04", lateDays: "2", quantity: "5.000000" }]);
  });

  it("folds each plan into weeks only when asked, with the same marks, and says which view it read", async () => {
    const { cabinet, store } = await ux018();
    await run();

    const daily = await latest({ material: cabinet, location: store });
    const weekly = await latest({ material: cabinet, location: store, bucket: "week" });

    expect(daily.bucket).toBe("day");
    expect(daily.plans[0]).not.toHaveProperty("weeks");
    expect(weekly.bucket).toBe("week");
    const weeks = weekly.plans[0].weeks!;
    expect(weeks.map(({ start, end, week, partial }) => [start, end, week, partial]).slice(0, 2)).toEqual([["2026-10-01", "2026-10-04", 40, true], ["2026-10-05", "2026-10-11", 41, false]]);
    expect(weeks).toHaveLength(14);
    expect(weeks[0]).toMatchObject({ firmDemand: "60.000000", dependableSupply: "30.000000", transferIn: "25.000000", projectedBefore: "-5.000000", lowestProjectedBefore: "-5.000000", peakShortage: "5.000000" });
    expect(weeks[0].marks.map(({ kind }) => kind)).toEqual(["overdue-supply", "overdue-transfer", "late-supply"]);
    expect(weeks.slice(1).every(({ marks }) => marks.length === 0)).toBe(true);
  });

  it("MRP-006: a weekly read changes nothing, so the daily rows, the run's ID and time read the same before and after", async () => {
    const { cabinet } = await ux018();
    await run();
    const tables = async () => ({ ...(await everyOtherTable()), runs: await sql("select * from mrp_run order by code"), rows: await sql("select * from mrp_daily_result order by rowid"), audit: await sql("select count(*) as n from tenant_audit_event") });
    const before = await latest({ material: cabinet });
    const stored = await tables();

    await latest({ material: cabinet, bucket: "week" });

    const after = await latest({ material: cabinet });
    expect(after).toEqual(before);
    expect(after.run).toEqual(before.run);
    expect(await tables()).toEqual(stored);
  });

  it("#336: reads a plan whose balance sums needs past what one entry may hold, by day and by week (R03)", async () => {
    const bulk = await material("prod", "Bulk");
    // Two lines of 999,999,999,999 each: a need no single entry may carry (12 integer digits).
    await order("prod", PLANT, [{ material: bulk.id, quantity: "999999999999", requiredDate: "2026-10-07" }]);
    await order("prod", PLANT, [{ material: bulk.id, quantity: "999999999999", requiredDate: "2026-10-07" }]);
    await run();
    expect(await day("00000001", bulk.id, PLANT, "2026-10-07")).toMatchObject({ projected_before: "-1999999999998.000000" });

    const [daily] = (await latest({ material: bulk.id })).plans;
    const [weekly] = (await latest({ material: bulk.id, bucket: "week" })).plans;

    expect(daily).toMatchObject({ lowestProjectedBefore: "-1999999999998.000000", firstShortageDate: "2026-10-07" });
    expect(daily.buckets.find(({ date }) => date === "2026-10-07")).toMatchObject({ firmDemand: "1999999999998.000000", projectedBefore: "-1999999999998.000000" });
    expect(weekly.weeks!.find(({ week }) => week === 41)).toMatchObject({
      start: "2026-10-05", end: "2026-10-11", firmDemand: "1999999999998.000000",
      projectedBefore: "-1999999999998.000000", lowestProjectedBefore: "-1999999999998.000000", peakShortage: "1999999999998.000000",
    });
  });

  it("refuses a view that isn't a day or a week", async () => {
    await run();
    await expect(latest({ bucket: "month" })).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
  });
});

/** Every row of every tenant-owned table but the MRP tables and the tenant audit, read raw. */
async function everyOtherTable() {
  const skipped = new Set([MrpRun.meta.className, MrpDailyResult.meta.className, MrpRecommendation.meta.className, MrpRunException.meta.className, "TenantAuditEvent"]);
  const result: Record<string, unknown> = {};
  for (const meta of orm.getMetadata().getAll().values()) {
    if (!isTenantOwned(meta) || skipped.has(meta.className)) continue;
    result[meta.tableName] = await sql(`select * from "${meta.tableName}" order by rowid`);
  }
  return result;
}

describe("MrpRunService: BOM choice (#282)", () => {
  const typed = async (type: "finished" | "intermediate" | "raw", description: string) =>
    (await scope()).cradle.materialService.create({ type, description, baseUnit: "each" }, ANNA);
  const recipe = async (output: string, components: Record<string, string>, priority = 1) =>
    (await scope()).cradle.bomService.create(
      { output, priority, validFrom: "2026-01-01", validThrough: null, components: Object.entries(components).map(([material, quantity]) => ({ material, quantity, unit: "each" })) },
      ANNA,
    );
  const deactivate = async (materialId: string) => {
    const { cradle } = await scope();
    const { version } = await cradle.materialService.get(materialId);
    await inRequestTransaction(cradle.em, () => cradle.materialService.update(materialId, { active: false }, version, ANNA));
  };

  it("LFC-025, LFC-026: R deactivated through MaterialService makes F's only BOM unusable: Missing Usable BOM is stored and listed, F and R get no proposal, and U still plans", async () => {
    const f = await typed("finished", "Cabinet");
    const r = await typed("raw", "Retired steel");
    const u = await typed("raw", "Unrelated");
    const fBom = await recipe(f.id, { [r.id]: "1" });
    await parameters("prod", f.id, PLANT, "make", "0.000000", "0.000001");
    await parameters("prod", r.id, PLANT, "buy", "0.000000", "0.000001");
    await parameters("prod", u.id, PLANT, "buy", "0.000000", "0.000001");
    await order("prod", PLANT, [
      { material: f.id, quantity: "5", requiredDate: "2026-10-21" },
      { material: u.id, quantity: "3", requiredDate: "2026-10-21" },
    ]);
    // Allowed while only BOMs use R (E10-S05, #191).
    await deactivate(r.id);

    await run();

    const inactive = `${fBom.id}/1: ${r.id}`;
    expect(await sql("select exception_code as code, material, date, details from mrp_run_exception order by position")).toEqual([
      { code: "MISSING_USABLE_BOM", material: f.id, date: "2026-10-21", details: JSON.stringify({ inactive }) },
    ]);
    expect((await sql<{ material: string }>("select material from mrp_recommendation")).map(({ material: item }) => item)).toEqual([u.id]);
    const listed = (await latest()).plans.find(({ material: item }) => item === f.id)!;
    expect(listed.proposals).toEqual([]);
    expect(listed.exceptions).toEqual([
      {
        code: "MISSING_USABLE_BOM", message: mrpExceptionMessage("MISSING_USABLE_BOM"), params: { material: f.id, location: PLANT, date: "2026-10-21", inactive },
        // LFC-026 explained (E18-S03): the only BOM, rejected for its inactive R.
        rejectedBoms: [{ bom: fBom.id, revision: 1, reason: "inactive-component", materials: [r.id] }],
      },
    ]);
    expect((await latest()).plans.some(({ material: item }) => item === r.id)).toBe(false);
  });

  it("LFC-025, MRP-050: with a priority-2 BOM of active S beside it, F plans through that one while R is inactive, and the run explains the rejected priority 1", async () => {
    const f = await typed("finished", "Cabinet");
    const r = await typed("raw", "Retired steel");
    const s = await typed("raw", "Aluminium");
    const rBom = await recipe(f.id, { [r.id]: "1" });
    const sBom = await recipe(f.id, { [s.id]: "1" }, 2);
    await parameters("prod", f.id, PLANT, "make", "0.000000", "0.000001");
    await stock("prod", s.id, PLANT, "10");
    await order("prod", PLANT, [{ material: f.id, quantity: "5", requiredDate: "2026-10-21" }]);
    await deactivate(r.id);

    await run();

    expect(await sql("select material, bom from mrp_recommendation")).toEqual([{ material: f.id, bom: sBom.id }]);
    // The fallback's rejection is stored on the proposal's need date, never as an exception (E18-S03 spec Q1).
    expect(await sql("select exception_code as code, material, date, details from mrp_run_exception")).toEqual([
      { code: "BOM_REJECTIONS", material: f.id, date: "2026-10-21", details: JSON.stringify({ missing: "", inactive: `${rBom.id}/1: ${r.id}`, order: `${rBom.id}/1` }) },
    ]);
    const listed = (await latest()).plans.find(({ material: item }) => item === f.id)!;
    expect(listed.proposals).toMatchObject([{ bom: sBom.id, bomRevision: 1, rejectedBoms: [{ bom: rBom.id, revision: 1, reason: "inactive-component", materials: [r.id] }] }]);
    expect(listed.exceptions).toEqual([]);
    expect(listed.marks).toEqual([]);
  });

  it("UX-020, MRP-025: stores a fallback's rejected priority 1 after every exception and provisional row, and lists it on the proposal with its exact shortage", async () => {
    const f = await typed("finished", "Cake");
    const a = await typed("raw", "Sugar");
    const b = await typed("raw", "Honey");
    const g = await typed("finished", "Tart");
    const c = await typed("raw", "Flour");
    const p1 = await recipe(f.id, { [a.id]: "1" });
    const p2 = await recipe(f.id, { [b.id]: "1" }, 2);
    const gBom = await recipe(g.id, { [c.id]: "1" });
    // F's lot multiple of 2 lifts 4.1 to 6, with 5 A dependable: priority 1 is short 1 A, priority 2 has its 6 B.
    await parameters("prod", f.id, PLANT, "make", "0.000000", "2.000000");
    await parameters("prod", g.id, PLANT, "make", "0.000000", "0.000001");
    await stock("prod", a.id, PLANT, "5");
    await stock("prod", b.id, PLANT, "6");
    // G has no C at all, so it is a provisional action with No Feasible BOM, and C has no planning parameters.
    await order("prod", PLANT, [{ material: f.id, quantity: "4.1", requiredDate: "2026-10-21" }, { material: g.id, quantity: "2", requiredDate: "2026-10-21" }]);

    await run();

    expect(await sql("select material, bom from mrp_recommendation")).toEqual([{ material: f.id, bom: p2.id }]);
    // The fallback's row follows every exception and provisional row, so each keeps its position (spec Q1).
    expect(await sql("select exception_code as code, material, date from mrp_run_exception order by position")).toEqual([
      { code: "NO_FEASIBLE_BOM", material: g.id, date: "2026-10-21" },
      { code: "MISSING_PLANNING_PARAMETERS", material: c.id, date: "2026-10-19" },
      { code: "PROVISIONAL_PRODUCTION", material: g.id, date: "2026-10-21" },
      { code: "BOM_REJECTIONS", material: f.id, date: "2026-10-21" },
    ]);
    const { plans } = await latest();
    const cake = plans.find(({ material: item }) => item === f.id)!;
    expect(cake.proposals).toMatchObject([{
      kind: "production-order", needDate: "2026-10-21", quantity: "6.000000", bom: p2.id, bomRevision: 1,
      rejectedBoms: [{ bom: p1.id, revision: 1, reason: "shortage", shortages: [{ material: a.id, required: "6.000000", available: "5.000000", shortage: "1.000000" }] }],
    }]);
    // Never an exception or a mark: F keeps its proposal and lists none.
    expect(cake.exceptions).toEqual([]);
    expect(cake.marks).toEqual([]);
    expect(plans.find(({ material: item }) => item === g.id)!.provisional).toMatchObject([{ bom: gBom.id, rejectedBoms: [{ bom: gBom.id, reason: "shortage" }] }]);
    // A row without details (written around the service) explains nothing rather than failing the whole read (review of #335).
    await sql("update mrp_run_exception set details = null where exception_code = 'BOM_REJECTIONS'");
    expect((await latest()).plans.find(({ material: item }) => item === f.id)!.proposals).toMatchObject([{ bom: p2.id, rejectedBoms: [] }]);
  });

  it("stores No Feasible BOM for a proposal its components can't supply, with each short component's figures, and the proposal as a provisional action, not a recommendation", async () => {
    const f = await typed("finished", "Cabinet");
    const a = await typed("raw", "Steel");
    const fBom = await recipe(f.id, { [a.id]: "1" });
    await parameters("prod", f.id, PLANT, "make", "0.000000", "2.000000");
    await parameters("prod", a.id, PLANT, "buy", "0.000000", "0.000001", 1);
    await stock("prod", a.id, PLANT, "5");
    // 4.1 rounds up to 6 by the multiple of 2 before the test (MRP-046).
    await order("prod", PLANT, [{ material: f.id, quantity: "4.1", requiredDate: "2026-10-21" }]);

    await run();

    const missing = `${fBom.id}/1: ${a.id} 6.000000 5.000000 1.000000`;
    const shortOfA = { bom: fBom.id, revision: 1, reason: "shortage", shortages: [{ material: a.id, required: "6.000000", available: "5.000000", shortage: "1.000000" }] };
    expect(await sql("select exception_code as code, material, date from mrp_run_exception order by position")).toEqual([
      { code: "NO_FEASIBLE_BOM", material: f.id, date: "2026-10-21" },
      { code: "PROVISIONAL_PRODUCTION", material: f.id, date: "2026-10-21" },
    ]);
    expect((await sql<{ details: string }>("select details from mrp_run_exception where exception_code = 'NO_FEASIBLE_BOM'"))[0].details).toBe(JSON.stringify({ missing, order: `${fBom.id}/1` }));
    expect(await sql("select material, kind, quantity, bom, bom_revision from mrp_recommendation order by material")).toEqual([
      // The provisional need still plans A: 6 needed, 5 on hand, and buying A is executable.
      { material: a.id, kind: "purchase-requisition", quantity: "1.000000", bom: null, bom_revision: null },
    ]);
    const listed = (await latest()).plans.find(({ material: item }) => item === f.id)!;
    expect(listed.exceptions).toEqual([
      {
        code: "NO_FEASIBLE_BOM", message: mrpExceptionMessage("NO_FEASIBLE_BOM"), params: { material: f.id, location: PLANT, date: "2026-10-21", missing, order: `${fBom.id}/1` },
        rejectedBoms: [shortOfA],
      },
    ]);
    expect(listed.proposals).toEqual([]);
    // The parent planning exception and the provisional action explain the same rejection (E18-S03).
    expect(listed.provisional).toMatchObject([{ kind: "production-order", quantity: "6.000000", bom: fBom.id, blockers: ["no-feasible-bom"], missing, rejectedBoms: [shortOfA] }]);
  });
});

describe("MrpRunService: at-risk production (#283)", () => {
  const typed = async (type: "finished" | "raw", description: string) => (await scope()).cradle.materialService.create({ type, description, baseUnit: "each" }, ANNA);
  const recipe = async (output: string, component: string, priority = 1) =>
    (await scope()).cradle.bomService.create({ output, priority, validFrom: "2026-01-01", validThrough: null, components: [{ material: component, quantity: "1", unit: "each" }] }, ANNA);
  const setActive = async (materialId: string, active: boolean) => {
    const { cradle } = await scope();
    const { version } = await cradle.materialService.get(materialId);
    await inRequestTransaction(cradle.em, () => cradle.materialService.update(materialId, { active }, version, ANNA));
  };
  /** An open order of 10 F finishing on 8 October, through `bom`, as the production dialog creates it. */
  const produce = async (output: string, bom: string) => {
    const { cradle } = await scope();
    return inRequestTransaction(cradle.em, () =>
      cradle.productionOrderService.create({ output, location: PLANT, quantity: "10", unit: "each", plannedFinish: "2026-10-08", bom, revision: 1 }, ANNA),
    );
  };
  const pinned = async (id: string) => {
    const { bom, revision, quantity, status, version } = await (await scope()).cradle.productionOrderService.get(id);
    return { bom, revision, quantity, status, version };
  };

  it("LFC-027, MRP-051: deactivating R under an open F order keeps the order unchanged, stores its balance as at-risk supply and AT_RISK_PRODUCTION, and proposes no F in its place", async () => {
    const f = await typed("finished", "Cabinet");
    const r = await typed("raw", "Retired steel");
    const fBom = await recipe(f.id, r.id);
    await parameters("prod", f.id, PLANT, "make", "0.000000", "0.000001");
    await parameters("prod", r.id, PLANT, "buy", "0.000000", "0.000001");
    const created = await produce(f.id, fBom.id);
    await order("prod", PLANT, [{ material: f.id, quantity: "10", requiredDate: "2026-10-12" }]);
    const before = await pinned(created.id);
    // Allowed while only BOMs and the open order's pinned revision use R (E10-S05, LFC-015).
    await setActive(r.id, false);

    await run();

    expect(await pinned(created.id)).toEqual(before);
    expect(before).toMatchObject({ bom: fBom.id, revision: 1, quantity: "10.000000", status: "open" });
    expect(await day("00000001", f.id, PLANT, "2026-10-08")).toMatchObject({ at_risk_supply: "10.000000", dependable_supply: "0.000000", projected_before: "0.000000" });
    expect(await day("00000001", f.id, PLANT, "2026-10-12")).toMatchObject({ projected_before: "-10.000000", projected_after: "-10.000000", shortage: "10.000000" });
    expect(await sql("select exception_code as code, material, date, details from mrp_run_exception order by position")).toEqual([
      { code: "AT_RISK_PRODUCTION", material: f.id, date: "2026-10-08", details: JSON.stringify({ order: created.id, quantity: "10.000000", inactiveComponents: r.id }) },
    ]);
    // Neither a replacement F nor a requisition for inactive R.
    expect(await sql("select material from mrp_recommendation")).toEqual([]);
    const listed = (await latest()).plans.find(({ material: item }) => item === f.id)!;
    expect(listed.exceptions).toEqual([
      { code: "AT_RISK_PRODUCTION", message: mrpExceptionMessage("AT_RISK_PRODUCTION"), params: { material: f.id, location: PLANT, date: "2026-10-08", order: created.id, quantity: "10.000000", inactiveComponents: r.id } },
    ]);
    expect(listed.buckets.find(({ date }) => date === "2026-10-08")).toMatchObject({ atRiskSupply: "10.000000" });
  });

  it("plans F again on a rerun: dependable once R is reactivated, and replaced through a usable BOM once the order is cancelled", async () => {
    const f = await typed("finished", "Cabinet");
    const r = await typed("raw", "Retired steel");
    const s = await typed("raw", "Oak");
    const fBom = await recipe(f.id, r.id);
    const sBom = await recipe(f.id, s.id, 2);
    await parameters("prod", f.id, PLANT, "make", "0.000000", "0.000001");
    await stock("prod", s.id, PLANT, "100");
    const created = await produce(f.id, fBom.id);
    await order("prod", PLANT, [{ material: f.id, quantity: "10", requiredDate: "2026-10-12" }]);
    await setActive(r.id, false);
    await run();
    expect(await sql("select exception_code as code from mrp_run_exception")).toEqual([{ code: "AT_RISK_PRODUCTION" }]);

    await setActive(r.id, true);
    await run();
    expect(await day("00000002", f.id, PLANT, "2026-10-08")).toMatchObject({ dependable_supply: "10.000000", at_risk_supply: "0.000000" });
    // Active again, R is the order's demand once more, and gets its own Missing Planning Parameters; F has nothing.
    expect(await sql("select exception_code as code, material from mrp_run_exception")).toEqual([{ code: "MISSING_PLANNING_PARAMETERS", material: r.id }]);
    expect(await sql("select material from mrp_recommendation")).toEqual([]);

    await setActive(r.id, false);
    const { version } = await pinned(created.id);
    const { cradle } = await scope();
    await inRequestTransaction(cradle.em, () => cradle.productionOrderService.cancel(created.id, version, ANNA));
    await run();
    expect(await sql("select material, quantity, bom from mrp_recommendation")).toEqual([{ material: f.id, quantity: "10.000000", bom: sBom.id }]);
    // The replacement passed over R's BOM, which the run explains (E18-S03).
    expect(await sql("select exception_code as code from mrp_run_exception")).toEqual([{ code: "BOM_REJECTIONS" }]);
  });
});
