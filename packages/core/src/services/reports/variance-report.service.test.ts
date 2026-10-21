import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Bom,
  BomComponent,
  BomRevision,
  Location,
  Material,
  PlanningParameterSet,
  ProductionCompletion,
  ProductionCompletionLine,
  ProductionOrder,
  StockMovement,
  StockReversal,
  initOrm,
  selectTenant,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { VARIANCE_RANGE_MESSAGE, VARIANCE_REPORT_PAGE_SIZE } from "../../validators/reports/variance-report.schema";
import type { ProductionCompletionInput } from "../../validators/production-orders/production-completion.schema";
import type { AuditActor } from "../audit/actor";
import { ProductionCompletionService, PRODUCTION_COMPLETION_MOVEMENT } from "../production-orders/production-completion.service";
import { ProductionOrderService } from "../production-orders/production-order.service";
import { StockService } from "../stock/stock.service";
import { VarianceReportService } from "./variance-report.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const BAR = "00000001";
const COCOA = "00000002";
const WRAPPER = "00000003";
const MILK = "00000004";
const GIFT_BOX = "00000005";
const PLANT = "00000001";
const WAREHOUSE = "00000002";
const today = () => new Date().toISOString().slice(0, 10);
const dayFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** A completion of `output` bars using `cocoa` kg and `wrappers` wrappers, plus any added inputs. */
const completion = (output: string, cocoa: string, wrappers: string, extras: ProductionCompletionInput["components"] = []): ProductionCompletionInput => ({
  quantity: output,
  unit: "each",
  components: [{ material: COCOA, quantity: cocoa, unit: "kg" }, { material: WRAPPER, quantity: wrappers, unit: "each" }, ...extras],
});

