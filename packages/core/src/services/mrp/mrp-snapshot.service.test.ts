import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Bom,
  BomComponent,
  BomRevision,
  Customer,
  CustomerOrder,
  CustomerOrderLine,
  Forecast,
  initOrm,
  Location,
  Material,
  PlanningParameterSet,
  ProductionOrder,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequisition,
  SafetyStockTarget,
  selectTenant,
  StockBalance,
  Supplier,
  Transfer,
  type DocumentState,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { MrpSnapshotService } from "./mrp-snapshot.service";
import { BOM_CHUNK } from "./snapshot/boms";
import { ORDER_LINE_CHUNK, ORDER_PAGE, REQUISITION_PAGE } from "./snapshot/purchasing";

// The horizon of 1 October 2026 runs to 29 December. Open lines are read to the end of December, the
// month of its last day, other lines from 1 October to then, forecasts from 1 October to 29 December.
const TODAY = "2026-10-01";
const micro = (whole: number) => BigInt(whole) * 1_000_000n;
/** The parameter read seeks the tenant's sets and joins the filter's relations by key: a set per pair, so no range is needed. */
const PLANNING_PARAMETER_PLAN = [
  "SEARCH l2 USING INDEX sqlite_autoindex_location_1 (id=?)",
  "SEARCH m1 USING INDEX sqlite_autoindex_material_1 (id=?)",
  "SEARCH p0 USING INDEX planning_parameter_set_tenant_code_index (tenant_code=?)",
];

