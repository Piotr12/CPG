import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Bom,
  BomComponent,
  BomRevision,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  PlanningParameterSet,
  ProductionCompletion,
  ProductionCompletionLine,
  ProductionOrder,
  StockMovement,
  StockReversal,
  Tenant,
  TenantAuditEvent,
  UniqueConstraintViolationException,
  initOrm,
  selectTenant,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { FINISHED_COMPONENT_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import {
  COMPLETION_MOVEMENTS_MESSAGE,
  EXTRA_INPUT_QUANTITY_MESSAGE,
  INACTIVE_INPUT_MESSAGE,
  MISSING_COMPONENT_MESSAGE,
  OUTPUT_AS_INPUT_MESSAGE,
  SUBMISSION_REUSED_MESSAGE,
  UNKNOWN_INPUT_MESSAGE,
  type ProductionCompletionInput,
} from "../../validators/production-orders/production-completion.schema";
import type { AuditActor } from "../audit/actor";
import * as records from "../stock/reversal-records";
import { StockService } from "../stock/stock.service";
import { TransferService } from "../transfers/transfer.service";
import { PRODUCTION_COMPLETION_MOVEMENT, ProductionCompletionService } from "./production-completion.service";
import { ProductionOrderService } from "./production-order.service";

/** The audit action whose recording crashes, to fail a completion after its posting has flushed; null when none does. */
const crash = vi.hoisted(() => ({ action: null as string | null }));
vi.mock("../audit/audit-recorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audit/audit-recorder")>();
  return {
    ...actual,
    recordTenantAudit: (...args: Parameters<typeof actual.recordTenantAudit>) => {
      if (args[2].action === crash.action) throw new Error(`crash while recording ${crash.action}`);
      actual.recordTenantAudit(...args);
    },
  };
});

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const BAR = "00000001";
const COCOA = "00000002";
const WRAPPER = "00000003";
const MILK = "00000004";
const FILLING = "00000005";
const GIFT_BOX = "00000006";
const PLANT = "00000001";
const WAREHOUSE = "00000002";
const SUBMISSION = "11111111-1111-4111-8111-111111111111";
const today = () => new Date().toISOString().slice(0, 10);

/** A completion of `output` each using `cocoa` kg and `wrappers` each, plus any added inputs. */
const completion = (output: string, cocoa: string, wrappers: string, extras: ProductionCompletionInput["components"] = []): ProductionCompletionInput => ({
  quantity: output,
  unit: "each",
  components: [{ material: COCOA, quantity: cocoa, unit: "kg" }, { material: WRAPPER, quantity: wrappers, unit: "each" }, ...extras],
});

