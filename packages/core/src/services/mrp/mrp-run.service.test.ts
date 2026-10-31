import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, isTenantOwned, MrpDailyResult, MrpRun, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
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
      startDate: "2026-10-01", endDate: "2026-12-29", horizonDays: 90, pairs: 3,
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
    expect(await (await scope("test")).cradle.mrpRunService.current()).toEqual(testRun);
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
    expect(await (await scope()).cradle.mrpRunService.current()).toEqual(second);
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

describe("MrpRunService.current and latest", () => {
  it("say there is no run yet before the first one", async () => {
    expect(await (await scope()).cradle.mrpRunService.current()).toBeNull();
    await expect(latest()).rejects.toMatchObject({ code: "MRP_RUN_NOT_FOUND", message: MRP_RUN_NOT_FOUND, status: 404 });
  });

  it("page the latest run by pair, 25 pairs at a time, by material then location, each with its 90 days in order", async () => {
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

  it("refuse a page of a run a newer one has replaced, so a client never mixes two runs", async () => {
    const first = await run();
    await run();

    await expect(latest({ run: first.id })).rejects.toMatchObject({ code: "MRP_RUN_SUPERSEDED", message: MRP_RUN_SUPERSEDED, status: 409, messageParams: { run: "00000001" } });
    expect((await latest({ run: "00000002" })).run.id).toBe("00000002");
    expect((await latest({ run: "00000002", generation: "1" })).run.id).toBe("00000002");
  });

  it("refuse a run of another dataset generation even under the same ID, as a Test reset restarts IDs (D06), and don't know a run past the latest", async () => {
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

  it.each([
    [{ page: "0" }, "page"],
    [{ page: "two" }, "page"],
    [{ run: "1" }, "run"],
    [{ generation: "1" }, "generation"],
    [{ run: "00000001", generation: "0" }, "generation"],
    [{ sort: "material" }, ""],
  ])("refuse a malformed query %o", async (query, field) => {
    await run();

    await expect(latest(query)).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
    if (field) await expect(latest(query)).rejects.toHaveProperty(["fieldErrors", field]);
  });
});

/** Every row of every tenant-owned table but the MRP tables and the tenant audit, read raw. */
async function everyOtherTable() {
  const skipped = new Set([MrpRun.meta.className, MrpDailyResult.meta.className, "TenantAuditEvent"]);
  const result: Record<string, unknown> = {};
  for (const meta of orm.getMetadata().getAll().values()) {
    if (!isTenantOwned(meta) || skipped.has(meta.className)) continue;
    result[meta.tableName] = await sql(`select * from "${meta.tableName}" order by rowid`);
  }
  return result;
}
