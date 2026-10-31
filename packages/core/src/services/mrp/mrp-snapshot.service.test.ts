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
import { ORDER_LINE_CHUNK, ORDER_PAGE, REQUISITION_PAGE } from "./snapshot/purchasing";

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
        quantity: micro(100), produced: 40_500_000n, abandoned: 0n, status: "open", components: lines,
      },
      {
        order: "00000002", material: "00000001", location: "00000002", plannedStart: "2026-10-05", plannedFinish: "2026-10-10",
        quantity: micro(10), produced: 0n, abandoned: 0n, status: "open", components: lines,
      },
    ]);
    expect(productionOrders.every(({ components }) => components.length === 2)).toBe(true);
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

  it("returns an empty snapshot for a tenant with nothing to plan", async () => {
    expect(await load()).toEqual({
      stock: [], orderLines: [], forecasts: [], safetyTargets: [], requisitions: [], purchaseOrderLines: [], productionOrders: [], transfers: [],
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

  it("seeks the production-order and transfer reads through their (tenant, status, code) indexes and the line read by revision", async () => {
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
      const explain = async (table: string) => {
        const sent = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(` from \`${table}\` as `));
        expect(sent).toHaveLength(1);
        const plan = await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sent[0].sql}`, [...sent[0].params]);
        return plan.map(({ detail }) => detail);
      };
      // The tenant filter joins each relation by key; either direction of the status list index seeks.
      const unaliased = (details: string[]) => details.map((detail) => detail.replace(/^SEARCH \w+ /, "SEARCH ")).sort();
      expect(unaliased(await explain("production_order"))).toEqual([
        expect.stringMatching(/^SEARCH USING INDEX production_order_tenant_code_status(_desc)?_code_index \(tenant_code=\? AND status=\?\)$/),
        "SEARCH USING INDEX sqlite_autoindex_bom_revision_1 (id=?)",
        "SEARCH USING INDEX sqlite_autoindex_location_1 (id=?)",
        "SEARCH USING INDEX sqlite_autoindex_material_1 (id=?)",
      ]);
      expect((await explain("bom_component")).sort()).toEqual([
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
});