describe("ProductionCompletionService", () => {
  let orm: Orm;
  let directory: string;
  const scoped = (tenant: TenantCode = "prod", from: Orm = orm) => {
    const em = from.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod") => new ProductionCompletionService({ em: scoped(tenant) });
  const orders = (tenant: TenantCode = "prod") => new ProductionOrderService({ em: scoped(tenant) });
  const correct = (material: string, quantity: string, location = PLANT, tenant: TenantCode = "prod") =>
    new StockService({ em: scoped(tenant) }).correct({ material, location, quantity, unit: material === WRAPPER ? "each" : material === BAR ? "each" : "kg", reason: "Count" }, ACTOR);
  const physical = async (material: string, location = PLANT) => (await new StockService({ em: scoped() }).get({ material, location })).quantity;
  const audits = (action: string) => scoped().find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } });
  const order = (target = "100") => orders().create({ output: BAR, location: PLANT, quantity: target, unit: "each", plannedFinish: "2026-11-02" }, ACTOR);
  /** What a refusal must leave untouched: no completion, no movement of it, no audit entry. */
  const nothingWritten = async () => ({
    completions: await scoped().count(ProductionCompletion, {}),
    lines: await scoped().count(ProductionCompletionLine, {}),
    movements: await scoped().count(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT }),
    audit: await scoped().count(TenantAuditEvent, {}),
    produced: (await orders().get("00000001")).produced,
  });

  beforeEach(async () => {
    crash.action = null;
    directory = mkdtempSync(path.join(tmpdir(), "cpg-completion-service-"));
    const config = loadConfig({ DATA_DIR: directory });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const bar = em.create(Material, { code: BAR, type: "finished", description: "Chocolate bar", baseUnit: "each" });
      em.create(MaterialConversion, { material: bar, unit: "case", numerator: "10", denominator: "1" });
      const cocoa = em.create(Material, { code: COCOA, type: "raw", description: "Cocoa mass", baseUnit: "kg" });
      em.create(MaterialConversion, { material: cocoa, unit: "g", numerator: "1", denominator: "1000" });
      const wrapper = em.create(Material, { code: WRAPPER, type: "raw", description: "Wrapper", baseUnit: "each" });
      em.create(Material, { code: MILK, type: "raw", description: "Milk powder", baseUnit: "kg" });
      em.create(Material, { code: FILLING, type: "intermediate", description: "Filling", baseUnit: "kg" });
      em.create(Material, { code: GIFT_BOX, type: "finished", description: "Gift box", baseUnit: "each" });
      const plant = em.create(Location, { code: PLANT, name: "Main plant" });
      em.create(Location, { code: WAREHOUSE, name: "Warehouse" });
      em.create(PlanningParameterSet, { material: bar, location: plant, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" });
      const bom = em.create(Bom, { code: "00000001", output: bar, revision: 1 });
      const revision = em.create(BomRevision, { bom, number: 1, priority: 1, validFrom: "2026-01-01", validThrough: null });
      em.create(BomComponent, { revision, position: 0, material: cocoa, quantity: "0.500000", enteredQuantity: "0.5", enteredUnit: "kg", numerator: "1", denominator: "1" });
      em.create(BomComponent, { revision, position: 1, material: wrapper, quantity: "2.000000", enteredQuantity: "2", enteredUnit: "each", numerator: "1", denominator: "1" });
      await em.flush();
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("preview", () => {
    it("proposes the pinned recipe's quantities for the output before any edit, with the stock there now (PRD-010)", async () => {
      await order();
      await correct(COCOA, "40");
      const preview = await service().preview("00000001", { quantity: "4", unit: "each" });
      expect(preview).toEqual({
        order: "00000001",
        location: PLANT,
        quantity: "4",
        baseQuantity: "4.000000",
        baseUnit: "each",
        produced: "0.000000",
        target: "100.000000",
        producedAfter: "4.000000",
        exceedsTarget: false,
        components: [
          { material: COCOA, description: "Cocoa mass", baseUnit: "kg", units: ["kg", "g"], active: true, perOutput: "0.500000", expected: "2.000000", available: "40.000000" },
          { material: WRAPPER, description: "Wrapper", baseUnit: "each", units: ["each"], active: true, perOutput: "2.000000", expected: "8.000000", available: "0.000000" },
        ],
      });
      expect((await service().preview("00000001", { quantity: "11", unit: "case" })).exceedsTarget).toBe(true);
    });

    it("keeps expecting the pinned revision after the BOM changes or is deactivated (BOM-026, LFC-022)", async () => {
      await order();
      const em = scoped();
      const bom = await em.findOneOrFail(Bom, { code: "00000001" });
      const cocoa = await em.findOneOrFail(Material, { code: COCOA });
      const revision = em.create(BomRevision, { bom, number: 2, priority: 1, validFrom: "2026-01-01", validThrough: null });
      em.create(BomComponent, { revision, position: 0, material: cocoa, quantity: "9.000000", enteredQuantity: "9", enteredUnit: "kg", numerator: "1", denominator: "1" });
      bom.revision = 2;
      bom.active = false;
      await em.flush();
      const preview = await service().preview("00000001", { quantity: "4", unit: "each" });
      expect(preview.components.map(({ material, expected }) => [material, expected])).toEqual([[COCOA, "2.000000"], [WRAPPER, "8.000000"]]);
    });

    it("refuses another tenant's order, an order that is no longer Open and an output unit it doesn't convert", async () => {
      await order();
      await expect(service("test").preview("00000001", { quantity: "4", unit: "each" })).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
      await expect(service().preview("00000001", { quantity: "4", unit: "box" })).rejects.toMatchObject({ code: "UNIT_NOT_CONVERTIBLE" });
      await expect(service().preview("00000001", { quantity: "-4", unit: "each" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await scoped().nativeUpdate(ProductionOrder, { code: "00000001" }, { status: "completed" });
      await expect(service().preview("00000001", { quantity: "4", unit: "each" })).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
    });
  });

  describe("post", () => {
    it("adds the output and consumes the actual inputs in one posting group dated today, leaving 60 outstanding (PRD-011, INV-004, PRD-023)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const { completion: posted, order: progressed } = await service().post("00000001", completion("40", "20", "80"), ACTOR);

      expect(posted).toEqual({
        id: "00000001",
        order: "00000001",
        businessDate: today(),
        quantity: "40.000000",
        enteredQuantity: "40",
        enteredUnit: "each",
        baseUnit: "each",
        waste: false,
        createdAt: expect.any(Date),
        lines: [
          { material: COCOA, baseUnit: "kg", expected: "20.000000", actual: "20.000000", variance: "0.000000", enteredQuantity: "20", enteredUnit: "kg", extra: false },
          { material: WRAPPER, baseUnit: "each", expected: "80.000000", actual: "80.000000", variance: "0.000000", enteredQuantity: "80", enteredUnit: "each", extra: false },
        ],
        reversal: null,
      });
      expect(progressed).toMatchObject({ id: "00000001", produced: "40.000000", status: "open", version: 2 });
      expect([await physical(BAR), await physical(COCOA), await physical(WRAPPER)]).toEqual(["40.000000", "80.000000", "220.000000"]);
      const movements = await scoped().find(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT }, { orderBy: { position: "asc" }, populate: ["material"] });
      const record = await scoped().findOneOrFail(ProductionCompletion, { code: "00000001" });
      expect(movements.map(({ postingId, position, material, quantity, businessDate, reason }) => ({ postingId, position, material: material.code, quantity, businessDate, reason }))).toEqual([
        { postingId: record.id, position: 0, material: BAR, quantity: "40.000000", businessDate: today(), reason: "Production completion 00000001 for production order 00000001" },
        { postingId: record.id, position: 1, material: COCOA, quantity: "-20.000000", businessDate: today(), reason: "Production completion 00000001 for production order 00000001" },
        { postingId: record.id, position: 2, material: WRAPPER, quantity: "-80.000000", businessDate: today(), reason: "Production completion 00000001 for production order 00000001" },
      ]);
    });

    it("adds a second partial completion and keeps the first (PRD-012), listing the newest first", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      await service().post("00000001", completion("40", "20", "80"), ACTOR);
      const { order: progressed } = await service().post("00000001", completion("25", "12.5", "50"), ACTOR);

      expect(progressed).toMatchObject({ produced: "65.000000", status: "open" });
      expect((await service().list("00000001")).map(({ id, quantity }) => [id, quantity])).toEqual([["00000002", "25.000000"], ["00000001", "40.000000"]]);
      expect(await service().list("00000001", 2)).toEqual([]);
      expect([await physical(BAR), await physical(COCOA), await physical(WRAPPER)]).toEqual(["65.000000", "67.500000", "170.000000"]);
      expect((await audits("production-orders.production-order.progressed")).map(({ before, after }) => [before, after])).toEqual([
        [{ produced: "0.000000", status: "open" }, { produced: "40.000000", status: "open" }],
        [{ produced: "40.000000", status: "open" }, { produced: "65.000000", status: "open" }],
      ]);
    });

    it("consumes only the actual and records the variance below or above the recipe, audited (PRD-013, PRD-014)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const below = await service().post("00000001", completion("40", "18", "80"), ACTOR);
      const above = await service().post("00000001", completion("40", "23", "79"), ACTOR);

      expect(below.completion.lines[0]).toMatchObject({ expected: "20.000000", actual: "18.000000", variance: "-2.000000" });
      expect(above.completion.lines.map(({ variance }) => variance)).toEqual(["3.000000", "-1.000000"]);
      expect(await physical(COCOA)).toBe("59.000000");
      const [entry] = await audits("production-orders.production-completion.posted");
      expect(entry).toMatchObject({
        subjectType: "ProductionCompletion",
        subjectId: "00000001",
        subjectLabel: "00000001 — order 00000001, 00000001 Chocolate bar",
        before: null,
        after: {
          id: "00000001",
          order: "00000001",
          output: BAR,
          location: PLANT,
          bom: "00000001",
          revision: 1,
          quantity: "40.000000",
          enteredQuantity: "40",
          enteredUnit: "each",
          businessDate: today(),
          lines: 2,
          line1Material: COCOA,
          line1Expected: "20.000000",
          line1Actual: "18.000000",
          line1Variance: "-2.000000",
          line1Extra: false,
          line2Material: WRAPPER,
          line2Expected: "80.000000",
          line2Actual: "80.000000",
          line2Variance: "0.000000",
          line2Extra: false,
        },
      });
      expect(entry.actorUsername).toBe("alice");
    });

    it("consumes added raw and intermediate inputs, expecting nothing of them, after the pinned components (PRD-015, PRD-016)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      await correct(MILK, "10");
      await correct(FILLING, "5");
      const { completion: posted } = await service().post(
        "00000001",
        completion("40", "20", "80", [{ material: FILLING, quantity: "1.5", unit: "kg" }, { material: MILK, quantity: "2", unit: "kg" }]),
        ACTOR,
      );

      expect(posted.lines.map(({ material, expected, actual, variance, extra }) => [material, expected, actual, variance, extra])).toEqual([
        [COCOA, "20.000000", "20.000000", "0.000000", false],
        [WRAPPER, "80.000000", "80.000000", "0.000000", false],
        [FILLING, "0.000000", "1.500000", "1.500000", true],
        [MILK, "0.000000", "2.000000", "2.000000", true],
      ]);
      expect([await physical(MILK), await physical(FILLING)]).toEqual(["8.000000", "3.500000"]);
    });

    it("lists the components in recipe order whatever order they were sent in, and converts entered units", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const { completion: posted } = await service().post(
        "00000001",
        { quantity: "1", unit: "case", components: [{ material: WRAPPER, quantity: "20", unit: "each" }, { material: COCOA, quantity: "4500", unit: "g" }] },
        ACTOR,
      );

      expect(posted).toMatchObject({ quantity: "10.000000", enteredQuantity: "1", enteredUnit: "case" });
      expect(posted.lines.map(({ material, expected, actual, variance, enteredQuantity, enteredUnit }) => [material, expected, actual, variance, enteredQuantity, enteredUnit])).toEqual([
        [COCOA, "5.000000", "4.500000", "-0.500000", "4500", "g"],
        [WRAPPER, "20.000000", "20.000000", "0.000000", "20", "each"],
      ]);
      expect(await physical(COCOA)).toBe("95.500000");
    });

    it("refuses a finished, unknown, inactive or output input and every bad line together, posting nothing (PRD-017, R02)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      await correct(MILK, "10");
      await scoped().nativeUpdate(Material, { code: FILLING }, { active: false });
      const before = await nothingWritten();
      await expect(
        service().post(
          "00000001",
          completion("40", "20", "80", [
            { material: GIFT_BOX, quantity: "1", unit: "each" },
            { material: "00000099", quantity: "1", unit: "kg" },
            { material: FILLING, quantity: "1", unit: "kg" },
            { material: BAR, quantity: "1", unit: "each" },
            { material: MILK, quantity: "0", unit: "kg" },
          ]),
          ACTOR,
        ),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: {
          "components.2.material": [FINISHED_COMPONENT_MESSAGE],
          "components.3.material": [UNKNOWN_INPUT_MESSAGE],
          "components.4.material": [INACTIVE_INPUT_MESSAGE],
          "components.5.material": [OUTPUT_AS_INPUT_MESSAGE],
          "components.6.quantity": [EXTRA_INPUT_QUANTITY_MESSAGE],
        },
      });
      expect(await nothingWritten()).toEqual(before);
    });

    it("refuses a missing recipe component and a unit a line's material doesn't convert (spec Q4)", async () => {
      await order();
      await correct(COCOA, "100");
      const before = await nothingWritten();
      await expect(
        service().post("00000001", { quantity: "40", unit: "each", components: [{ material: COCOA, quantity: "20", unit: "lb" }] }, ACTOR),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { components: [MISSING_COMPONENT_MESSAGE], "components.0.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] } });
      await expect(service().post("00000001", { ...completion("40", "20", "80"), unit: "box" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      expect(await nothingWritten()).toEqual(before);
    });

    it("records zero output as waste: inputs fall, output and produced stay, the order stays Open (PRD-018)", async () => {
      await order();
      await correct(COCOA, "100");
      const { completion: posted, order: unchanged } = await service().post("00000001", completion("0", "10", "0"), ACTOR);

      expect(posted).toMatchObject({ quantity: "0.000000", waste: true });
      expect(posted.lines.map(({ expected, actual, variance }) => [expected, actual, variance])).toEqual([
        ["0.000000", "10.000000", "10.000000"],
        ["0.000000", "0.000000", "0.000000"],
      ]);
      expect(unchanged).toMatchObject({ produced: "0.000000", status: "open", version: 1 });
      expect([await physical(BAR), await physical(COCOA)]).toEqual(["0.000000", "90.000000"]);
      expect(await scoped().count(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT })).toBe(1);
      expect(await audits("production-orders.production-order.progressed")).toEqual([]);
    });

    it("refuses a completion that produces and uses nothing", async () => {
      await order();
      const before = await nothingWritten();
      await expect(service().post("00000001", completion("0", "0", "0"), ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_EMPTY", status: 400 });
      expect(await nothingWritten()).toEqual(before);
    });

    it("warns past the target and, once accepted, completes the order at 105 (PRD-019); then refuses further completions (spec Q3)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      await service().post("00000001", completion("95", "47.5", "190"), ACTOR);
      const before = await nothingWritten();
      await expect(service().post("00000001", completion("10", "5", "20"), ACTOR)).rejects.toMatchObject({
        code: "PRODUCTION_OVERPRODUCTION",
        status: 409,
        messageParams: { produced: "95.000000", target: "100.000000", output: "10.000000", unit: "each" },
      });
      await expect(service().post("00000001", { ...completion("10", "5", "20"), acceptOverproduction: false }, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_OVERPRODUCTION" });
      expect(await nothingWritten()).toEqual(before);

      const { order: completed } = await service().post("00000001", { ...completion("10", "5", "20"), acceptOverproduction: true }, ACTOR);
      expect(completed).toMatchObject({ produced: "105.000000", status: "completed" });
      expect(await physical(BAR)).toBe("105.000000");
      await expect(service().post("00000001", completion("0", "1", "0"), ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
    });

    it("completes an order that produces exactly its target, the flag changing nothing (PRD-030, LFC-003)", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      await service().post("00000001", { ...completion("60", "30", "120"), acceptOverproduction: true }, ACTOR);
      const { order: completed } = await service().post("00000001", completion("40", "20", "80"), ACTOR);

      expect(completed).toMatchObject({ produced: "100.000000", status: "completed" });
      expect((await audits("production-orders.production-order.progressed")).at(-1)?.after).toEqual({ produced: "100.000000", status: "completed" });
    });

    it("fails the whole completion when one input or a second one would go negative (PRD-020, PRD-021, R09)", async () => {
      await order();
      await correct(COCOA, "5");
      await correct(WRAPPER, "300");
      const before = await nothingWritten();
      await expect(service().post("00000001", completion("10", "6", "20"), ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        messageParams: { material: COCOA, location: PLANT, available: "5.000000", requested: "6.000000", unit: "kg" },
      });
      await correct(COCOA, "95");
      await correct(WRAPPER, "-290");
      await expect(service().post("00000001", completion("10", "5", "20"), ACTOR)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { material: WRAPPER } });
      const after = await nothingWritten();
      expect({ ...after, audit: before.audit }).toEqual(before);
      expect(after.audit).toBe(before.audit + 2); // The two corrections only.
      expect([await physical(BAR), await physical(COCOA), await physical(WRAPPER)]).toEqual(["0.000000", "100.000000", "10.000000"]);
    });

    it("can't consume stock still in transit to the order's location until it is received (TRF-011)", async () => {
      await order();
      await correct(COCOA, "60", WAREHOUSE);
      const transfers = new TransferService({ em: scoped() });
      const transfer = await transfers.create(
        { material: COCOA, source: WAREHOUSE, destination: PLANT, quantity: "60", unit: "kg", plannedDispatch: today(), plannedArrival: today() },
        ACTOR,
      );
      await new TransferService({ em: scoped() }).dispatch(transfer.id, { quantity: "60", unit: "kg" }, ACTOR);
      await expect(service().post("00000001", completion("0", "5", "0"), ACTOR)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { available: "0.000000" } });

      await new TransferService({ em: scoped() }).receive(transfer.id, { quantity: "60", unit: "kg" }, ACTOR);
      await service().post("00000001", completion("0", "5", "0"), ACTOR);
      expect(await physical(COCOA)).toBe("55.000000");
    });

    it("keeps a deactivated pinned component's line: nothing used is allowed, anything used is refused (spec Q6)", async () => {
      await order();
      await correct(COCOA, "100");
      await scoped().nativeUpdate(Material, { code: WRAPPER }, { active: false });
      await expect(service().post("00000001", completion("10", "5", "1"), ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "components.1.quantity": [INACTIVE_INPUT_MESSAGE] },
      });
      const { completion: posted } = await service().post("00000001", completion("10", "5", "0"), ACTOR);
      expect(posted.lines[1]).toMatchObject({ material: WRAPPER, expected: "20.000000", actual: "0.000000", variance: "-20.000000" });
    });

    it("posts a repeated UI submission once and returns what it posted (spec Q7)", async () => {
      await order();
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const first = await service().post("00000001", completion("40", "20", "80"), ACTOR, { submission: SUBMISSION });
      const again = await service().post("00000001", completion("40", "20", "80"), ACTOR, { submission: SUBMISSION });

      expect(again).toEqual(first);
      expect(await scoped().count(ProductionCompletion, {})).toBe(1);
      expect(await physical(BAR)).toBe("40.000000");
      await expect(service().post("00000002", completion("40", "20", "80"), ACTOR, { submission: SUBMISSION })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { submission: [SUBMISSION_REUSED_MESSAGE] },
      });
      const other = await service().post("00000001", completion("1", "0.5", "2"), ACTOR, { submission: "22222222-2222-4222-8222-222222222222" });
      expect(other.completion.id).toBe("00000002");
    });

    it("replays the submission that completed the order instead of refusing it as no longer Open (spec Q7)", async () => {
      await order("10");
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const first = await service().post("00000001", completion("10", "5", "20"), ACTOR, { submission: SUBMISSION });
      expect(first.order.status).toBe("completed");
      const again = await service().post("00000001", completion("10", "5", "20"), ACTOR, { submission: SUBMISSION });
      expect(again).toEqual(first);
      expect(await physical(BAR)).toBe("10.000000");
    });

    it("refuses a completion that would post more stock movements than the ledger takes", async () => {
      const em = scoped();
      const output = await em.findOneOrFail(Material, { code: BAR });
      const bom = em.create(Bom, { code: "00000002", output, revision: 1 });
      const revision = em.create(BomRevision, { bom, number: 1, priority: 2, validFrom: "2026-01-01", validThrough: null });
      const codes = Array.from({ length: 100 }, (_, index) => String(index + 10).padStart(8, "0"));
      codes.forEach((code, position) => {
        const material = em.create(Material, { code, type: "raw", description: `Input ${code}`, baseUnit: "kg" });
        em.create(BomComponent, { revision, position, material, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "kg", numerator: "1", denominator: "1" });
      });
      await em.flush();
      await orders().create({ output: BAR, location: PLANT, quantity: "100", unit: "each", plannedFinish: "2026-11-02", bom: "00000002", revision: 1 }, ACTOR);
      const lines = codes.map((material) => ({ material, quantity: "1", unit: "kg" }));

      await expect(service().post("00000001", { quantity: "1", unit: "each", components: lines }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { components: [COMPLETION_MOVEMENTS_MESSAGE] },
      });
      // Waste of all 100 is exactly the ledger's limit, so it reaches the stock check.
      await expect(service().post("00000001", { quantity: "0", unit: "each", components: lines }, ACTOR)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    });

    it("refuses a produced quantity too large to store", async () => {
      await order();
      await scoped().nativeUpdate(ProductionOrder, { code: "00000001" }, { produced: "999999999999.999999", quantity: "999999999999.999999" });
      await scoped().nativeUpdate(ProductionOrder, { code: "00000001" }, { status: "open" });
      await correct(COCOA, "1");
      await expect(service().post("00000001", { ...completion("0.000001", "0", "0"), acceptOverproduction: true }, ACTOR)).rejects.toMatchObject({ code: "QUANTITY_OUT_OF_RANGE" });
    });

    it("rolls the posting back when a later write fails, leaving stock and the order as they were", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const before = await nothingWritten();
      crash.action = "production-orders.production-completion.posted";
      await expect(service().post("00000001", completion("40", "20", "80"), ACTOR)).rejects.toThrow("crash while recording");

      expect(await nothingWritten()).toEqual(before);
      expect([await physical(BAR), await physical(COCOA)]).toEqual(["0.000000", "100.000000"]);
    });

    it("numbers completions per tenant and never reads another tenant's order (TEN-014)", async () => {
      await order();
      await orders("test").create({ output: BAR, location: PLANT, quantity: "100", unit: "each", plannedFinish: "2026-11-02" }, ACTOR);
      await correct(COCOA, "100");
      await correct(COCOA, "100", PLANT, "test");
      await service().post("00000001", completion("0", "1", "0"), ACTOR);
      await service().post("00000001", completion("0", "1", "0"), ACTOR);
      expect((await service("test").post("00000001", completion("0", "1", "0"), ACTOR)).completion.id).toBe("00000001");
      expect(await service("test").list("00000001")).toHaveLength(1);
      await expect(service().post("00000002", completion("0", "1", "0"), ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
      await expect(service().list("00000009")).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
    });

    it("maps a code race and a concurrent order change to their conflicts", async () => {
      await order();
      const em = scoped();
      const spy = vi.spyOn(em, "transactional");
      const completions = new ProductionCompletionService({ em });
      spy.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(completions.post("00000001", completion("0", "1", "0"), ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_ID_RACE", status: 409 });
      spy.mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(completions.post("00000001", completion("0", "1", "0"), ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_CHANGED", status: 409 });
      spy.mockRejectedValueOnce(new Error("disk"));
      await expect(completions.post("00000001", completion("0", "1", "0"), ACTOR)).rejects.toThrow("disk");
    });

    it("refuses a completion whose stock another session issued first, leaving no output (AUD-017)", async () => {
      await order();
      await correct(COCOA, "10");
      await correct(WRAPPER, "300");
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(
          retryingStaleSnapshot(() =>
            inRequestTransaction(em, async () => {
              await new ProductionCompletionService({ em }).preview("00000001", { quantity: "20", unit: "each" });
              if (!raced) {
                raced = true;
                await new StockService({ em: scoped("prod", other) }).correct({ material: COCOA, location: PLANT, quantity: "-6", unit: "kg", reason: "Issued" }, ACTOR);
              }
              return new ProductionCompletionService({ em }).post("00000001", completion("20", "10", "40"), ACTOR);
            }),
          ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
        expect([await physical(COCOA), await physical(BAR)]).toEqual(["4.000000", "0.000000"]);
        expect(await scoped().count(ProductionCompletion, {})).toBe(0);
      } finally {
        await other.close();
      }
    });

    it("posts both of two racing completions, the second retried on what the first produced", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        const posted = await retryingStaleSnapshot(() =>
          inRequestTransaction(em, async () => {
            await new ProductionCompletionService({ em }).list("00000001");
            if (!raced) {
              raced = true;
              await new ProductionCompletionService({ em: scoped("prod", other) }).post("00000001", completion("40", "20", "80"), ACTOR);
            }
            return new ProductionCompletionService({ em }).post("00000001", completion("25", "12.5", "50"), ACTOR);
          }),
        );
        expect(posted.order).toMatchObject({ produced: "65.000000" });
        expect(posted.completion.id).toBe("00000002");
      } finally {
        await other.close();
      }
    });
  });

  describe("seedDemo", () => {
    const at = new Date("2025-06-15T23:30:00Z");

    it("posts and stamps everything from the seed's moment without audit or a submission token, completing the order", async () => {
      await order("40");
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const auditBefore = await scoped().count(TenantAuditEvent, {});
      const { completion: posted, order: progressed } = await service().seedDemo("00000001", completion("40", "21", "80"), at);

      expect(posted).toMatchObject({ id: "00000001", businessDate: "2025-06-15", createdAt: at, quantity: "40.000000", waste: false });
      expect(posted.lines.map(({ material, variance }) => [material, variance])).toEqual([[COCOA, "1.000000"], [WRAPPER, "0.000000"]]);
      expect(progressed).toMatchObject({ produced: "40.000000", status: "completed" });
      const record = await scoped().findOneOrFail(ProductionCompletion, { code: "00000001" });
      expect(record.submission).toBeNull();
      expect((await scoped().findOneOrFail(ProductionOrder, { code: "00000001" })).updatedAt).toEqual(at);
      const movements = await scoped().find(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT });
      expect(movements).toHaveLength(3);
      for (const movement of movements) expect(movement).toMatchObject({ businessDate: "2025-06-15", occurredAt: at, channel: "seed" });
      expect(await scoped().count(TenantAuditEvent, {})).toBe(auditBefore);
    });

    it("posts a zero-output waste completion at its moment and leaves the order's dates alone", async () => {
      await order();
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
      const before = (await scoped().findOneOrFail(ProductionOrder, { code: "00000001" })).updatedAt;
      const { completion: posted, order: progressed } = await service().seedDemo("00000001", completion("0", "3", "6"), at);
      expect(posted).toMatchObject({ waste: true, createdAt: at, businessDate: "2025-06-15" });
      expect(progressed).toMatchObject({ produced: "0.000000", status: "open" });
      expect((await scoped().findOneOrFail(ProductionOrder, { code: "00000001" })).updatedAt).toEqual(before);
    });

    it("applies the user's rules: stock, the overproduction acknowledgement", async () => {
      await order("40");
      await correct(COCOA, "5");
      await correct(WRAPPER, "300");
      await expect(service().seedDemo("00000001", completion("40", "20", "80"), at)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      await correct(COCOA, "100");
      await expect(service().seedDemo("00000001", completion("50", "25", "100"), at)).rejects.toMatchObject({ code: "PRODUCTION_OVERPRODUCTION" });
      expect(await scoped().count(ProductionCompletion, {})).toBe(0);
      const accepted = await service().seedDemo("00000001", { ...completion("50", "25", "100"), acceptOverproduction: true }, at);
      expect(accepted.order).toMatchObject({ produced: "50.000000", status: "completed" });
    });
  });

  describe("reverse", () => {
    const reason = { reason: "Posted against the wrong order" };
    const stockOf = async () => [await physical(BAR), await physical(COCOA), await physical(WRAPPER)];
    const untouched = async () => ({
      stock: await stockOf(),
      reversals: await scoped().count(StockMovement, { type: "reversal" }),
      links: await scoped().count(StockReversal, {}),
      audit: await scoped().count(TenantAuditEvent, {}),
      order: await orders().get("00000001"),
    });
    const stocked = async (target = "100") => {
      await order(target);
      await correct(COCOA, "100");
      await correct(WRAPPER, "300");
    };

    it("inverts the output and every input together, links each movement and lowers produced (REV-011, AUD-004)", async () => {
      await stocked();
      const posted = await service().post("00000001", completion("10", "25", "15"), ACTOR);
      const originals = await scoped().find(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT }, { orderBy: { position: "asc" } });
      const reversed = await service().reverse("00000001", "00000001", { reason: " Posted against the wrong order " }, ACTOR);

      expect(reversed.movements).toMatchObject([
        { type: "reversal", material: BAR, quantity: "-10.000000", reason: reason.reason, businessDate: today() },
        { type: "reversal", material: COCOA, quantity: "25.000000" },
        { type: "reversal", material: WRAPPER, quantity: "15.000000" },
      ]);
      const postingId = reversed.movements[0].postingId;
      expect(reversed.movements.every((movement) => movement.postingId === postingId)).toBe(true);
      expect(reversed.completion).toEqual({ ...posted.completion, reversal: { id: postingId, businessDate: today(), occurredAt: expect.any(Date), reason: reason.reason, actorUsername: "alice", channel: "ui" } });
      expect(reversed.order).toMatchObject({ produced: "0.000000", status: "open", outstanding: "100.000000", version: posted.order.version + 1 });
      expect(await stockOf()).toEqual(["0.000000", "100.000000", "300.000000"]);
      const links = await scoped().find(StockReversal, {}, { populate: ["original", "inverse"] });
      expect(links.map(({ original, inverse }) => [original.id, inverse.position]).sort()).toEqual(originals.map(({ id, position }) => [id, position]).sort());
      expect(await scoped().count(ProductionCompletion, { quantity: "10.000000" })).toBe(1);
      expect(await audits("production-orders.production-completion.reversed")).toMatchObject([{
        subjectId: "00000001", actorUsername: "alice", before: { reversed: false },
        after: { reversed: true, reversal: postingId, reason: reason.reason, movements: 3, movement1Original: originals[0].id, movement1Inverse: reversed.movements[0].id },
      }]);
      expect(await audits("production-orders.production-order.completion-reversed")).toMatchObject([{
        subjectId: "00000001", before: { produced: "10.000000", status: "open" }, after: { produced: "0.000000", status: "open", completion: "00000001" },
      }]);
      expect(await audits("stock.movement.posted")).toHaveLength(8);
      expect((await service().list("00000001"))[0].reversal).toMatchObject({ id: postingId });

      await expect(service().reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", status: 409, messageParams: { reversal: postingId } });
      expect(await scoped().count(StockReversal, {})).toBe(3);
    });

    it("refuses before anything changes when the finished output is short (REV-012, REV-018)", async () => {
      await stocked();
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      await correct(BAR, "-1");
      const before = await untouched();
      await expect(service().reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK", messageParams: { material: BAR, available: "9.000000", requested: "10.000000" },
      });
      expect(await untouched()).toEqual(before);
    });

    it("rolls back every leg, link and the order when the last audit fails after the stock flush (AUD-021)", async () => {
      await stocked();
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      const before = await untouched();
      crash.action = "production-orders.production-order.completion-reversed";
      await expect(service().reverse("00000001", "00000001", reason, ACTOR)).rejects.toThrow("crash while recording");
      expect(await untouched()).toEqual(before);
    });

    it("returns a waste posting's inputs and leaves output and the posting itself unchanged (REV-013)", async () => {
      await stocked();
      const posted = await service().post("00000001", completion("0", "10", "0"), ACTOR);
      const reversed = await service().reverse("00000001", "00000001", reason, ACTOR);
      expect(reversed.movements).toMatchObject([{ material: COCOA, quantity: "10.000000" }]);
      expect(reversed.completion).toMatchObject({ waste: true, quantity: "0.000000", lines: posted.completion.lines });
      expect(reversed.order).toMatchObject({ produced: "0.000000", status: "open", version: posted.order.version + 1 });
      expect(await physical(COCOA)).toBe("100.000000");
    });

    it("reverses only the chosen completion, reopening an automatically Completed order below target (REV-014, LFC-008)", async () => {
      await stocked("50");
      await service().post("00000001", completion("40", "20", "80"), ACTOR);
      await service().post("00000001", { ...completion("25", "12.5", "50"), acceptOverproduction: true }, ACTOR);
      expect((await orders().get("00000001")).status).toBe("completed");
      const reversed = await service().reverse("00000001", "00000002", reason, ACTOR);
      expect(reversed.order).toMatchObject({ produced: "40.000000", status: "open", outstanding: "10.000000" });
      expect(await scoped().count(StockReversal, {})).toBe(3);
      const first = await scoped().find(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT, position: 0 }, { orderBy: { occurredAt: "asc", id: "asc" } });
      expect(await records.existingReversal(scoped(), [first[0]])).toBeNull();
      expect((await service().list("00000001")).map(({ id, reversal }) => [id, reversal === null])).toEqual([["00000002", false], ["00000001", true]]);
    });

    it("keeps an overproduced order Completed when what remains still meets its target", async () => {
      await stocked("30");
      await service().post("00000001", completion("25", "12.5", "50"), ACTOR);
      await service().post("00000001", { ...completion("40", "20", "80"), acceptOverproduction: true }, ACTOR);
      expect((await service().reverse("00000001", "00000001", reason, ACTOR)).order).toMatchObject({ produced: "40.000000", status: "completed" });
    });

    it("keeps an Open order processed once every completion is reversed: Cancel refuses, Close Early resolves it", async () => {
      await stocked();
      await service().post("00000001", completion("40", "20", "80"), ACTOR);
      const { order: reversed } = await service().reverse("00000001", "00000001", reason, ACTOR);
      expect(reversed).toMatchObject({ produced: "0.000000", status: "open" });
      await expect(orders().cancel("00000001", reversed.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_PROCESSED" });
      expect(await orders().closeEarly("00000001", reversed.version, ACTOR)).toMatchObject({ status: "closed-early", abandoned: "100.000000" });
    });

    it("keeps a Closed Early order closed with its abandonment and nothing outstanding", async () => {
      await stocked();
      await service().post("00000001", completion("40", "20", "80"), ACTOR);
      const closed = await orders().closeEarly("00000001", (await orders().get("00000001")).version, ACTOR);
      expect(closed).toMatchObject({ status: "closed-early", abandoned: "60.000000", outstanding: "0.000000" });
      const reversed = await service().reverse("00000001", "00000001", reason, ACTOR);
      expect(reversed.order).toMatchObject({ produced: "0.000000", status: "closed-early", abandoned: "60.000000", outstanding: "0.000000" });
    });

    it("refuses bad input, unknown, other-order and other-tenant completions, a read-only tenant and a damaged history", async () => {
      await stocked();
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      await orders().create({ output: BAR, location: PLANT, quantity: "5", unit: "each", plannedFinish: "2026-11-02" }, ACTOR);
      const before = await untouched();
      await expect(service().reverse("00000001", "00000001", { reason: " " }, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse("00000001", "00000001", { ...reason, quantity: "5" }, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse("00000001", "1", reason, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse("00000001", "00000009", reason, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_NOT_FOUND", status: 404 });
      await expect(service().reverse("00000002", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_NOT_FOUND" });
      await expect(service("test").reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
      const stale = service();
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: true });
      await expect(stale.reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "TENANT_READ_ONLY" });
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: false });
      expect(await untouched()).toEqual(before);

      const em = scoped();
      const [original] = await em.find(StockMovement, { type: PRODUCTION_COMPLETION_MOVEMENT, position: 0 }, { populate: ["material", "location"] });
      em.create(StockMovement, { ...original, id: undefined, position: 9 } as never);
      await em.flush();
      await expect(service().reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
      expect(await scoped().count(StockReversal, {})).toBe(0);
    });

    it("lets only one of two racing reversals post, the other retried into the existing one", async () => {
      await stocked();
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(retryingStaleSnapshot(() => inRequestTransaction(em, async () => {
          await new ProductionCompletionService({ em }).list("00000001");
          if (!raced) {
            raced = true;
            await new ProductionCompletionService({ em: scoped("prod", other) }).reverse("00000001", "00000001", reason, ACTOR);
          }
          return new ProductionCompletionService({ em }).reverse("00000001", "00000001", reason, ACTOR);
        }))).rejects.toMatchObject({ code: "PRODUCTION_COMPLETION_ALREADY_REVERSED" });
        expect(await scoped().count(StockReversal, {})).toBe(3);
        expect(await stockOf()).toEqual(["0.000000", "100.000000", "300.000000"]);
      } finally {
        await other.close();
      }
    });

    it("maps a link that slips past the check, an order race and other failures", async () => {
      await stocked();
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      const first = await service().reverse("00000001", "00000001", reason, ACTOR);
      // A second completion leaves produced and finished stock that a duplicate reversal could take.
      await service().post("00000001", completion("10", "25", "15"), ACTOR);
      const spy = vi.spyOn(records, "existingReversal").mockResolvedValueOnce(null);
      await expect(service().reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({
        code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", messageParams: { reversal: first.movements[0].postingId },
      });
      spy.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const unnamed = await service().reverse("00000001", "00000001", reason, ACTOR).catch((error: unknown) => error);
      expect(unnamed).toMatchObject({ code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", messageParams: undefined });
      expect(await scoped().count(StockReversal, {})).toBe(3);
      expect(await physical(BAR)).toBe("10.000000");

      const em = scoped();
      const transactional = vi.spyOn(em, "transactional");
      const completions = new ProductionCompletionService({ em });
      transactional.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(completions.reverse("00000001", "00000001", reason, ACTOR)).rejects.toBeInstanceOf(UniqueConstraintViolationException);
      transactional.mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(completions.reverse("00000001", "00000001", reason, ACTOR)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_CHANGED", status: 409 });
    });
  });
});
