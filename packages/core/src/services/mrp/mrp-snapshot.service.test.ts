import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer,
  CustomerOrder,
  CustomerOrderLine,
  Forecast,
  initOrm,
  Location,
  Material,
  SafetyStockTarget,
  selectTenant,
  StockBalance,
  type DocumentState,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { MrpSnapshotService } from "./mrp-snapshot.service";

// The horizon of 1 October 2026 runs to 29 December. Open lines are read to the end of December, the
// month of its last day, other lines from 1 October to then, forecasts from 1 October to 29 December.
const TODAY = "2026-10-01";
const micro = (whole: number) => BigInt(whole) * 1_000_000n;

describe("MrpSnapshotService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const load = (tenant: TenantCode = "prod") => new MrpSnapshotService({ em: scoped(tenant) }).load(TODAY);

  /** One order at `location` with one line per entry, written as stored rows (the snapshot only reads). */
  async function order(
    tenant: TenantCode,
    code: string,
    location: string,
    lines: { material: string; quantity: string; requiredDate: string; fulfilled?: string; abandoned?: string; status?: DocumentState; removed?: boolean }[],
  ) {
    const em = scoped(tenant);
    const header = em.create(CustomerOrder, {
      code,
      customer: await em.findOneOrFail(Customer, { code: "00000001" }),
      location: await em.findOneOrFail(Location, { code: location }),
    });
    for (const [index, line] of lines.entries()) {
      em.create(CustomerOrderLine, {
        order: header,
        position: index + 1,
        material: await em.findOneOrFail(Material, { code: line.material }),
        quantity: line.quantity,
        enteredQuantity: line.quantity,
        enteredUnit: "each",
        numerator: "1",
        denominator: "1",
        requiredDate: line.requiredDate,
        fulfilled: line.fulfilled ?? "0.000000",
        abandoned: line.abandoned ?? "0.000000",
        status: line.status ?? "open",
        removed: line.removed ?? false,
      });
    }
    await em.flush();
  }

  async function stock(tenant: TenantCode, material: string, location: string, quantity: string) {
    const em = scoped(tenant);
    em.create(StockBalance, {
      material: await em.findOneOrFail(Material, { code: material }),
      location: await em.findOneOrFail(Location, { code: location }),
      quantity,
    });
    await em.flush();
  }

  async function forecast(tenant: TenantCode, material: string, location: string, date: string, quantity: string) {
    const em = scoped(tenant);
    em.create(Forecast, {
      material: await em.findOneOrFail(Material, { code: material }),
      location: await em.findOneOrFail(Location, { code: location }),
      date,
      quantity,
    });
    await em.flush();
  }

  async function target(tenant: TenantCode, material: string, location: string, effectiveFrom: string, quantity: string) {
    const em = scoped(tenant);
    em.create(SafetyStockTarget, {
      material: await em.findOneOrFail(Material, { code: material }),
      location: await em.findOneOrFail(Location, { code: location }),
      effectiveFrom,
      quantity,
    });
    await em.flush();
  }

  /** Runs a load on a fresh, traced database holding one material, and returns the SQL it sent. */
  async function tracedLoad() {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    const em = traced.em.fork();
    selectTenant(em, "prod");
    em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
    await em.flush();
    await new MrpSnapshotService({ em }).load(TODAY);
    const explain = async ({ sql, params }: (typeof queries)[number]) =>
      (await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])).map(({ detail }) => detail).sort();
    return { queries, explain, close: () => traced.close() };
  }

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
      em.create(Material, { code: "00000002", type: "raw", description: "Steel", baseUnit: "kg" });
      em.create(Material, { code: "00000003", type: "finished", description: "Retired", baseUnit: "each", active: false });
      em.create(Location, { code: "00000001", name: "Plant" });
      em.create(Location, { code: "00000002", name: "Store" });
      em.create(Location, { code: "00000003", name: "Closed site", active: false });
      em.create(Customer, { code: "00000001", name: "Retail" });
      await em.flush();
    }
  });
  afterEach(async () => {
    await orm.close();
  });

  it("reads stock rows and Open lines as micro-units, with the order's ID, the line's position and the order's location", async () => {
    await stock("prod", "00000001", "00000001", "12.5");
    await stock("prod", "00000002", "00000002", "0.000000");
    await order("prod", "00000007", "00000002", [
      { material: "00000002", quantity: "3.000000", requiredDate: "2026-10-01" },
      { material: "00000001", quantity: "40.250000", fulfilled: "10.000000", abandoned: "0.250000", requiredDate: "2026-10-15" },
    ]);

    const inputs = await load();

    expect(inputs.stock).toEqual(
      expect.arrayContaining([
        { material: "00000001", location: "00000001", physical: 12_500_000n },
        { material: "00000002", location: "00000002", physical: 0n },
      ]),
    );
    expect(inputs.stock).toHaveLength(2);
    expect(inputs.orderLines).toEqual(
      expect.arrayContaining([
        {
          order: "00000007", position: 1, material: "00000002", location: "00000002", requiredDate: "2026-10-01",
          quantity: micro(3), fulfilled: 0n, abandoned: 0n, status: "open", removed: false,
        },
        {
          order: "00000007", position: 2, material: "00000001", location: "00000002", requiredDate: "2026-10-15",
          quantity: 40_250_000n, fulfilled: micro(10), abandoned: 250_000n, status: "open", removed: false,
        },
      ]),
    );
    expect(inputs.orderLines).toHaveLength(2);
  });

  it("reads overdue Open lines and those due to the end of the horizon's last month, but no removed or later line", async () => {
    await order("prod", "00000001", "00000001", [
      { material: "00000001", quantity: "1", requiredDate: "2025-03-31" },
      { material: "00000001", quantity: "2", requiredDate: "2026-12-29" },
      { material: "00000001", quantity: "3", requiredDate: "2026-12-31" },
      { material: "00000001", quantity: "4", requiredDate: "2027-01-01" },
      { material: "00000001", quantity: "5", requiredDate: "2026-10-02", removed: true },
    ]);

    const { orderLines } = await load();

    expect(orderLines.map(({ order, position, requiredDate }) => [order, position, requiredDate]).sort()).toEqual([
      ["00000001", 1, "2025-03-31"],
      ["00000001", 2, "2026-12-29"],
      ["00000001", 3, "2026-12-31"],
    ]);
  });

  it("reads the non-Open lines that consume forecasts, from today's month to the end of the horizon's last month (#275)", async () => {
    // Closed early and cancelled lines keep a remainder, as a reversed goods issue leaves one: the engine's
    // status filter keeps them out of firm demand, and they consume `quantity − abandoned` (lesson 2026-10-27).
    await order("prod", "00000002", "00000001", [
      { material: "00000001", quantity: "60", fulfilled: "10", abandoned: "30", requiredDate: "2026-10-02", status: "closed-early" },
    ]);
    await order("prod", "00000003", "00000001", [{ material: "00000001", quantity: "5", abandoned: "5", requiredDate: "2026-10-02", status: "cancelled" }]);
    await order("prod", "00000004", "00000002", [
      { material: "00000002", quantity: "7", fulfilled: "7", requiredDate: "2026-10-01", status: "completed" },
      { material: "00000002", quantity: "8", fulfilled: "8", requiredDate: "2026-12-31", status: "completed" },
      { material: "00000002", quantity: "9", fulfilled: "9", requiredDate: "2026-09-30", status: "completed" },
      { material: "00000002", quantity: "10", fulfilled: "10", requiredDate: "2027-01-01", status: "completed" },
      { material: "00000002", quantity: "11", requiredDate: "2026-11-15", status: "cancelled", abandoned: "11", removed: true },
    ]);

    const { orderLines } = await load();

    expect(orderLines).toEqual(
      expect.arrayContaining([
        {
          order: "00000002", position: 1, material: "00000001", location: "00000001", requiredDate: "2026-10-02",
          quantity: micro(60), fulfilled: micro(10), abandoned: micro(30), status: "closed-early", removed: false,
        },
        {
          order: "00000003", position: 1, material: "00000001", location: "00000001", requiredDate: "2026-10-02",
          quantity: micro(5), fulfilled: 0n, abandoned: micro(5), status: "cancelled", removed: false,
        },
      ]),
    );
    expect(orderLines.map(({ order, position }) => `${order}/${position}`).sort()).toEqual(["00000002/1", "00000003/1", "00000004/1", "00000004/2"]);
  });

  it("reads forecasts from today's month to the horizon's last day, and every target in force by then (#275)", async () => {
    await forecast("prod", "00000001", "00000002", "2026-10-01", "12.5");
    await forecast("prod", "00000001", "00000001", "2026-12-29", "3");
    await forecast("prod", "00000001", "00000001", "2026-09-30", "4");
    await forecast("prod", "00000001", "00000001", "2026-12-30", "5");
    await target("prod", "00000001", "00000001", "2020-01-01", "1");
    await target("prod", "00000001", "00000001", "2026-12-29", "20.25");
    await target("prod", "00000001", "00000001", "2026-12-30", "30");

    const { forecasts, safetyTargets } = await load();

    expect(forecasts).toEqual(
      expect.arrayContaining([
        { material: "00000001", location: "00000002", date: "2026-10-01", quantity: 12_500_000n },
        { material: "00000001", location: "00000001", date: "2026-12-29", quantity: micro(3) },
      ]),
    );
    expect(forecasts).toHaveLength(2);
    expect(safetyTargets).toEqual(
      expect.arrayContaining([
        { material: "00000001", location: "00000001", effectiveFrom: "2020-01-01", quantity: micro(1) },
        { material: "00000001", location: "00000001", effectiveFrom: "2026-12-29", quantity: 20_250_000n },
      ]),
    );
    expect(safetyTargets).toHaveLength(2);
  });

  it("plans inactive materials and locations by their data, not their flags", async () => {
    await stock("prod", "00000003", "00000003", "7");
    await order("prod", "00000001", "00000003", [{ material: "00000003", quantity: "2", requiredDate: "2026-10-05" }]);

    const inputs = await load();

    expect(inputs.stock).toEqual([{ material: "00000003", location: "00000003", physical: micro(7) }]);
    expect(inputs.orderLines.map(({ material, location }) => [material, location])).toEqual([["00000003", "00000003"]]);
  });

  it("never reads another tenant's stock, lines, forecasts or targets (MRP-002, R05)", async () => {
    for (const [tenant, amount] of [["prod", 100], ["test", 5]] as const) {
      await stock(tenant, "00000001", "00000001", String(amount));
      await order(tenant, "00000001", "00000001", [
        { material: "00000001", quantity: String(amount + 1), requiredDate: "2026-10-10" },
        { material: "00000001", quantity: String(amount + 2), fulfilled: String(amount + 2), requiredDate: "2026-10-11", status: "completed" },
      ]);
      await forecast(tenant, "00000001", "00000001", "2026-10-10", String(amount + 3));
      await target(tenant, "00000001", "00000001", "2026-10-01", String(amount + 4));
    }

    for (const [tenant, amount] of [["prod", 100], ["test", 5]] as const) {
      const inputs = await load(tenant);
      expect(inputs.stock.map(({ physical }) => physical)).toEqual([micro(amount)]);
      expect(inputs.orderLines.map(({ quantity }) => quantity).sort()).toEqual([micro(amount + 1), micro(amount + 2)].sort());
      expect(inputs.forecasts.map(({ quantity }) => quantity)).toEqual([micro(amount + 3)]);
      expect(inputs.safetyTargets.map(({ quantity }) => quantity)).toEqual([micro(amount + 4)]);
    }
  });

  it("reads the lines of more materials than one `$in` list holds, chunk by chunk", async () => {
    const em = scoped();
    for (let number = 4; number <= 205; number += 1) {
      em.create(Material, { code: String(number).padStart(8, "0"), type: "finished", description: `Product ${number}`, baseUnit: "each" });
    }
    await em.flush();
    const lines = [4, 104, 205].map((number) => ({ material: String(number).padStart(8, "0"), quantity: "1", requiredDate: "2026-10-03" }));
    await order("prod", "00000001", "00000001", lines);

    const { orderLines } = await load();

    expect(orderLines.map(({ material }) => material).sort()).toEqual(["00000004", "00000104", "00000205"]);
  });

  it("starts the Open-line read from the (tenant, material, removed, status) index and joins each line's order by key", async () => {
    // EXPLAIN the query MikroORM really sends (lesson 2026-10-25), on a schema without ANALYZE statistics.
    const { queries, explain, close } = await tracedLoad();
    try {
      const sent = queries.filter(({ sql }) => sql.includes(" from `customer_order_line` as ") && sql.includes("`c0`.`status` = ?"));
      expect(sent).toHaveLength(1);
      // Each table is reached by key or by the line index; with `required_date < ?` in the query, the
      // lines were read through `(tenant, required_date)`, every line of the tenant before that day.
      expect(await explain(sent[0])).toEqual([
        "SEARCH c0 USING INDEX customer_order_line_tenant_code_material_id_removed_status_id_index (tenant_code=? AND material_id=? AND removed=? AND status=?)",
        "SEARCH m2 USING INDEX sqlite_autoindex_material_1 (id=?)",
        "SEARCH o1 USING INDEX sqlite_autoindex_customer_order_1 (id=?)",
      ]);
    } finally {
      await close();
    }
  });

  it("reads the consuming lines one month at a time through (tenant, required_date), and joins each line's order by key", async () => {
    const { queries, explain, close } = await tracedLoad();
    try {
      const sent = queries.filter(({ sql }) => sql.includes(" from `customer_order_line` as ") && sql.includes("`c0`.`status` != ?"));
      // October, November and December 2026: the months from today's to the horizon's last day's.
      expect(sent.map(({ params }) => params.filter((param) => typeof param === "string" && /^\d{4}-\d{2}-01$/.test(param)))).toEqual([
        ["2026-10-01", "2026-11-01"],
        ["2026-11-01", "2026-12-01"],
        ["2026-12-01", "2027-01-01"],
      ]);
      expect(await explain(sent[0])).toEqual([
        "SEARCH c0 USING INDEX customer_order_line_tenant_code_required_date_index (tenant_code=? AND required_date>? AND required_date<?)",
        "SEARCH m2 USING INDEX sqlite_autoindex_material_1 (id=?)",
        "SEARCH o1 USING INDEX sqlite_autoindex_customer_order_1 (id=?)",
      ]);
    } finally {
      await close();
    }
  });

  it("reads forecasts one month at a time through (tenant, date), up to the horizon's last day", async () => {
    const { queries, explain, close } = await tracedLoad();
    try {
      const sent = queries.filter(({ sql }) => sql.includes(" from `forecast` as "));
      expect(sent.map(({ params }) => params.filter((param) => typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param)))).toEqual([
        ["2026-10-01", "2026-11-01"],
        ["2026-11-01", "2026-12-01"],
        ["2026-12-01", "2026-12-30"],
      ]);
      expect((await explain(sent[0])).filter((detail) => detail.includes(" f0 "))).toEqual([
        "SEARCH f0 USING INDEX forecast_tenant_code_date_index (tenant_code=? AND date>? AND date<?)",
      ]);
    } finally {
      await close();
    }
  });

  it("returns an empty snapshot for a tenant with nothing to plan", async () => {
    expect(await load()).toEqual({ stock: [], orderLines: [], forecasts: [], safetyTargets: [] });
  });
});
