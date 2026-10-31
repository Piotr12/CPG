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
  initOrm,
  Location,
  Material,
  ProductionOrder,
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

// The horizon of 1 October 2026 runs to 29 December; the read takes lines due before 30 December.
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

  it("reads overdue Open lines and lines due on the horizon's last day, but no removed, non-Open or later line", async () => {
    await order("prod", "00000001", "00000001", [
      { material: "00000001", quantity: "1", requiredDate: "2026-09-30" },
      { material: "00000001", quantity: "2", requiredDate: "2026-12-29" },
      { material: "00000001", quantity: "3", requiredDate: "2026-12-30" },
      { material: "00000001", quantity: "4", requiredDate: "2026-10-02", removed: true },
    ]);
    // Closed early and cancelled lines keep a remainder, as a reversed goods issue leaves one, so only
    // the status filter keeps them out (lesson 2026-10-27, "Test a status filter").
    for (const [code, status] of [["00000002", "closed-early"], ["00000003", "cancelled"], ["00000004", "completed"]] as const) {
      await order("prod", code, "00000001", [{ material: "00000001", quantity: "5", requiredDate: "2026-10-02", status }]);
    }

    const { orderLines } = await load();

    expect(orderLines.map(({ order, position, requiredDate }) => [order, position, requiredDate]).sort()).toEqual([
      ["00000001", 1, "2026-09-30"],
      ["00000001", 2, "2026-12-29"],
    ]);
  });

  it("plans inactive materials and locations by their data, not their flags", async () => {
    await stock("prod", "00000003", "00000003", "7");
    await order("prod", "00000001", "00000003", [{ material: "00000003", quantity: "2", requiredDate: "2026-10-05" }]);

    const inputs = await load();

    expect(inputs.stock).toEqual([{ material: "00000003", location: "00000003", physical: micro(7) }]);
    expect(inputs.orderLines.map(({ material, location }) => [material, location])).toEqual([["00000003", "00000003"]]);
  });

  it("never reads another tenant's stock or lines (MRP-002)", async () => {
    await stock("prod", "00000001", "00000001", "100");
    await order("prod", "00000001", "00000001", [{ material: "00000001", quantity: "40", requiredDate: "2026-10-10" }]);
    await stock("test", "00000001", "00000001", "5");
    await order("test", "00000001", "00000001", [{ material: "00000001", quantity: "70", requiredDate: "2026-10-10" }]);

    const prod = await load("prod");
    const test = await load("test");

    expect(prod.stock.map(({ physical }) => physical)).toEqual([micro(100)]);
    expect(prod.orderLines.map(({ quantity }) => quantity)).toEqual([micro(40)]);
    expect(test.stock.map(({ physical }) => physical)).toEqual([micro(5)]);
    expect(test.orderLines.map(({ quantity }) => quantity)).toEqual([micro(70)]);
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
      const code = String(number).padStart(8, "0");
      const revision = await recipe("prod", code, "00000001", { "00000002": String(number) });
      await production("prod", code, revision, { quantity: "1", plannedStart: "2026-10-05", plannedFinish: "2026-10-10" });
    }

    const { productionOrders } = await load();

    expect(productionOrders).toHaveLength(101);
    for (const { order, components } of productionOrders) expect(components).toEqual([{ material: "00000002", perOutput: micro(Number(order)) }]);
  });

  it("starts the line read from the (tenant, material, removed, status) index and joins each line's order by key", async () => {
    // EXPLAIN the query MikroORM really sends (lesson 2026-10-25), on a schema without ANALYZE statistics.
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-snapshot-plan-")) });
    await migrateDatabase(config);
    const traced = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      const em = traced.em.fork();
      selectTenant(em, "prod");
      em.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
      await em.flush();
      await new MrpSnapshotService({ em }).load(TODAY);
      const sent = queries.filter(({ sql }) => sql.includes(" from `customer_order_line` as "));
      expect(sent).toHaveLength(1);
      const plan = await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sent[0].sql}`, [...sent[0].params]);
      // Each table is reached by key or by the line index; with `required_date < ?` in the query, the
      // lines were read through `(tenant, required_date)`, every line of the tenant before that day.
      expect(plan.map(({ detail }) => detail).sort()).toEqual([
        "SEARCH c0 USING INDEX customer_order_line_tenant_code_material_id_removed_status_id_index (tenant_code=? AND material_id=? AND removed=? AND status=?)",
        "SEARCH m2 USING INDEX sqlite_autoindex_material_1 (id=?)",
        "SEARCH o1 USING INDEX sqlite_autoindex_customer_order_1 (id=?)",
      ]);
    } finally {
      await traced.close();
    }
  });

  it("seeks the production-order read through the (tenant, status, code) index and the line read by revision", async () => {
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
      await em.flush();
      await new MrpSnapshotService({ em }).load(TODAY);
      const explain = async (table: string) => {
        const sent = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(` from \`${table}\` as `));
        expect(sent).toHaveLength(1);
        const plan = await traced.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sent[0].sql}`, [...sent[0].params]);
        return plan.map(({ detail }) => detail);
      };
      // The tenant filter joins each relation by key; either direction of the status list index seeks.
      expect((await explain("production_order")).sort()).toEqual([
        "SEARCH l2 USING INDEX sqlite_autoindex_location_1 (id=?)",
        "SEARCH o1 USING INDEX sqlite_autoindex_material_1 (id=?)",
        expect.stringMatching(/^SEARCH p0 USING INDEX production_order_tenant_code_status(_desc)?_code_index \(tenant_code=\? AND status=\?\)$/),
        "SEARCH r3 USING INDEX sqlite_autoindex_bom_revision_1 (id=?)",
      ]);
      expect((await explain("bom_component")).sort()).toEqual([
        "SEARCH b0 USING INDEX bom_component_revision_id_index (revision_id=?)",
        "SEARCH m2 USING INDEX sqlite_autoindex_material_1 (id=?)",
        "SEARCH r1 USING INDEX sqlite_autoindex_bom_revision_1 (id=?)",
      ]);
    } finally {
      await traced.close();
    }
  });

  it("returns an empty snapshot for a tenant with nothing to plan", async () => {
    expect(await load()).toEqual({ stock: [], orderLines: [], productionOrders: [], transfers: [] });
  });
});