describe("VarianceReportService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const report = (query: Record<string, unknown> = {}, tenant: TenantCode = "prod") => new VarianceReportService({ em: scoped(tenant) }).read(query);
  const orders = (tenant: TenantCode = "prod") => new ProductionOrderService({ em: scoped(tenant) });
  const order = (target: string, location = PLANT, tenant: TenantCode = "prod") =>
    orders(tenant).create({ output: BAR, location, quantity: target, unit: "each", plannedFinish: "2026-11-02" }, ACTOR);
  const post = (orderId: string, input: ProductionCompletionInput, tenant: TenantCode = "prod") =>
    new ProductionCompletionService({ em: scoped(tenant) }).post(orderId, { ...input, acceptOverproduction: true }, ACTOR);
  const stock = async (location = PLANT, tenant: TenantCode = "prod") => {
    for (const [material, quantity, unit] of [[COCOA, "10000", "kg"], [WRAPPER, "10000", "each"], [MILK, "1000", "kg"]]) {
      await new StockService({ em: scoped(tenant) }).correct({ material, location, quantity, unit, reason: "Count" }, ACTOR);
    }
  };
  /**
   * Links completion `code`'s first movement to an inverse, as a completion reversal will (spec Q5):
   * #92 isn't built yet, so the link and its inverse movement are written here by hand.
   */
  const reverse = async (code: string) => {
    const em = scoped();
    const posted = await em.findOneOrFail(ProductionCompletion, { code });
    const original = (await em.find(StockMovement, { postingId: posted.id, type: PRODUCTION_COMPLETION_MOVEMENT }, { populate: ["material", "location"], orderBy: { position: "asc" }, limit: 1 }))[0];
    const inverse = em.create(StockMovement, {
      postingId: randomUUID(), position: 0, type: "production-completion-reversal", material: original.material, location: original.location,
      businessDate: today(), quantity: "0.000000", baseUnit: original.baseUnit, enteredQuantity: "0", enteredUnit: original.baseUnit,
      numerator: "1", denominator: "1", balanceBefore: "0.000000", balanceAfter: "0.000000", reason: "Wrong posting", actorUserId: null, actorUsername: "alice", channel: "ui",
    });
    em.create(StockReversal, { original, inverse });
    await em.flush();
  };

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-variance-report-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const bar = em.create(Material, { code: BAR, type: "finished", description: "Chocolate bar", baseUnit: "each" });
      const cocoa = em.create(Material, { code: COCOA, type: "raw", description: "Cocoa mass", baseUnit: "kg" });
      const wrapper = em.create(Material, { code: WRAPPER, type: "raw", description: "Wrapper", baseUnit: "each" });
      em.create(Material, { code: MILK, type: "raw", description: "Milk powder", baseUnit: "kg" });
      em.create(Material, { code: GIFT_BOX, type: "finished", description: "Gift box", baseUnit: "each" });
      const plant = em.create(Location, { code: PLANT, name: "Main plant" });
      const warehouse = em.create(Location, { code: WAREHOUSE, name: "Warehouse" });
      for (const location of [plant, warehouse]) {
        em.create(PlanningParameterSet, { material: bar, location, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" });
      }
      const bom = em.create(Bom, { code: "00000001", output: bar, revision: 1 });
      const revision = em.create(BomRevision, { bom, number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
      em.create(BomComponent, { revision, position: 0, material: cocoa, quantity: "0.500000", enteredQuantity: "0.5", enteredUnit: "kg", numerator: "1", denominator: "1" });
      em.create(BomComponent, { revision, position: 1, material: wrapper, quantity: "2.000000", enteredQuantity: "2", enteredUnit: "each", numerator: "1", denominator: "1" });
      await em.flush();
    }
  });
  afterEach(() => orm.close());

  it("compares the target with what was produced, and each component's expected with its actual, extra inputs included (PRD-013, PRD-014, PRD-015)", async () => {
    await stock();
    await order("40");
    await post("00000001", completion("40", "18", "80", [{ material: MILK, quantity: "2", unit: "kg" }]));

    expect(await report()).toEqual({
      asOf: today(),
      page: 1,
      pageSize: VARIANCE_REPORT_PAGE_SIZE,
      total: 1,
      rows: [
        {
          id: "00000001",
          output: BAR,
          outputDescription: "Chocolate bar",
          baseUnit: "each",
          location: PLANT,
          locationName: "Main plant",
          status: "completed",
          bom: "00000001",
          revision: 1,
          target: "40.000000",
          produced: "40.000000",
          outputVariance: "0.000000",
          completions: 1,
          wasteCompletions: 0,
          reversed: [],
          components: [
            { material: COCOA, description: "Cocoa mass", baseUnit: "kg", extra: false, expected: "20.000000", actual: "18.000000", variance: "-2.000000", waste: "0.000000" },
            { material: WRAPPER, description: "Wrapper", baseUnit: "each", extra: false, expected: "80.000000", actual: "80.000000", variance: "0.000000", waste: "0.000000" },
            { material: MILK, description: "Milk powder", baseUnit: "kg", extra: true, expected: "0.000000", actual: "2.000000", variance: "2.000000", waste: "0.000000" },
          ],
        },
      ],
    });
  });

  it("sums an order's completions, and shows a zero-output waste posting as such (PRD-018)", async () => {
    await stock();
    await order("100");
    await post("00000001", completion("30", "16", "60"));
    await post("00000001", completion("10", "5", "20"));
    await post("00000001", completion("0", "10", "0"));

    const [row] = (await report()).rows;
    expect(row).toMatchObject({ status: "open", target: "100.000000", produced: "40.000000", outputVariance: "-60.000000", completions: 3, wasteCompletions: 1 });
    expect(row.components).toEqual([
      expect.objectContaining({ material: COCOA, expected: "20.000000", actual: "31.000000", variance: "11.000000", waste: "10.000000" }),
      expect.objectContaining({ material: WRAPPER, expected: "80.000000", actual: "80.000000", variance: "0.000000", waste: "0.000000" }),
    ]);
  });

  it("leaves a reversed completion out of every figure and lists it as reversed, keeping the others (REV-011, REV-014)", async () => {
    await stock();
    await order("100");
    await post("00000001", completion("40", "20", "80"));
    await post("00000001", completion("25", "15", "50", [{ material: MILK, quantity: "1", unit: "kg" }]));
    await post("00000001", completion("0", "4", "0"));
    await reverse("00000002");
    await reverse("00000003");

    const [row] = (await report()).rows;
    expect(row).toMatchObject({ produced: "40.000000", outputVariance: "-60.000000", completions: 1, wasteCompletions: 0, reversed: ["00000002", "00000003"] });
    expect(row.components.map(({ material, expected, actual, variance, waste }) => [material, expected, actual, variance, waste])).toEqual([
      [COCOA, "20.000000", "20.000000", "0.000000", "0.000000"],
      [WRAPPER, "80.000000", "80.000000", "0.000000", "0.000000"],
    ]);
  });

  it("keeps an order whose only completions are reversed, with nothing counted, so the reversal stays visible", async () => {
    await stock();
    await order("25");
    await post("00000001", completion("25", "12.5", "50"));
    await reverse("00000001");

    expect((await report()).rows).toEqual([
      expect.objectContaining({ id: "00000001", produced: "0.000000", outputVariance: "-25.000000", completions: 0, wasteCompletions: 0, reversed: ["00000001"], components: [] }),
    ]);
  });

  it("holds no cost, value or capacity figure: a row and a component have exactly these keys (N01, N04)", async () => {
    await stock();
    await order("10");
    await post("00000001", completion("10", "5", "20"));

    const [row] = (await report()).rows;
    expect(Object.keys(row).sort()).toEqual(
      ["baseUnit", "bom", "completions", "components", "id", "location", "locationName", "output", "outputDescription", "outputVariance", "produced", "reversed", "revision", "status", "target", "wasteCompletions"],
    );
    expect(Object.keys(row.components[0]).sort()).toEqual(["actual", "baseUnit", "description", "expected", "extra", "material", "variance", "waste"]);
  });

  it("leaves out orders with no completion, and shows nothing for a tenant with none", async () => {
    await stock();
    await order("10");
    expect(await report()).toMatchObject({ total: 0, rows: [] });
    expect(await report({ material: MILK })).toMatchObject({ total: 0, rows: [] });
  });

  it("reads only its own tenant (R05)", async () => {
    await stock();
    await order("10");
    await post("00000001", completion("10", "5", "20"));
    expect((await report({}, "prod")).total).toBe(1);
    expect(await report({}, "test")).toMatchObject({ total: 0, rows: [] });
  });

  it("narrows rows by location and by state", async () => {
    await stock(PLANT);
    await stock(WAREHOUSE);
    await order("10", PLANT);
    await order("100", WAREHOUSE);
    await post("00000001", completion("10", "5", "20"));
    await post("00000002", completion("10", "5", "20"));
    await post("00000002", completion("0", "1", "0"));

    const ids = async (query: Record<string, unknown>) => (await report(query)).rows.map(({ id }) => id);
    expect(await ids({ location: PLANT })).toEqual(["00000001"]);
    expect(await ids({ location: WAREHOUSE })).toEqual(["00000002"]);
    expect(await ids({ status: "completed" })).toEqual(["00000001"]);
    expect(await ids({ status: "open" })).toEqual(["00000002"]);
    expect(await ids({ status: "open", location: PLANT })).toEqual([]);
    const { version } = await orders().get("00000002");
    await orders().closeEarly("00000002", version, ACTOR);
    expect(await ids({ status: "closed-early" })).toEqual(["00000002"]);
    expect((await report({ location: WAREHOUSE })).rows[0]).toMatchObject({ completions: 2, wasteCompletions: 1 });
  });

  it("narrows by posting date, inclusive, and gives no output variance under a range (spec Q2)", async () => {
    await stock();
    await order("100");
    await post("00000001", completion("40", "20", "80"));

    expect((await report({ from: today(), to: today() })).rows[0]).toMatchObject({ produced: "40.000000", outputVariance: null });
    expect((await report({ from: today() })).total).toBe(1);
    expect((await report({ to: today() })).rows[0].outputVariance).toBeNull();
    expect((await report({ to: dayFromToday(-1) })).total).toBe(0);
    expect((await report({ from: dayFromToday(1) })).total).toBe(0);
    expect((await report({ from: "", to: "" })).rows[0].outputVariance).toBe("-60.000000");
  });

  it("narrows by material: the output, or a counted line that expected or used it (spec Q6)", async () => {
    await stock();
    await order("10");
    await order("10");
    await order("10");
    await order("10");
    await post("00000001", completion("10", "5", "20", [{ material: MILK, quantity: "1", unit: "kg" }]));
    await post("00000002", completion("10", "5", "20"));
    // A waste posting stores its pinned wrapper line with nothing expected or used.
    await post("00000003", completion("0", "1", "0"));
    // Milk on a reversed completion matches nothing.
    await post("00000004", completion("5", "2.5", "10", [{ material: MILK, quantity: "1", unit: "kg" }]));
    await reverse("00000004");

    const ids = async (material: string) => (await report({ material })).rows.map(({ id }) => id);
    expect(await ids(BAR)).toEqual(["00000001", "00000002", "00000003", "00000004"]);
    expect(await ids(MILK)).toEqual(["00000001"]);
    expect(await ids(WRAPPER)).toEqual(["00000001", "00000002"]);
    expect(await ids(COCOA)).toEqual(["00000001", "00000002", "00000003"]);
    expect(await ids(GIFT_BOX)).toEqual([]);
    // The row still shows all its components.
    expect((await report({ material: MILK })).rows[0].components.map(({ material }) => material)).toEqual([COCOA, WRAPPER, MILK]);
  });

  it("refuses a filter naming a record this tenant doesn't have, a reversed range and an unknown parameter", async () => {
    await expect(report({ material: "00000099" })).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(report({ location: "00000099" })).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(report({ from: "2026-10-22", to: "2026-10-21" })).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { to: [VARIANCE_RANGE_MESSAGE] } });
    await expect(report({ state: "open" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("orders rows by order ID across pages, reading completions and lines in batches past one batch (spec Q7, Q8)", async () => {
    const orderCount = 60;
    const perOrder = 9;
    for (let index = 0; index < orderCount; index++) await order("1000");
    const em = scoped();
    const [cocoa, wrapper] = [await em.findOneOrFail(Material, { code: COCOA }), await em.findOneOrFail(Material, { code: WRAPPER })];
    const all = await em.find(ProductionOrder, {});
    let code = 0;
    for (const record of all) {
      for (let index = 0; index < perOrder; index++) {
        code += 1;
        const posted = em.create(ProductionCompletion, {
          id: randomUUID(), code: String(code).padStart(8, "0"), order: record, businessDate: "2026-10-01", quantity: "2.000000",
          enteredQuantity: "2", enteredUnit: "each", numerator: "1", denominator: "1", submission: null,
        });
        const line = { enteredUnit: "kg", numerator: "1", denominator: "1", extra: false };
        em.create(ProductionCompletionLine, { ...line, completion: posted, position: 0, material: cocoa, expected: "1.000000", actual: "1.500000", variance: "0.500000", enteredQuantity: "1.5" });
        em.create(ProductionCompletionLine, { ...line, completion: posted, position: 1, material: wrapper, expected: "4.000000", actual: "4.000000", variance: "0.000000", enteredQuantity: "4", enteredUnit: "each" });
      }
    }
    await em.flush();

    const first = await report();
    expect(first.total).toBe(orderCount);
    expect(first.rows.map(({ id }) => id)).toEqual(Array.from({ length: VARIANCE_REPORT_PAGE_SIZE }, (_, index) => String(index + 1).padStart(8, "0")));
    expect(first.rows[0]).toMatchObject({ produced: "18.000000", completions: perOrder });
    expect(first.rows[0].components).toEqual([
      expect.objectContaining({ material: COCOA, expected: "9.000000", actual: "13.500000", variance: "4.500000" }),
      expect.objectContaining({ material: WRAPPER, expected: "36.000000", actual: "36.000000", variance: "0.000000" }),
    ]);
    expect((await report({ page: "2" })).rows.map(({ id }) => id)).toEqual(Array.from({ length: 10 }, (_, index) => String(index + 51).padStart(8, "0")));
    expect(await report({ page: "3" })).toMatchObject({ page: 3, total: orderCount, rows: [] });
    expect((await report({ material: COCOA, from: "2026-10-01" })).total).toBe(orderCount);
  });
});