describe("MrpSnapshotService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const load = (tenant: TenantCode = "prod", today = TODAY) => new MrpSnapshotService({ em: scoped(tenant) }).load(today);

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

  /** A BOM of `output` with one revision whose lines are `components` (material code → per-output quantity); returns the revision's ID. */
  async function recipe(tenant: TenantCode, code: string, output: string, components: Record<string, string>): Promise<string> {
    const em = scoped(tenant);
    const bom = em.create(Bom, { code, output: await em.findOneOrFail(Material, { code: output }), revision: 1 });
    const revision = em.create(BomRevision, { bom, number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
    for (const [position, [material, quantity]] of Object.entries(components).entries()) {
      em.create(BomComponent, {
        revision,
        position: position + 1,
        material: await em.findOneOrFail(Material, { code: material }),
        quantity,
        enteredQuantity: quantity,
        enteredUnit: "kg",
        numerator: "1",
        denominator: "1",
      });
    }
    await em.flush();
    return revision.id;
  }

  /** A production order of `output` at `location` pinning `revision`, written as a stored row. */
  async function production(
    tenant: TenantCode,
    code: string,
    revision: string,
    order: { output?: string; location?: string; quantity: string; plannedStart: string; plannedFinish: string; produced?: string; abandoned?: string; status?: DocumentState },
  ) {
    const em = scoped(tenant);
    em.create(ProductionOrder, {
      code,
      output: await em.findOneOrFail(Material, { code: order.output ?? "00000001" }),
      location: await em.findOneOrFail(Location, { code: order.location ?? "00000001" }),
      recipe: await em.findOneOrFail(BomRevision, { id: revision }),
      quantity: order.quantity,
      enteredQuantity: order.quantity,
      enteredUnit: "each",
      numerator: "1",
      denominator: "1",
      plannedStart: order.plannedStart,
      plannedFinish: order.plannedFinish,
      leadTimeDays: 5,
      produced: order.produced ?? "0.000000",
      abandoned: order.abandoned ?? "0.000000",
      status: order.status ?? "open",
    });
    await em.flush();
  }

  /** A transfer of `material` from `source` to `destination`, written as a stored row. */
  async function transferRow(
    tenant: TenantCode,
    code: string,
    row: { quantity: string; plannedDispatch: string; plannedArrival: string; dispatched?: string; received?: string; writtenOff?: string; abandoned?: string; status?: DocumentState },
  ) {
    const em = scoped(tenant);
    em.create(Transfer, {
      code,
      material: await em.findOneOrFail(Material, { code: "00000002" }),
      source: await em.findOneOrFail(Location, { code: "00000001" }),
      destination: await em.findOneOrFail(Location, { code: "00000002" }),
      quantity: row.quantity,
      enteredQuantity: row.quantity,
      enteredUnit: "kg",
      numerator: "1",
      denominator: "1",
      plannedDispatch: row.plannedDispatch,
      plannedArrival: row.plannedArrival,
      dispatched: row.dispatched ?? "0.000000",
      received: row.received ?? "0.000000",
      writtenOff: row.writtenOff ?? "0.000000",
      abandoned: row.abandoned ?? "0.000000",
      status: row.status ?? "open",
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

  /** A planning parameter set of `material` at `location`, written as a stored row. */
  async function parameters(tenant: TenantCode, material: string, location: string, set: { procurement: "make" | "buy"; leadTimeDays: number; minimumQuantity: string; lotMultiple: string }) {
    const em = scoped(tenant);
    em.create(PlanningParameterSet, {
      material: await em.findOneOrFail(Material, { code: material }),
      location: await em.findOneOrFail(Location, { code: location }),
      ...set,
    });
    await em.flush();
  }

  /** Runs a load on a fresh, traced database holding one material, and returns the SQL it sent. */
  async function tracedLoad(today = TODAY) {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    const em = traced.em.fork();
    selectTenant(em, "prod");
    em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
    await em.flush();
    await new MrpSnapshotService({ em }).load(today);
    const explain = async ({ sql, params }: (typeof queries)[number]) =>
      (await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])).map(({ detail }) => detail).sort();
    return { queries, explain, close: () => traced.close() };
  }

  const code = (number: number) => String(number).padStart(8, "0");

  interface RequisitionRow {
    code: string;
    material?: string;
    location?: string;
    quantity: string;
    requiredDate: string;
    converted?: string;
    abandoned?: string;
    status?: DocumentState;
  }

  /** Requisitions written as stored rows; material and location default to `00000001`. */
  async function requisitions(tenant: TenantCode, rows: RequisitionRow[]) {
    const em = scoped(tenant);
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    const location = await em.findOneOrFail(Location, { code: "00000001" });
    for (const row of rows) {
      em.create(PurchaseRequisition, {
        code: row.code,
        material: row.material ? await em.findOneOrFail(Material, { code: row.material }) : material,
        location: row.location ? await em.findOneOrFail(Location, { code: row.location }) : location,
        quantity: row.quantity,
        enteredQuantity: row.quantity,
        enteredUnit: "each",
        numerator: "1",
        denominator: "1",
        requiredDate: row.requiredDate,
        converted: row.converted ?? "0.000000",
        abandoned: row.abandoned ?? "0.000000",
        status: row.status ?? "open",
      });
    }
    await em.flush();
  }

  interface PurchaseLineRow {
    material?: string;
    quantity: string;
    plannedDate: string;
    received?: string;
    abandoned?: string;
    status?: DocumentState;
  }

  /** One purchase order at `location` with one line per entry; its header is Open while any line is. */
  async function purchaseOrder(tenant: TenantCode, orderCode: string, location: string, lines: PurchaseLineRow[]) {
    const em = scoped(tenant);
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    const header = em.create(PurchaseOrder, {
      code: orderCode,
      supplier: await em.findOneOrFail(Supplier, { code: "00000001" }),
      location: await em.findOneOrFail(Location, { code: location }),
      status: lines.some(({ status = "open" }) => status === "open") ? "open" : "completed",
    });
    for (const [index, line] of lines.entries()) {
      em.create(PurchaseOrderLine, {
        order: header,
        position: index + 1,
        material: line.material ? await em.findOneOrFail(Material, { code: line.material }) : material,
        quantity: line.quantity,
        enteredQuantity: line.quantity,
        enteredUnit: "each",
        numerator: "1",
        denominator: "1",
        plannedDate: line.plannedDate,
        received: line.received ?? "0.000000",
        abandoned: line.abandoned ?? "0.000000",
        status: line.status ?? "open",
      });
    }
    await em.flush();
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
      em.create(Supplier, { code: "00000001", name: "Mill" });
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

  it("reads from the first of today's month in mid-month, so an earlier residual of the month counts today (D08)", async () => {
    await forecast("prod", "00000001", "00000001", "2026-10-05", "100");
    await forecast("prod", "00000001", "00000001", "2026-09-30", "1");
    await order("prod", "00000001", "00000001", [
      { material: "00000001", quantity: "60", fulfilled: "60", requiredDate: "2026-10-09", status: "completed" },
      { material: "00000001", quantity: "7", fulfilled: "7", requiredDate: "2026-09-30", status: "completed" },
    ]);

    const { forecasts, orderLines } = await load("prod", "2026-10-20");

    expect(forecasts.map(({ date }) => date)).toEqual(["2026-10-05"]);
    expect(orderLines.map(({ requiredDate, status }) => [requiredDate, status])).toEqual([["2026-10-09", "completed"]]);
    const { queries, close } = await tracedLoad("2026-10-20");
    try {
      const firstDates = (marker: string) =>
        queries.filter(({ sql }) => sql.includes(marker)).map(({ params }) => params.find((param) => typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param)));
      // The horizon of 20 October runs to 17 January, so the reads go through January.
      expect(firstDates("`c0`.`status` != ?")).toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
      expect(firstDates(" from `forecast` as ")).toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
    } finally {
      await close();
    }
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

  it("reads Open production orders with their pinned lines as micro-units, sharing a revision's lines between orders", async () => {
    const revision = await recipe("prod", "00000001", "00000001", { "00000002": "2.5", "00000003": "0.000001" });
    await production("prod", "00000001", revision, { quantity: "100", produced: "40.5", plannedStart: "2026-09-28", plannedFinish: "2026-10-03" });
    await production("prod", "00000002", revision, { location: "00000002", quantity: "10", plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });

    const { productionOrders } = await load();

    const lines = expect.arrayContaining([
      { material: "00000002", perOutput: 2_500_000n },
      { material: "00000003", perOutput: 1n },
    ]);
    expect([...productionOrders].sort((a, b) => a.order.localeCompare(b.order))).toEqual([
      {
        order: "00000001", material: "00000001", location: "00000001", plannedStart: "2026-09-28", plannedFinish: "2026-10-03",
        quantity: micro(100), produced: 40_500_000n, abandoned: 0n, status: "open", inactiveComponents: ["00000003"], components: lines,
      },
      {
        order: "00000002", material: "00000001", location: "00000002", plannedStart: "2026-10-05", plannedFinish: "2026-10-10",
        quantity: micro(10), produced: 0n, abandoned: 0n, status: "open", inactiveComponents: ["00000003"], components: lines,
      },
    ]);
    expect(productionOrders.every(({ components }) => components.length === 2)).toBe(true);
  });

  it("lists a pinned revision's inactive components in code order, an unreadable line's among them, and none when all are active (E17-S03)", async () => {
    const em = scoped();
    em.create(Material, { code: "00000004", type: "raw", description: "Glue", baseUnit: "kg", active: false });
    await em.flush();
    // 00000003 starts inactive; its line has seven decimals, so it can't be read, yet it still puts the order at risk.
    const atRisk = await recipe("prod", "00000001", "00000001", { "00000004": "1", "00000002": "1", "00000003": "0.0000001" });
    const sound = await recipe("prod", "00000002", "00000001", { "00000002": "1" });
    await production("prod", "00000001", atRisk, { quantity: "10", plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });
    await production("prod", "00000002", sound, { quantity: "10", plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });

    const { productionOrders } = await load();

    expect(productionOrders.map(({ order, inactiveComponents }) => [order, inactiveComponents])).toEqual([
      ["00000001", ["00000003", "00000004"]],
      ["00000002", []],
    ]);
  });

  it("reads no production order that isn't Open, nor one starting after the horizon, but one starting on its last day", async () => {
    const revision = await recipe("prod", "00000001", "00000001", { "00000002": "1" });
    const dates = { plannedStart: "2026-10-05", plannedFinish: "2026-10-10" };
    // Each closed order keeps a remainder by arithmetic, so only the status filter keeps it out (lesson 2026-10-27).
    await production("prod", "00000001", revision, { quantity: "100", produced: "40", status: "closed-early", ...dates });
    await production("prod", "00000002", revision, { quantity: "100", status: "cancelled", ...dates });
    await production("prod", "00000003", revision, { quantity: "100", produced: "40", status: "completed", ...dates });
    await production("prod", "00000004", revision, { quantity: "100", plannedStart: "2026-12-30", plannedFinish: "2027-01-04" });
    await production("prod", "00000005", revision, { quantity: "100", plannedStart: "2026-12-29", plannedFinish: "2027-01-03" });

    const { productionOrders } = await load();

    expect(productionOrders.map(({ order }) => order)).toEqual(["00000005"]);
  });

  it("never reads another tenant's production orders (MRP-002)", async () => {
    for (const [tenant, quantity] of [["prod", "30"], ["test", "70"]] as const) {
      const revision = await recipe(tenant, "00000001", "00000001", { "00000002": "1" });
      await production(tenant, "00000001", revision, { quantity, plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });
    }

    expect((await load("prod")).productionOrders.map(({ quantity }) => quantity)).toEqual([micro(30)]);
    expect((await load("test")).productionOrders.map(({ quantity }) => quantity)).toEqual([micro(70)]);
  });

  it("reads the lines of more pinned revisions than one `$in` list holds, chunk by chunk", async () => {
    for (let number = 1; number <= 101; number += 1) {
      const revision = await recipe("prod", code(number), "00000001", { "00000002": String(number) });
      await production("prod", code(number), revision, { quantity: "1", plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });
    }

    const { productionOrders } = await load();

    expect(productionOrders).toHaveLength(101);
    for (const { order, components } of productionOrders) expect(components).toEqual([{ material: "00000002", perOutput: micro(Number(order)) }]);
  });

  it("reads Open transfers with their progress as micro-units, by business ID, overdue and part-dispatched ones included", async () => {
    await transferRow("prod", "00000001", { quantity: "100", dispatched: "30.5", received: "10", writtenOff: "0.5", plannedDispatch: "2026-09-25", plannedArrival: "2026-09-28" });

    const { transfers } = await load();

    expect(transfers).toEqual([
      {
        transfer: "00000001", material: "00000002", source: "00000001", destination: "00000002", plannedDispatch: "2026-09-25", plannedArrival: "2026-09-28",
        quantity: micro(100), dispatched: 30_500_000n, received: micro(10), writtenOff: 500_000n, abandoned: 0n, status: "open",
      },
    ]);
  });

  it("reads no transfer that isn't Open, nor one dispatching after the horizon, but one dispatching on its last day", async () => {
    // A closed transfer with a remainder by arithmetic, so only the status filter keeps it out (lesson 2026-10-27).
    await transferRow("prod", "00000001", { quantity: "100", dispatched: "40", received: "40", abandoned: "40", status: "closed-early", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });
    await transferRow("prod", "00000002", { quantity: "100", status: "cancelled", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });
    await transferRow("prod", "00000003", { quantity: "100", dispatched: "100", received: "100", status: "completed", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });
    await transferRow("prod", "00000004", { quantity: "100", plannedDispatch: "2026-12-30", plannedArrival: "2026-12-31" });
    await transferRow("prod", "00000005", { quantity: "100", plannedDispatch: "2026-12-29", plannedArrival: "2027-01-02" });

    const { transfers } = await load();

    expect(transfers.map(({ transfer }) => transfer)).toEqual(["00000005"]);
  });

  it("never reads another tenant's transfers (MRP-002)", async () => {
    await transferRow("prod", "00000001", { quantity: "30", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });
    await transferRow("test", "00000001", { quantity: "70", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });

    expect((await load("prod")).transfers.map(({ quantity }) => quantity)).toEqual([micro(30)]);
    expect((await load("test")).transfers.map(({ quantity }) => quantity)).toEqual([micro(70)]);
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

  it("reads every planning parameter set as micro-units, with its material's type, and never another tenant's (#278, MAT-016, R05)", async () => {
    await parameters("prod", "00000001", "00000001", { procurement: "make", leadTimeDays: 4, minimumQuantity: "10.000000", lotMultiple: "0.000001" });
    await parameters("prod", "00000002", "00000002", { procurement: "buy", leadTimeDays: 0, minimumQuantity: "0.000000", lotMultiple: "2.500000" });
    await parameters("test", "00000003", "00000001", { procurement: "buy", leadTimeDays: 9, minimumQuantity: "1.000000", lotMultiple: "1.000000" });

    const { planningParameters } = await load();

    expect(planningParameters).toEqual(
      expect.arrayContaining([
        { material: "00000001", location: "00000001", materialType: "finished", procurement: "make", leadTimeDays: 4, minimumQuantity: micro(10), lotMultiple: 1n },
        { material: "00000002", location: "00000002", materialType: "raw", procurement: "buy", leadTimeDays: 0, minimumQuantity: 0n, lotMultiple: 2_500_000n },
      ]),
    );
    expect(planningParameters).toHaveLength(2);
    expect((await load("test")).planningParameters.map(({ material, materialType }) => [material, materialType])).toEqual([["00000003", "finished"]]);
  });

  it("reads the planning parameter sets in one read through the tenant's index, joining each relation by key", async () => {
    const { queries, explain, close } = await tracedLoad();
    try {
      const sent = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(" from `planning_parameter_set` as "));
      expect(sent).toHaveLength(1);
      expect(await explain(sent[0])).toEqual(PLANNING_PARAMETER_PLAN);
    } finally {
      await close();
    }
  });

  it("returns an empty snapshot for a tenant with nothing to plan", async () => {
    expect(await load()).toEqual({
      stock: [], orderLines: [], forecasts: [], safetyTargets: [], requisitions: [], purchaseOrderLines: [], productionOrders: [], transfers: [], planningParameters: [], boms: [], unreadable: [],
    });
  });

  it("reads Open requisitions and the Open lines of Open purchase orders as micro-units, each at its own location", async () => {
    await requisitions("prod", [
      // Part-converted into order 00000001's first line: 60 of 100 taken.
      { code: "00000001", material: "00000002", location: "00000002", quantity: "100", converted: "60", requiredDate: "2026-10-20" },
      { code: "00000002", quantity: "100", converted: "100", status: "completed", requiredDate: "2026-10-20" },
      { code: "00000003", quantity: "5", abandoned: "5", status: "cancelled", requiredDate: "2026-10-20" },
    ]);
    await purchaseOrder("prod", "00000001", "00000002", [
      { material: "00000002", quantity: "60", plannedDate: "2026-10-12" },
      { quantity: "100", received: "40.5", plannedDate: "2026-09-30" },
      { quantity: "100", received: "60", abandoned: "40", status: "closed-early", plannedDate: "2026-10-12" },
      { quantity: "10", received: "10", status: "completed", plannedDate: "2026-10-12" },
      { quantity: "7", plannedDate: "2027-01-15" },
    ]);

    const inputs = await load();

    expect(inputs.requisitions).toEqual([
      {
        code: "00000001", material: "00000002", location: "00000002", requiredDate: "2026-10-20",
        quantity: micro(100), converted: micro(60), abandoned: 0n, status: "open",
      },
    ]);
    expect([...inputs.purchaseOrderLines].sort((a, b) => a.position - b.position)).toEqual([
      {
        order: "00000001", position: 1, material: "00000002", location: "00000002", plannedDate: "2026-10-12",
        quantity: micro(60), received: 0n, abandoned: 0n, status: "open",
      },
      {
        order: "00000001", position: 2, material: "00000001", location: "00000002", plannedDate: "2026-09-30",
        quantity: micro(100), received: 40_500_000n, abandoned: 0n, status: "open",
      },
      {
        order: "00000001", position: 5, material: "00000001", location: "00000002", plannedDate: "2027-01-15",
        quantity: micro(7), received: 0n, abandoned: 0n, status: "open",
      },
    ]);
  });

  it("reads no line of a purchase order that is no longer Open, even one keeping a remainder", async () => {
    // A Closed Early order whose receipt was reversed keeps 40 by arithmetic; only the status keeps it out.
    await purchaseOrder("prod", "00000001", "00000001", [{ quantity: "100", abandoned: "40", status: "closed-early", plannedDate: "2026-10-12" }]);
    await purchaseOrder("prod", "00000002", "00000001", [{ quantity: "100", abandoned: "100", status: "cancelled", plannedDate: "2026-10-12" }]);

    expect((await load()).purchaseOrderLines).toEqual([]);
  });

  it("never reads another tenant's requisitions or purchase orders (R05)", async () => {
    await requisitions("prod", [{ code: "00000001", quantity: "40", requiredDate: "2026-10-10" }]);
    await purchaseOrder("prod", "00000001", "00000001", [{ quantity: "30", plannedDate: "2026-10-10" }]);
    await requisitions("test", [{ code: "00000001", quantity: "4", requiredDate: "2026-10-10" }]);
    await purchaseOrder("test", "00000001", "00000001", [{ quantity: "3", plannedDate: "2026-10-10" }]);

    const prod = await load("prod");
    const test = await load("test");

    expect(prod.requisitions.map(({ quantity }) => quantity)).toEqual([micro(40)]);
    expect(prod.purchaseOrderLines.map(({ quantity }) => quantity)).toEqual([micro(30)]);
    expect(test.requisitions.map(({ quantity }) => quantity)).toEqual([micro(4)]);
    expect(test.purchaseOrderLines.map(({ quantity }) => quantity)).toEqual([micro(3)]);
  });

  it("reads more requisitions than one page and more Open orders than one page, their lines chunk by chunk", async () => {
    await requisitions(
      "prod",
      Array.from({ length: REQUISITION_PAGE + 1 }, (_, index) => ({ code: code(index + 1), quantity: "1", requiredDate: "2026-10-10" })),
    );
    // A Completed order between the Open ones, and one Open order holding the most lines an order may.
    const em = scoped();
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    const supplier = await em.findOneOrFail(Supplier, { code: "00000001" });
    const location = await em.findOneOrFail(Location, { code: "00000001" });
    const orderCount = ORDER_PAGE + ORDER_LINE_CHUNK + 1;
    for (let number = 1; number <= orderCount; number += 1) {
      const completed = number === 50;
      const header = em.create(PurchaseOrder, { code: code(number), supplier, location, status: completed ? "completed" : "open" });
      const count = number === orderCount ? 100 : 1;
      for (let position = 1; position <= count; position += 1) {
        em.create(PurchaseOrderLine, {
          order: header, position, material, quantity: "1", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1",
          plannedDate: "2026-10-10", received: completed ? "1" : "0.000000", status: completed ? "completed" : "open",
        });
      }
    }
    await em.flush();

    const inputs = await load();

    expect(inputs.requisitions).toHaveLength(REQUISITION_PAGE + 1);
    expect(new Set(inputs.requisitions.map(({ code }) => code)).size).toBe(REQUISITION_PAGE + 1);
    expect(inputs.purchaseOrderLines).toHaveLength(orderCount - 2 + 100);
    expect(new Set(inputs.purchaseOrderLines.map(({ order }) => order)).size).toBe(orderCount - 1);
    expect(inputs.purchaseOrderLines.some(({ order }) => order === code(50))).toBe(false);
    expect(inputs.purchaseOrderLines.filter(({ order }) => order === code(orderCount))).toHaveLength(100);
  });

  it("seeks Open requisitions and orders by status and code, and their lines by order, with every join by key", async () => {
    // EXPLAIN the queries MikroORM really sends (lesson 2026-10-25), on a schema without ANALYZE statistics.
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      const em = traced.em.fork();
      selectTenant(em, "prod");
      const material = em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      const supplier = em.create(Supplier, { code: "00000001", name: "Mill" });
      const order = em.create(PurchaseOrder, { code: "00000001", supplier, location });
      em.create(PurchaseOrderLine, {
        order, position: 1, material, quantity: "1", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1", plannedDate: "2026-10-10",
      });
      await em.flush();
      queries.length = 0;
      await new MrpSnapshotService({ em }).load(TODAY);
      const plan = async (table: string) => {
        const sent = queries.filter(({ sql }) => sql.includes(` from \`${table}\` as `));
        expect(sent).toHaveLength(1);
        const rows = await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sent[0].sql}`, [...sent[0].params]);
        return rows.map(({ detail }) => detail.replace(/ USING (COVERING )?INDEX \S+/, " USING INDEX")).sort();
      };
      // The status seek may use either the ascending or the `desc` list index: it pins the seek, not a name.
      expect(await plan("purchase_requisition")).toEqual([
        "SEARCH l2 USING INDEX (id=?)",
        "SEARCH m1 USING INDEX (id=?)",
        "SEARCH p0 USING INDEX (tenant_code=? AND status=? AND code>?)",
      ]);
      expect(await plan("purchase_order")).toEqual([
        "SEARCH l1 USING INDEX (id=?)",
        "SEARCH p0 USING INDEX (tenant_code=? AND status=? AND code>?)",
      ]);
      expect(await plan("purchase_order_line")).toEqual([
        "SEARCH m2 USING INDEX (id=?)",
        "SEARCH o1 USING INDEX (id=?)",
        "SEARCH p0 USING INDEX (tenant_code=? AND order_id=?)",
      ]);
    } finally {
      await traced.close();
    }
  });

  it("seeks the production-order and transfer reads through their (tenant, status, code) indexes and both line reads by revision", async () => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      const em = traced.em.fork();
      selectTenant(em, "prod");
      const output = em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      const bom = em.create(Bom, { code: "00000001", output, revision: 1 });
      const revision = em.create(BomRevision, { bom, number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
      em.create(ProductionOrder, {
        code: "00000001", output, location, recipe: revision, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1",
        denominator: "1", plannedStart: "2026-10-05", plannedFinish: "2026-10-10", leadTimeDays: 5,
      });
      em.create(Transfer, {
        code: "00000001", material: output, source: location, destination: em.create(Location, { code: "00000002", name: "Store" }), quantity: "1.000000",
        enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06",
      });
      await em.flush();
      await new MrpSnapshotService({ em }).load(TODAY);
      const explain = async (table: string, reads = 1) => {
        const sent = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(` from \`${table}\` as `));
        expect(sent).toHaveLength(reads);
        const plans = await Promise.all(sent.map(({ sql, params }) => traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])));
        // Every read of the table plans alike.
        for (const plan of plans) expect(plan).toEqual(plans[0]);
        return plans[0].map(({ detail }) => detail);
      };
      // The tenant filter joins each relation by key; either direction of the status list index seeks.
      const unaliased = (details: string[]) => details.map((detail) => detail.replace(/^SEARCH \w+ /, "SEARCH ")).sort();
      expect(unaliased(await explain("production_order"))).toEqual([
        expect.stringMatching(/^SEARCH USING INDEX production_order_tenant_code_status(_desc)?_code_index \(tenant_code=\? AND status=\?\)$/),
        "SEARCH USING INDEX sqlite_autoindex_bom_revision_1 (id=?)",
        "SEARCH USING INDEX sqlite_autoindex_location_1 (id=?)",
        "SEARCH USING INDEX sqlite_autoindex_material_1 (id=?)",
      ]);
      // Two line reads, each by revision: the production orders' pinned lines (#277) and the active BOMs' current lines (#281).
      expect((await explain("bom_component", 2)).sort()).toEqual([
        "SEARCH b0 USING INDEX bom_component_revision_id_index (revision_id=?)",
        "SEARCH m2 USING INDEX sqlite_autoindex_material_1 (id=?)",
        "SEARCH r1 USING INDEX sqlite_autoindex_bom_revision_1 (id=?)",
      ]);
      expect((await explain("transfer")).join("\n")).toMatch(/^SEARCH t0 USING INDEX transfer_tenant_code_status(_desc)?_code_index \(tenant_code=\? AND status=\?\)$/m);
      expect((await explain("transfer")).filter((detail) => !detail.startsWith("SEARCH"))).toEqual([]);
    } finally {
      await traced.close();
    }
  });

  describe("unreadable rows (E16-S03, MRP-036)", () => {
    // Rows are written around the services, as a legacy import or a hand edit would: the helpers above
    // store whatever text they get, and `nativeUpdate` rewrites the factors they always store as 1:1.
    it("leaves out a stock row, a forecast and a safety target it can't read, and reports each at its pair, every other row unchanged", async () => {
      await stock("prod", "00000001", "00000001", "abc");
      await stock("prod", "00000002", "00000001", "4.000000");
      await forecast("prod", "00000001", "00000002", "2026-10-20", "-3");
      await forecast("prod", "00000002", "00000002", "2026-10-20", "5.000000");
      await target("prod", "00000002", "00000002", "2026-10-01", "1.0000001");
      const snapshot = await load();
      expect(snapshot.stock).toEqual([{ material: "00000002", location: "00000001", physical: micro(4) }]);
      expect(snapshot.forecasts).toEqual([{ material: "00000002", location: "00000002", date: "2026-10-20", quantity: micro(5) }]);
      expect(snapshot.safetyTargets).toEqual([]);
      expect(snapshot.unreadable).toEqual([
        { material: "00000001", location: "00000001", record: "stock-balance" },
        { material: "00000002", location: "00000002", record: "safety-stock-target" },
        { material: "00000001", location: "00000002", record: "forecast" },
      ]);
    });

    it("leaves out an order line with a zero denominator or a date that isn't real, naming the line, but flags nothing for one past the cut-off", async () => {
      await order("prod", "00000005", "00000002", [
        { material: "00000001", quantity: "3.000000", requiredDate: "2026-10-10" },
        { material: "00000002", quantity: "2.000000", requiredDate: "2026-10-10" },
        { material: "00000002", quantity: "2.000000", requiredDate: "2026-11-5" },
        // Due after the end of the horizon's last month: read, but it counts nowhere.
        { material: "00000001", quantity: "x", requiredDate: "2027-03-01" },
      ]);
      const em = scoped();
      const header = await em.findOneOrFail(CustomerOrder, { code: "00000005" });
      await em.nativeUpdate(CustomerOrderLine, { order: header, position: 1 }, { denominator: "0" });
      const snapshot = await load();
      expect(snapshot.orderLines.map(({ order: id, position }) => `${id}/${position}`)).toEqual(["00000005/2"]);
      // Lines are read by material chunk; the engine sorts what it reports, so the order here is free.
      expect([...snapshot.unreadable].sort((a, b) => a.document!.localeCompare(b.document!))).toEqual([
        { material: "00000001", location: "00000002", record: "customer-order-line", document: "00000005/1" },
        { material: "00000002", location: "00000002", record: "customer-order-line", document: "00000005/3" },
      ]);
    });

    it("leaves out a non-Open consuming line it can't read, naming the line", async () => {
      await order("prod", "00000006", "00000001", [{ material: "00000001", quantity: "4.000000", fulfilled: "nope", requiredDate: "2026-10-12", status: "completed" }]);
      const snapshot = await load();
      expect(snapshot.orderLines).toEqual([]);
      expect(snapshot.unreadable).toEqual([{ material: "00000001", location: "00000001", record: "customer-order-line", document: "00000006/1" }]);
    });

    it("leaves out a requisition and a purchase-order line it can't read, naming each document", async () => {
      await requisitions("prod", [
        { code: "00000001", quantity: "5.000000", requiredDate: "2026-10-10" },
        { code: "00000002", quantity: "5.000000", requiredDate: "2026-10-10" },
      ]);
      await scoped().nativeUpdate(PurchaseRequisition, { code: "00000002" }, { numerator: "0" });
      await purchaseOrder("prod", "00000007", "00000002", [
        { quantity: "8.000000", plannedDate: "2026-10-11", received: "1,5" },
        { quantity: "8.000000", plannedDate: "2026-10-11" },
      ]);
      const snapshot = await load();
      expect(snapshot.requisitions.map(({ code: id }) => id)).toEqual(["00000001"]);
      expect(snapshot.purchaseOrderLines.map(({ position }) => position)).toEqual([2]);
      expect(snapshot.unreadable).toEqual([
        { material: "00000001", location: "00000001", record: "purchase-requisition", document: "00000002" },
        { material: "00000001", location: "00000002", record: "purchase-order-line", document: "00000007/1" },
      ]);
    });

    it("leaves out a planning parameter set whose lot multiple is zero or whose minimum isn't a number, reporting it as a set", async () => {
      await parameters("prod", "00000001", "00000001", { procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000000" });
      await parameters("prod", "00000001", "00000002", { procurement: "buy", leadTimeDays: 2, minimumQuantity: "ten", lotMultiple: "1.000000" });
      await parameters("prod", "00000002", "00000001", { procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" });
      const snapshot = await load();
      expect(snapshot.planningParameters.map(({ material, location }) => [material, location])).toEqual([["00000002", "00000001"]]);
      expect(snapshot.unreadable).toEqual([
        { material: "00000001", location: "00000001", record: "planning-parameter-set" },
        { material: "00000001", location: "00000002", record: "planning-parameter-set" },
      ]);
    });

    it("leaves out a production order it can't read and reports its output and every component; a BOM line it can't read only at its component", async () => {
      // 00000003 is a second output, so each order pins its own revision.
      const sound = await recipe("prod", "00000001", "00000001", { "00000002": "2.000000" });
      const broken = await recipe("prod", "00000002", "00000003", { "00000002": "0.0000001", "00000001": "1.000000" });
      await production("prod", "00000001", sound, { quantity: "10.000000", produced: "-1", plannedStart: "2026-10-05", plannedFinish: "2026-10-08" });
      await production("prod", "00000002", broken, { output: "00000003", location: "00000002", quantity: "4.000000", plannedStart: "2026-10-05", plannedFinish: "2026-10-08" });
      const snapshot = await load();
      expect(snapshot.productionOrders).toEqual([
        expect.objectContaining({ order: "00000002", material: "00000003", components: [{ material: "00000001", perOutput: micro(1) }] }),
      ]);
      expect(snapshot.unreadable).toEqual([
        { material: "00000001", location: "00000001", record: "production-order", document: "00000001" },
        { material: "00000002", location: "00000001", record: "production-order", document: "00000001" },
        { material: "00000002", location: "00000002", record: "bom-line", document: "00000002/1/1" },
      ]);
    });

    it("flags nothing for a corrupt production order or transfer past the horizon, but reports one whose date sorts past it only because it isn't real", async () => {
      const revision = await recipe("prod", "00000001", "00000001", { "00000002": "1.000000" });
      await production("prod", "00000001", revision, { quantity: "x", plannedStart: "2027-02-01", plannedFinish: "2027-02-05" });
      await production("prod", "00000002", revision, { quantity: "5.000000", plannedStart: "30/10/2026", plannedFinish: "2026-11-02" });
      await transferRow("prod", "00000001", { quantity: "x", plannedDispatch: "2027-02-01", plannedArrival: "2027-02-02" });
      await transferRow("prod", "00000002", { quantity: "5.000000", plannedDispatch: "30/10/2026", plannedArrival: "2026-11-02" });
      await order("prod", "00000008", "00000001", [{ material: "00000001", quantity: "2.000000", requiredDate: "30/10/2026" }]);
      const snapshot = await load();
      expect(snapshot.productionOrders).toEqual([]);
      expect(snapshot.transfers).toEqual([]);
      expect([...snapshot.unreadable].sort((a, b) => `${a.record}${a.document}${a.material}${a.location}`.localeCompare(`${b.record}${b.document}${b.material}${b.location}`))).toEqual([
        { material: "00000001", location: "00000001", record: "customer-order-line", document: "00000008/1" },
        { material: "00000001", location: "00000001", record: "production-order", document: "00000002" },
        { material: "00000002", location: "00000001", record: "production-order", document: "00000002" },
        { material: "00000002", location: "00000001", record: "transfer", document: "00000002" },
        { material: "00000002", location: "00000002", record: "transfer", document: "00000002" },
      ]);
    });

    it("leaves out a transfer it can't read and reports it at its source and its destination", async () => {
      await transferRow("prod", "00000001", { quantity: "10.000000", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-5" });
      await transferRow("prod", "00000002", { quantity: "10.000000", plannedDispatch: "2026-10-05", plannedArrival: "2026-10-06" });
      const snapshot = await load();
      expect(snapshot.transfers.map(({ transfer }) => transfer)).toEqual(["00000002"]);
      expect(snapshot.unreadable).toEqual([
        { material: "00000002", location: "00000001", record: "transfer", document: "00000001" },
        { material: "00000002", location: "00000002", record: "transfer", document: "00000001" },
      ]);
    });
  });

  it("reads the current revision of every active BOM, never an older revision or an inactive BOM, and never another tenant's (#280)", async () => {
    await recipe("prod", "00000001", "00000001", { "00000002": "1.000000" });
    await recipe("prod", "00000002", "00000003", { "00000002": "1.000000" });
    await recipe("test", "00000001", "00000001", { "00000002": "1.000000" });
    const em = scoped();
    const current = await em.findOneOrFail(Bom, { code: "00000001" });
    em.create(BomRevision, { bom: current, number: 2, priority: 1, validFrom: "2026-11-01", validThrough: "2027-06-30" });
    current.revision = 2;
    (await em.findOneOrFail(Bom, { code: "00000002" })).active = false;
    await em.flush();
    expect((await load()).boms).toEqual([
      { bom: "00000001", revision: 2, priority: 1, output: "00000001", validFrom: "2026-11-01", validThrough: "2027-06-30", inactiveComponents: [], components: [] },
    ]);
  });

  it("leaves out a current revision whose validity dates aren't real days, so it covers no date (#316 review)", async () => {
    await recipe("prod", "00000001", "00000001", { "00000002": "1.000000" });
    // Revisions refuse updates (R04), so the corrupt ones are written that way, around the services.
    const em = scoped();
    const output = await em.findOneOrFail(Material, { code: "00000003" });
    for (const [code, dates] of [["00000002", { validFrom: "", validThrough: null }], ["00000003", { validFrom: "2026-01-01", validThrough: "9" }]] as const) {
      em.create(BomRevision, { bom: em.create(Bom, { code, output, revision: 1 }), number: 1, priority: 1, ...dates });
    }
    await em.flush();
    expect((await load()).boms).toEqual([
      { bom: "00000001", revision: 1, priority: 1, output: "00000001", validFrom: "2026-01-01", validThrough: null, inactiveComponents: [], components: [{ material: "00000002", perOutput: micro(1) }] },
    ]);
  });

  describe("BOM lines for the explosion (#281)", () => {
    it("reads each current revision's lines in base units by position, and its inactive components in code order (E17-S02)", async () => {
      await recipe("prod", "00000001", "00000001", { "00000003": "0.250000", "00000002": "2.000000" });
      await recipe("prod", "00000002", "00000003", { "00000002": "1.500000" });
      const em = scoped();
      // The fixture's 00000003 starts inactive: activate it, so only 00000002 is inactive first.
      (await em.findOneOrFail(Material, { code: "00000003" })).active = true;
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      await em.flush();
      expect((await load()).boms).toEqual([
        expect.objectContaining({ bom: "00000001", inactiveComponents: ["00000002"], components: [{ material: "00000003", perOutput: 250_000n }, { material: "00000002", perOutput: micro(2) }] }),
        expect.objectContaining({ bom: "00000002", output: "00000003", inactiveComponents: ["00000002"] }),
      ]);
      (await em.findOneOrFail(Material, { code: "00000002" })).active = true;
      (await em.findOneOrFail(Material, { code: "00000003" })).active = false;
      await em.flush();
      expect((await load()).boms.map(({ bom, inactiveComponents }) => [bom, inactiveComponents])).toEqual([["00000001", ["00000003"]], ["00000002", []]]);
      // Both lines of BOM 00000001 inactive: listed by code, though 00000003 is its first line.
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      await em.flush();
      expect((await load()).boms.map(({ bom, inactiveComponents }) => [bom, inactiveComponents])).toEqual([["00000001", ["00000002", "00000003"]], ["00000002", ["00000002"]]]);
    });

    it("leaves out a current revision with a line it can't read, reporting the line at its component at each of the output's Make sites, never at a Buy site", async () => {
      // Lines refuse updates (R04), so the corrupt one is written that way: seven decimals.
      await recipe("prod", "00000001", "00000001", { "00000002": "2.000000", "00000003": "0.0000001" });
      const set = { leadTimeDays: 1, minimumQuantity: "0.000000", lotMultiple: "1.000000" };
      await parameters("prod", "00000001", "00000001", { procurement: "make", ...set });
      await parameters("prod", "00000001", "00000002", { procurement: "buy", ...set });
      const snapshot = await load();
      expect(snapshot.boms).toEqual([]);
      expect(snapshot.unreadable).toEqual([{ material: "00000003", location: "00000001", record: "bom-line", document: "00000001/1/2" }]);
    });
  });

  it("reads the BOMs more than one OR list holds, chunk by chunk, filtering the current revisions in SQL as the production dialog does", async () => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      const em = traced.em.fork();
      selectTenant(em, "prod");
      const output = em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
      const input = (index: number) => em.create(Material, { code: code(1_000 + index), type: "raw", description: `Input ${index}`, baseUnit: "each" });
      for (let index = 1; index <= BOM_CHUNK + 1; index += 1) {
        const bom = em.create(Bom, { code: code(index), output, revision: 2 });
        const line = { position: 1, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1" };
        em.create(BomComponent, { ...line, material: input(index), revision: em.create(BomRevision, { bom, number: 1, priority: index, validFrom: "2026-01-01", validThrough: "2026-06-30" }) });
        // Each current revision's one line names its own input, so a line attached to the wrong revision or chunk shows.
        em.create(BomComponent, { ...line, material: input(BOM_CHUNK + 1 + index), revision: em.create(BomRevision, { bom, number: 2, priority: index, validFrom: "2026-07-01", validThrough: null }) });
      }
      await em.flush();
      queries.length = 0;
      const { boms } = await new MrpSnapshotService({ em }).load(TODAY);
      expect(boms).toHaveLength(BOM_CHUNK + 1);
      expect(boms.every(({ validFrom }) => validFrom === "2026-07-01")).toBe(true);
      expect(boms.every(({ bom, components }) => components.length === 1 && components[0].material === code(1_000 + BOM_CHUNK + 1 + Number(bom)))).toBe(true);
      // Lines are read per chunk of revisions too: one read per chunk.
      expect(queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(" from `bom_component` as "))).toHaveLength(2);
      const reads = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(" from `bom_revision` as "));
      expect(reads).toHaveLength(2);
      const plan = await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${reads[0].sql}`, [...reads[0].params]);
      // Without ANALYZE statistics SQLite seeks the tenant's revisions and tests each OR term per row, as
      // for the production dialog's own read (lesson 2026-10-31): a walk in SQLite over a table of about
      // one row per BOM change, which hydrates only the current revisions (spec implementation notes).
      expect(plan.map(({ detail }) => detail.replace(/^SEARCH \w+ /, "SEARCH ")).sort()).toEqual([
        "SEARCH USING INDEX bom_revision_tenant_code_index (tenant_code=?)",
        "SEARCH USING INDEX sqlite_autoindex_bom_1 (id=?)",
      ]);
    } finally {
      await traced.close();
    }
  });
});
