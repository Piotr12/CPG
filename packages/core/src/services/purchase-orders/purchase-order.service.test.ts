import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  GoodsReceipt,
  GoodsReceiptLine,
  initOrm,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequisition,
  selectTenant,
  StockMovement,
  Supplier,
  TenantAuditEvent,
  UniqueConstraintViolationException,
  type EntityManager,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import {
  LINE_LOCATION_MESSAGE,
  LINE_NO_SUCH_LINE_MESSAGE,
  LINE_REQUISITION_LOCATION_MESSAGE,
  LINE_REQUISITION_MATERIAL_MESSAGE,
} from "../../validators/purchasing/purchasing-fields.schema";
import type { AuditActor } from "../audit/actor";
import { GoodsReceiptService } from "../goods-receipts/goods-receipt.service";
import { LocationService } from "../locations/location.service";
import { MaterialService } from "../materials/material.service";
import { PurchaseRequisitionService } from "../purchase-requisitions/purchase-requisition.service";
import { StockService } from "../stock/stock.service";
import { SupplierService } from "../suppliers/supplier.service";
import { ORDER_ID_RACE, PurchaseOrderService, type NewOrder, type NewOrderLine } from "./purchase-order.service";

/** Who the tests act as: a normal user, on the UI (any signed-in account may write). */
const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const ADMIN: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

const line = (material: string, quantity: string, unit: string, plannedDate: string, extra: Partial<NewOrderLine> = {}): NewOrderLine => ({
  material,
  quantity,
  unit,
  plannedDate,
  ...extra,
});

/** A direct order to supplier 1 at location 1: 20 kg of steel on Wednesday, 10 bolts on Friday. */
const DIRECT: NewOrder = {
  supplier: "00000001",
  location: "00000001",
  lines: [line("00000001", "20", "kg", "2027-03-03"), line("00000002", "10", "each", "2027-03-05")],
};

async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-order-service-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

/** One tenant's masters: steel (kg, t) and bolts, an inactive rivet; locations 1, 2 and an inactive 3; suppliers 1, 2 and an inactive 3. */
async function seedMasters(orm: Orm, tenant: TenantCode = "prod") {
  const em = orm.em.fork();
  selectTenant(em, tenant);
  const steel = em.create(Material, { code: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg" });
  em.create(MaterialConversion, { material: steel, unit: "t", numerator: "1000", denominator: "1" });
  em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
  em.create(Material, { code: "00000003", type: "raw", description: "Old rivet", baseUnit: "each", active: false });
  em.create(Location, { code: "00000001", name: "Main plant" });
  em.create(Location, { code: "00000002", name: "Warehouse" });
  em.create(Location, { code: "00000003", name: "Old quarry", active: false });
  em.create(Supplier, { code: "00000001", name: "Steel Service" });
  em.create(Supplier, { code: "00000002", name: "Fasteners Wholesale" });
  em.create(Supplier, { code: "00000003", name: "Gone Ltd", active: false });
  await em.flush();
}

describe("PurchaseOrderService", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em: EntityManager = scopedEm(tenant)) => new PurchaseOrderService({ em });
  const requisitions = (tenant: TenantCode = "prod") => new PurchaseRequisitionService({ em: scopedEm(tenant) });
  /** A 100 kg steel requisition for location 1, which orders convert. */
  const requisition = (overrides: Partial<Parameters<PurchaseRequisitionService["create"]>[0]> = {}) =>
    requisitions().create({ material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2027-03-01", ...overrides }, ACTOR);
  const entries = async (action: string, tenant: TenantCode = "prod") =>
    (await scopedEm(tenant).find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(
      ({ subjectId, subjectLabel, before, after }) => ({ subjectId, subjectLabel, before, after }),
    );
  /** An order converting `quantity` kg of requisition `id`, to `supplier` at location 1. */
  const converting = (id: string, quantity: string, supplier = "00000001"): NewOrder => ({
    supplier,
    location: "00000001",
    lines: [line("00000001", quantity, "kg", "2027-03-04", { requisition: id })],
  });

  beforeEach(async () => {
    orm = await freshOrm();
    await seedMasters(orm);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  it("lists in pages of 100 by ID, each with its own lines only, and counts the tenant's orders", async () => {
    const em = scopedEm();
    const supplier = await em.findOneOrFail(Supplier, { code: "00000001" });
    const location = await em.findOneOrFail(Location, { code: "00000001" });
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    for (let index = 1; index <= 101; index++) {
      const order = em.create(PurchaseOrder, { code: String(index).padStart(8, "0"), supplier, location, status: "open" });
      for (let position = 1; position <= 1 + (index % 2); position++) {
        em.create(PurchaseOrderLine, {
          order, position, material, quantity: `${index}.000000`, enteredQuantity: String(index), enteredUnit: "kg", numerator: "1", denominator: "1", plannedDate: "2027-03-03",
        });
      }
    }
    await em.flush();

    const first = await service().list();
    expect(first).toHaveLength(100);
    expect([first[0].id, first[99].id]).toEqual(["00000001", "00000100"]);
    expect(first.every(({ id, lines }) => lines.length === 1 + (Number(id) % 2) && lines.every(({ quantity }) => quantity === `${Number(id)}.000000`))).toBe(true);
    expect((await service().list({ page: 1 })).map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect((await service().list({ page: 2 })).map(({ id }) => id)).toEqual(["00000101"]);
    expect(await service().list({ page: 3 })).toEqual([]);
    expect(await service().count()).toBe(101);
    expect(await service("test").count()).toBe(0);
  });

  it("marks a line posted once any goods receipt was posted for it, beyond the newest 100 and after a full reversal (#138)", async () => {
    const order = await service().create(DIRECT, ACTOR);
    expect(order.lines.map(({ posted }) => posted)).toEqual([false, false]);
    // Line 2's only receipt is older than the 100 for line 1; a full reversal leaves both received at zero.
    const em = scopedEm();
    const [steel, bolts] = await em.find(PurchaseOrderLine, { order: { code: order.id } }, { populate: ["order"], orderBy: { position: "asc" } });
    for (let index = 1; index <= 101; index++) {
      const receipt = em.create(GoodsReceipt, { code: String(index).padStart(8, "0"), order: steel.order, businessDate: "2027-03-01" });
      em.create(GoodsReceiptLine, { receipt, position: 0, orderLine: index === 1 ? bolts : steel, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1" });
    }
    await em.flush();
    const newest = await new GoodsReceiptService({ em: scopedEm() }).list({ purchaseOrder: order.id });
    expect(newest.some(({ lines }) => lines.some(({ line }) => line === 2))).toBe(false);

    const reading = scopedEm();
    const find = vi.spyOn(reading, "find");
    const read = await service("prod", reading).get(order.id);
    expect(read.lines.map(({ received, posted }) => ({ received, posted }))).toEqual([
      { received: "0.000000", posted: true }, { received: "0.000000", posted: true },
    ]);
    // Many receipts for line 1 fill one bounded result; line 2 is still found by the next query.
    expect(find.mock.calls.filter(([entity]) => entity === GoodsReceiptLine).length).toBeLessThanOrEqual(2);
    expect((await service().list())[0].lines.map(({ posted }) => posted)).toEqual([true, true]);

    // A line with something received is posted without a lookup.
    await scopedEm().nativeUpdate(PurchaseOrderLine, { order: { code: order.id } }, { received: "1.000000" });
    const received = scopedEm();
    const lookup = vi.spyOn(received, "find");
    expect((await service("prod", received).get(order.id)).lines.map(({ posted }) => posted)).toEqual([true, true]);
    expect(lookup.mock.calls.filter(([entity]) => entity === GoodsReceiptLine)).toEqual([]);
  });

  describe("sorted and searched (#217)", () => {
    /** Stores an order of one steel line as it stands, bypassing the create rules (inactive masters, any status). */
    const store = async (em: EntityManager, code: string, supplier: string, location: string, status: string) => {
      const order = em.create(PurchaseOrder, {
        code, supplier: await em.findOneOrFail(Supplier, { code: supplier }), location: await em.findOneOrFail(Location, { code: location }), status,
      });
      em.create(PurchaseOrderLine, {
        order, position: 1, material: await em.findOneOrFail(Material, { code: "00000001" }), quantity: "1.000000", enteredQuantity: "1", enteredUnit: "kg",
        numerator: "1", denominator: "1", plannedDate: "2027-03-03",
      });
    };
    const ids = (orders: { id: string }[]) => orders.map(({ id }) => id);

    beforeEach(async () => {
      // Inserted out of ID order, so an unordered read wouldn't look sorted.
      const em = scopedEm();
      await store(em, "00000003", "00000002", "00000001", "open");
      await store(em, "00000001", "00000001", "00000002", "completed");
      await store(em, "00000002", "00000003", "00000001", "cancelled");
      await store(em, "00000004", "00000001", "00000001", "open");
      await em.flush();
      await seedMasters(orm, "test");
      await service("test").create(DIRECT, ACTOR);
    });

    it("sorts by each column, both ways, by ID within equal values", async () => {
      expect(ids(await service().list({ sort: "id", dir: "desc" }))).toEqual(["00000004", "00000003", "00000002", "00000001"]);
      expect(ids(await service().list({ sort: "supplier" }))).toEqual(["00000001", "00000004", "00000003", "00000002"]);
      expect(ids(await service().list({ sort: "supplier", dir: "desc" }))).toEqual(["00000002", "00000003", "00000001", "00000004"]);
      expect(ids(await service().list({ sort: "location" }))).toEqual(["00000002", "00000003", "00000004", "00000001"]);
      expect(ids(await service().list({ sort: "location", dir: "desc" }))).toEqual(["00000001", "00000002", "00000003", "00000004"]);
      expect(ids(await service().list({ sort: "status" }))).toEqual(["00000002", "00000001", "00000003", "00000004"]);
      expect(ids(await service().list({ sort: "status", dir: "desc" }))).toEqual(["00000003", "00000004", "00000001", "00000002"]);
    });

    it("sorts by the creation date, both ways, by ID within equal times (#224)", async () => {
      const em = scopedEm();
      const created = { "00000001": "2026-10-03T08:00:00Z", "00000002": "2026-10-01T08:00:00Z", "00000003": "2026-10-02T08:00:00Z", "00000004": "2026-10-01T08:00:00Z" };
      for (const [code, at] of Object.entries(created)) (await em.findOneOrFail(PurchaseOrder, { code })).createdAt = new Date(at);
      await em.flush();
      expect(ids(await service().list({ sort: "created" }))).toEqual(["00000002", "00000004", "00000003", "00000001"]);
      expect(ids(await service().list({ sort: "created", dir: "desc" }))).toEqual(["00000001", "00000003", "00000002", "00000004"]);
    });

    it("keeps orders whose ID, supplier or location holds every word, ignoring case, in this tenant only", async () => {
      expect(ids(await service().list({ q: "STEEL" }))).toEqual(["00000001", "00000004"]);
      expect(ids(await service().list({ q: "wholesale" }))).toEqual(["00000003"]);
      expect(ids(await service().list({ q: "warehouse" }))).toEqual(["00000001"]);
      expect(ids(await service().list({ q: "0003" }))).toEqual(["00000002", "00000003"]);
      expect(ids(await service().list({ q: "fasteners main" }))).toEqual(["00000003"]);
      expect(ids(await service().list({ q: "steel gone" }))).toEqual([]);
      expect(ids(await service().list({ q: "steel", sort: "location", dir: "desc" }))).toEqual(["00000001", "00000004"]);
      expect(await service().count({ q: "steel" })).toBe(2);
      expect(await service().count({ q: "_" })).toBe(4);
      expect(ids(await service("test").list({ q: "steel" }))).toEqual(["00000001"]);
    });

    it("pages a sort with equal values by ID, so no order shows twice or never (lesson 2026-10-21)", async () => {
      const em = scopedEm();
      for (let index = 105; index >= 5; index--) await store(em, String(index).padStart(8, "0"), "00000002", "00000001", "open");
      await em.flush();

      const first = await service().list({ sort: "supplier", dir: "desc", q: "fasteners" });
      const second = await service().list({ sort: "supplier", dir: "desc", q: "fasteners", page: 2 });
      expect(ids(first).slice(0, 3)).toEqual(["00000003", "00000005", "00000006"]);
      expect(ids(second)).toEqual(["00000104", "00000105"]);
      expect(await service().count({ q: "fasteners" })).toBe(first.length + second.length);
    });
  });

  it("refuses an invalid page as VALIDATION_FAILED", async () => {
    for (const page of [0, -1, 1.5, Number.NaN]) {
      await expect(service().list({ page })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("recognizes old-release receipts written after migration on reads, closure, usage and new postings", async () => {
    const order = await service().create(DIRECT, ACTOR);
    // During deployment overlap the old container knows received, but not the new status column.
    await scopedEm().nativeUpdate(PurchaseOrderLine, { order: { code: order.id }, position: 1 }, { received: "20.000000" });
    const current = await service().get(order.id);
    expect(current.lines[0]).toMatchObject({ status: "completed", outstanding: "0.000000" });
    expect((await service().list())[0].lines[0].status).toBe("completed");
    const materials = new MaterialService({ em: scopedEm() });
    const inactive = await materials.update("00000001", { active: false }, (await materials.get("00000001")).version, ADMIN);
    expect(inactive.active).toBe(false);
    await expect(service().cancel(order.id, current.version, ACTOR, [1])).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    const closed = await service().closeEarly(order.id, current.version, ACTOR);
    expect(closed.lines.map(({ status, abandoned }) => ({ status, abandoned }))).toEqual([
      { status: "completed", abandoned: "0.000000" }, { status: "closed-early", abandoned: "10.000000" },
    ]);
    await materials.update("00000001", { active: true }, inactive.version, ADMIN);
    const next = await service().create(DIRECT, ACTOR);
    await scopedEm().nativeUpdate(PurchaseOrderLine, { order: { code: next.id }, position: 1 }, { received: "21.000000" });
    await new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: next.id, lines: [{ line: 2, quantity: "10", unit: "each" }] }, ACTOR);
    expect(await service().get(next.id)).toMatchObject({ status: "completed", lines: [{ status: "completed", received: "21.000000" }, { status: "completed" }] });
    expect((await scopedEm().find(PurchaseOrderLine, { order: { code: next.id } })).map(({ status }) => status)).toEqual(["completed", "completed"]);
  });

  it("protects restored supply when an old release reverses a backfilled completed line", async () => {
    const order = await service().create({ ...DIRECT, lines: [DIRECT.lines[0]] }, ACTOR);
    await scopedEm().nativeUpdate(PurchaseOrderLine, { order: { code: order.id } }, { received: "20.000000", status: "completed" });
    // The preceding release reverses the counter and header, without knowing the added status column.
    await scopedEm().nativeUpdate(PurchaseOrderLine, { order: { code: order.id } }, { received: "0.000000" });
    await scopedEm().nativeUpdate(PurchaseOrder, { code: order.id }, { status: "open" });
    expect(await service().get(order.id)).toMatchObject({ status: "open", lines: [{ status: "open", outstanding: "20.000000" }] });
    const materials = new MaterialService({ em: scopedEm() });
    await expect(materials.update("00000001", { active: false }, (await materials.get("00000001")).version, ADMIN)).rejects.toMatchObject({ code: "MATERIAL_IN_OPEN_ORDER" });
  });

  it("cancels unreceived lines without restoring their requisition conversion", async () => {
    const source = await requisition();
    const order = await service().create(converting(source.id, "60"), ACTOR);
    const result = await service().cancel(order.id, order.version, ACTOR);
    expect(result).toMatchObject({ status: "cancelled", version: order.version + 1,
      lines: [{ status: "cancelled", received: "0.000000", abandoned: "60.000000", outstanding: "0.000000", requisition: source.id }] });
    expect(await requisitions().get(source.id)).toMatchObject({ status: "open", converted: "60.000000", outstanding: "40.000000" });
    expect(await entries("purchase-orders.purchase-order.cancelled")).toEqual([expect.objectContaining({ before: expect.objectContaining({ status: "open" }), after: expect.objectContaining({ status: "cancelled" }) })]);
    await expect(service().cancel(order.id, result.version, ACTOR)).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_OPEN" });
    await expect(service("test").cancel(order.id, result.version, ACTOR)).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });
  });

  it("keeps selected-line closure Open until the rest resolves and refuses receipts on abandoned lines", async () => {
    const order = await service().create(DIRECT, ACTOR);
    const receipts = () => new GoodsReceiptService({ em: scopedEm() });
    await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "5", unit: "kg" }] }, ACTOR);
    const partial = await service().get(order.id);
    await expect(service().cancel(order.id, partial.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_PROCESSED" });
    const closed = await service().closeEarly(order.id, partial.version, ACTOR, [1]);
    expect(closed.status).toBe("open");
    expect(closed.lines[0]).toMatchObject({ received: "5.000000", abandoned: "15.000000", outstanding: "0.000000", status: "closed-early" });
    await expect(receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "1", unit: "kg" }] }, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    await expect(service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }], closed.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    await receipts().post({ purchaseOrder: order.id, lines: [{ line: 2, quantity: "12", unit: "each" }] }, ACTOR);
    const result = await service().get(order.id);
    expect(result.status).toBe("closed-early"); expect(result.lines[1]).toMatchObject({ status: "completed", received: "12.000000" });
    expect(await entries("purchase-orders.purchase-order.closed-early")).toHaveLength(1);
  });

  it("keeps what was received in stock when a partly received order is Closed Early (BUY-017)", async () => {
    const order = await service().create({ ...DIRECT, lines: [line("00000001", "100", "kg", "2027-03-03")] }, ACTOR);
    await new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "60", unit: "kg" }] }, ACTOR);
    const stock = () => new StockService({ em: scopedEm() }).get({ material: "00000001", location: "00000001" });
    expect(await stock()).toMatchObject({ quantity: "60.000000" });
    const movements = await scopedEm().count(StockMovement, {});
    const closed = await service().closeEarly(order.id, (await service().get(order.id)).version, ACTOR);
    expect(closed).toMatchObject({ status: "closed-early", lines: [expect.objectContaining({ received: "60.000000", abandoned: "40.000000", outstanding: "0.000000" })] });
    expect(await scopedEm().count(StockMovement, {})).toBe(movements);
    expect(await stock()).toMatchObject({ quantity: "60.000000" });
  });

  it("supports whole-document early closure and numeric selection while preserving prior terminal lines", async () => {
    const order = await service().create(DIRECT, ACTOR);
    await expect(service().closeEarly(order.id, order.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_UNPROCESSED" });
    const cached = service(); await cached.get(order.id);
    const partial = await service().cancel(order.id, order.version, ACTOR, [2]);
    expect(partial.status).toBe("open");
    await expect(cached.cancel(order.id, order.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service().cancel(order.id, partial.version, ACTOR, [1, 99])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: order.id, lines: [{ line: 2, quantity: "1", unit: "each" }] }, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    await expect(service().setPlannedDates(order.id, [{ line: 2, plannedDate: "2027-04-01" }], partial.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    await new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "1", unit: "kg" }] }, ACTOR);
    const current = await service().get(order.id);
    const result = await service().closeEarly(order.id, current.version, ACTOR);
    expect(result.status).toBe("closed-early");
    expect(result.lines.map(({ status, outstanding }) => ({ status, outstanding }))).toEqual([
      { status: "closed-early", outstanding: "0.000000" }, { status: "cancelled", outstanding: "0.000000" }]);
    const scope = scopedEm(); vi.spyOn(scope, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
    await expect(service("prod", scope).cancel(order.id, result.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  describe("create without a requisition", () => {
    it("saves an Open order with the next ID, one location and per-line dates, no requisition reference (BUY-002, BUY-005, BUY-006, BUY-008, LFC-001)", async () => {
      const order = await service().create(DIRECT, ACTOR);

      expect(order).toEqual({
        id: "00000001",
        supplier: "00000001",
        location: "00000001",
        status: "open",
        lines: [
          {
            line: 1,
            material: "00000001",
            quantity: "20.000000",
            enteredQuantity: "20",
            enteredUnit: "kg",
            numerator: "1",
            denominator: "1",
            plannedDate: "2027-03-03",
            requisition: null,
            received: "0.000000",
            abandoned: "0.000000",
            outstanding: "20.000000",
            status: "open",
            posted: false,
          },
          {
            line: 2,
            material: "00000002",
            quantity: "10.000000",
            enteredQuantity: "10",
            enteredUnit: "each",
            numerator: "1",
            denominator: "1",
            plannedDate: "2027-03-05",
            requisition: null,
            received: "0.000000",
            abandoned: "0.000000",
            outstanding: "10.000000",
            status: "open",
            posted: false,
          },
        ],
        createdAt: expect.any(Date),
        version: 1,
      });
      expect((await service().create(DIRECT, ACTOR)).id).toBe("00000002");
    });

    it("converts a line entered in another unit and keeps the entered quantity, unit and factor (MAT-019)", async () => {
      const order = await service().create({ ...DIRECT, lines: [line("00000001", "0.5", "t", "2027-03-03")] }, ACTOR);

      expect(order.lines[0]).toMatchObject({ quantity: "500.000000", enteredQuantity: "0.5", enteredUnit: "t", numerator: "1000" });
    });

    it("takes two lines for the same material on different dates, and an explicit null requisition (BUY-008)", async () => {
      const order = await service().create(
        { ...DIRECT, lines: [line("00000002", "5", "each", "2027-03-03", { requisition: null }), line("00000002", "5", "each", "2027-03-10")] },
        ACTOR,
      );

      expect(order.lines.map(({ line, plannedDate }) => [line, plannedDate])).toEqual([
        [1, "2027-03-03"],
        [2, "2027-03-10"],
      ]);
    });

    it("numbers each tenant on its own (R05)", async () => {
      await seedMasters(orm, "test");

      expect((await service("test").create(DIRECT, ACTOR)).id).toBe("00000001");
      expect(await service().list()).toEqual([]);
    });

    it("records the create in the tenant's audit with the allowlisted fields and the lines as text (R08)", async () => {
      await service().create(DIRECT, ACTOR);

      expect(await entries("purchase-orders.purchase-order.created")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel Service",
          before: null,
          after: {
            id: "00000001",
            supplier: "00000001",
            location: "00000001",
            status: "open",
            lines: "1: 00000001 20.000000 kg on 2027-03-03; 2: 00000002 10.000000 each on 2027-03-05",
          },
        },
      ]);
    });
  });

  describe("one location (BUY-007)", () => {
    it("refuses a line stated for another location than the order's, naming the line, and saves nothing", async () => {
      const lines = [line("00000001", "20", "kg", "2027-03-03"), line("00000002", "10", "each", "2027-03-05", { location: "00000002" })];

      await expect(service().create({ ...DIRECT, lines }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.1.location": [LINE_LOCATION_MESSAGE] },
      });
      expect(await service().list()).toEqual([]);
    });

    it("accepts lines that state the order's own location (BUY-006)", async () => {
      const order = await service().create(
        { ...DIRECT, lines: DIRECT.lines.map((each) => ({ ...each, location: "00000001" })) },
        ACTOR,
      );

      expect(order.lines).toHaveLength(2);
    });
  });

  describe("converting a requisition (BUY-003, BUY-004)", () => {
    it("links the line, adds its base quantity to the requisition's converted amount, and keeps it Open until fully converted", async () => {
      const source = await requisition();

      const order = await service().create(converting(source.id, "60"), ACTOR);

      expect(order.lines[0]).toMatchObject({ quantity: "60.000000", requisition: source.id });
      expect(await requisitions().get(source.id)).toMatchObject({ converted: "60.000000", outstanding: "40.000000", status: "open", version: 2 });
    });

    it("completes the requisition when a second order to another supplier takes the rest (BUY-004)", async () => {
      const source = await requisition();
      await service().create(converting(source.id, "60", "00000001"), ACTOR);
      await service().create(converting(source.id, "40", "00000002"), ACTOR);

      expect(await requisitions().get(source.id)).toMatchObject({ converted: "100.000000", outstanding: "0.000000", status: "completed" });
      expect((await service().list()).map(({ id, supplier }) => [id, supplier])).toEqual([
        ["00000001", "00000001"],
        ["00000002", "00000002"],
      ]);
    });

    it("converts a line entered in another unit by its base quantity", async () => {
      const source = await requisition();

      await service().create({ ...converting(source.id, "0.06"), lines: [line("00000001", "0.06", "t", "2027-03-04", { requisition: source.id })] }, ACTOR);

      expect(await requisitions().get(source.id)).toMatchObject({ converted: "60.000000" });
    });

    it("counts what the order's own earlier lines take, and converts the requisition once with the total", async () => {
      const source = await requisition();
      const lines = [
        line("00000001", "30", "kg", "2027-03-04", { requisition: source.id }),
        line("00000001", "30", "kg", "2027-03-06", { requisition: source.id }),
      ];

      await service().create({ ...DIRECT, lines }, ACTOR);

      expect(await requisitions().get(source.id)).toMatchObject({ converted: "60.000000", version: 2 });
      expect(await entries("purchase-requisitions.purchase-requisition.converted")).toHaveLength(1);
    });

    it("refuses more than is outstanding, counting earlier lines of the same order, and changes nothing", async () => {
      const source = await requisition();
      await service().create(converting(source.id, "60"), ACTOR);

      await expect(service().create(converting(source.id, "40.000001"), ACTOR)).rejects.toMatchObject({
        code: "REQUISITION_OVER_CONVERTED",
        status: 409,
        message: `Purchase requisition ${source.id} has only 40.000000 left to convert.`,
      });
      const lines = [
        line("00000001", "30", "kg", "2027-03-04", { requisition: source.id }),
        line("00000001", "11", "kg", "2027-03-06", { requisition: source.id }),
      ];
      await expect(service().create({ ...DIRECT, lines }, ACTOR)).rejects.toMatchObject({
        code: "REQUISITION_OVER_CONVERTED",
        message: `Purchase requisition ${source.id} has only 10.000000 left to convert.`,
      });
      expect(await requisitions().get(source.id)).toMatchObject({ converted: "60.000000" });
      expect(await service().list()).toHaveLength(1);
    });

    it("refuses a requisition that is already completed", async () => {
      const source = await requisition();
      await service().create(converting(source.id, "100"), ACTOR);

      await expect(service().create(converting(source.id, "1"), ACTOR)).rejects.toMatchObject({ code: "REQUISITION_NOT_OPEN", status: 409 });
    });

    it("doesn't find an unknown requisition, or another tenant's (TEN-014)", async () => {
      await expect(service().create(converting("00000009", "1"), ACTOR)).rejects.toMatchObject({ code: "REQUISITION_NOT_FOUND", status: 404 });

      await seedMasters(orm, "test");
      const other = await new PurchaseRequisitionService({ em: scopedEm("test") }).create(
        { material: "00000001", location: "00000001", quantity: "10", unit: "kg", requiredDate: "2027-03-01" },
        ACTOR,
      );
      await expect(service().create(converting(other.id, "1"), ACTOR)).rejects.toMatchObject({ code: "REQUISITION_NOT_FOUND" });
    });

    it("puts a requisition of another material or location on the line's requisition field", async () => {
      const bolts = await requisition({ material: "00000002", unit: "each" });
      const elsewhere = await requisition({ location: "00000002" });

      await expect(service().create(converting(bolts.id, "1"), ACTOR)).rejects.toMatchObject({
        fieldErrors: { "lines.0.requisition": [LINE_REQUISITION_MATERIAL_MESSAGE] },
      });
      await expect(service().create(converting(elsewhere.id, "1"), ACTOR)).rejects.toMatchObject({
        fieldErrors: { "lines.0.requisition": [LINE_REQUISITION_LOCATION_MESSAGE] },
      });
    });

    it("reports a refused conversion on a converting line without also counting it against the requisition", async () => {
      const source = await requisition();

      await expect(
        service().create({ ...DIRECT, lines: [line("00000001", "5", "case", "2027-03-04", { requisition: source.id })] }, ACTOR),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { "lines.0.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] } });
      expect(await requisitions().get(source.id)).toMatchObject({ converted: "0.000000" });
    });

    it("records the conversion with its before and after, and the order's own entry (R08)", async () => {
      const source = await requisition();
      await service().create(converting(source.id, "100"), ACTOR);

      const [converted] = await entries("purchase-requisitions.purchase-requisition.converted");
      expect(converted).toMatchObject({
        subjectId: source.id,
        before: { converted: "0.000000", status: "open" },
        after: { converted: "100.000000", status: "completed" },
      });
      expect((await entries("purchase-orders.purchase-order.created"))[0].after).toMatchObject({
        lines: "1: 00000001 100.000000 kg on 2027-03-04 from requisition 00000001",
      });
    });

    it("maps a requisition changed under the conversion to a stale version", async () => {
      const source = await requisition();
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));

      await expect(service("prod", em).create(converting(source.id, "1"), ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });
  });

  describe("the masters it names", () => {
    it("refuses an inactive supplier, and another tenant's, for a new order, saving nothing (BUY-025, LFC-023, TEN-014)", async () => {
      await expect(service().create({ ...DIRECT, supplier: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "SUPPLIER_INACTIVE", status: 409 });
      await expect(service().create({ ...DIRECT, supplier: "00000009" }, ACTOR)).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND", status: 404 });
      await expect(service("test").create(DIRECT, ACTOR)).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
      expect(await service().list()).toEqual([]);
    });

    it("refuses an inactive location or material for a new order (LFC-019, MAT-029)", async () => {
      await expect(service().create({ ...DIRECT, location: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
      await expect(service().create({ ...DIRECT, lines: [line("00000003", "1", "each", "2027-03-03")] }, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_INACTIVE",
      });
    });

    it("keeps an earlier order readable and editable when its supplier is deactivated, which the admin may do with an open order (LFC-021, AUD-027)", async () => {
      const order = await service().create(DIRECT, ACTOR);
      const supplier = await new SupplierService({ em: scopedEm() }).get("00000001");

      await new SupplierService({ em: scopedEm() }).update("00000001", { active: false }, supplier.version, ADMIN);

      expect(await service().get(order.id)).toMatchObject({ id: order.id, supplier: "00000001", status: "open" });
      const changed = await service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-03-09" }], order.version, ACTOR);
      expect(changed.lines[0].plannedDate).toBe("2027-03-09");
      await expect(service().create(DIRECT, ACTOR)).rejects.toMatchObject({ code: "SUPPLIER_INACTIVE" });
    });

    it("keeps an order readable, and its other lines receivable, after the material of its cancelled line is deactivated (MAT-029)", async () => {
      const order = await service().create(DIRECT, ACTOR);
      await service().cancel(order.id, order.version, ACTOR, [1]);
      const materials = new MaterialService({ em: scopedEm() });
      await materials.update("00000001", { active: false }, (await materials.get("00000001")).version, ADMIN);

      const read = await service().get(order.id);
      expect(read).toMatchObject({ status: "open", lines: [{ material: "00000001", quantity: "20.000000", status: "cancelled" }, { material: "00000002", status: "open" }] });
      expect((await service().list()).find(({ id }) => id === order.id)?.lines[0].material).toBe("00000001");
      await expect(service().create(DIRECT, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });

      await new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: order.id, lines: [{ line: 2, quantity: "10", unit: "each" }] }, ACTOR);
      expect(await service().get(order.id)).toMatchObject({ status: "closed-early", lines: [{ material: "00000001" }, { status: "completed" }] });
    });

    it("puts a refused conversion on the line's own field, every line at once", async () => {
      const lines = [line("00000001", "1", "case", "2027-03-03"), line("00000002", "1", "each", "2027-03-03"), line("00000001", "999999999999", "t", "2027-03-03")];

      await expect(service().create({ ...DIRECT, lines }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: {
          "lines.0.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE],
          "lines.2.quantity": [expect.any(String)],
        },
      });
    });

    it("refuses a line entered in the statistical unit, though the material has an SU factor, writing nothing (#239)", async () => {
      const em = scopedEm();
      em.create(MaterialConversion, { material: await em.findOneOrFail(Material, { code: "00000002" }), unit: "SU", numerator: "1", denominator: "1.5" });
      await em.flush();

      await expect(
        service().create({ ...DIRECT, lines: [line("00000001", "20", "kg", "2027-03-03"), line("00000002", "3", "SU", "2027-03-05")] }, ACTOR),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 400, fieldErrors: { "lines.1.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] } });
      expect(await scopedEm().count(PurchaseOrder, {})).toBe(0);
      expect(await scopedEm().count(PurchaseOrderLine, {})).toBe(0);
      expect(await entries("purchase-orders.purchase-order.created")).toEqual([]);
    });
  });

  describe("material deactivation with an open order (LFC-013)", () => {
    const deactivate = (material: string) => {
      const materials = new MaterialService({ em: scopedEm() });
      return materials.get(material).then(({ version }) => materials.update(material, { active: false }, version, ADMIN));
    };

    it("refuses to deactivate a material with an open order line, naming the lowest open order", async () => {
      await service().create({ ...DIRECT, lines: [line("00000002", "1", "each", "2027-03-03")] }, ACTOR);
      const second = await service().create(DIRECT, ACTOR);

      await expect(deactivate("00000001")).rejects.toMatchObject({
        code: "MATERIAL_IN_OPEN_ORDER",
        status: 409,
        message: `Purchase order ${second.id} has an open line for this material, so it can't be deactivated.`,
        messageParams: { order: second.id },
      });
      await expect(deactivate("00000002")).rejects.toMatchObject({
        message: "Purchase order 00000001 has an open line for this material, so it can't be deactivated.",
        messageParams: { order: "00000001" },
      });
    });

    it("ignores a cancelled line for deactivation but preserves its historical base-unit lock", async () => {
      const order = await service().create(DIRECT, ACTOR);
      expect((await service().cancel(order.id, order.version, ACTOR, [1])).status).toBe("open");
      const cleanup = scopedEm(); await cleanup.nativeDelete(MaterialConversion, { material: { code: "00000001" } });
      const material = await deactivate("00000001");
      expect(material.active).toBe(false);
      await expect(new MaterialService({ em: scopedEm() }).update("00000001", { baseUnit: "g" }, material.version, ADMIN))
        .rejects.toMatchObject({ code: "BASE_UNIT_IN_USE" });
    });

    it("lets a material no open order uses be deactivated, an open requisition notwithstanding", async () => {
      await requisition({ material: "00000002", unit: "each" });

      await expect(deactivate("00000002")).resolves.toMatchObject({ active: false });
    });

    it("lets a material go once its orders are no longer open", async () => {
      const order = await service().create(DIRECT, ACTOR);
      await scopedEm().nativeUpdate(PurchaseOrder, { code: order.id }, { status: "closed" });

      await expect(deactivate("00000001")).resolves.toMatchObject({ active: false });
    });

    it("locks the base unit once a requisition or an order line holds a quantity in it", async () => {
      await requisition({ material: "00000002", unit: "each" });
      const washer = scopedEm();
      washer.create(Material, { code: "00000004", type: "raw", description: "Washer", baseUnit: "each" });
      await washer.flush();
      await service().create({ ...DIRECT, lines: [line("00000004", "1", "each", "2027-03-03")] }, ACTOR);

      for (const material of ["00000002", "00000004"]) {
        const materials = new MaterialService({ em: scopedEm() });
        const { version } = await materials.get(material);
        await expect(materials.update(material, { baseUnit: "pcs" }, version, ADMIN)).rejects.toMatchObject({ code: "BASE_UNIT_IN_USE", status: 409 });
      }
    });
  });

  describe("location deactivation with open purchasing (LFC-018, #141)", () => {
    const locations = () => new LocationService({ em: scopedEm() });
    const deactivate = async (location: string) => locations().update(location, { active: false }, (await locations().get(location)).version, ADMIN);

    it("refuses a location an Open order delivers to, naming the lowest such order, and changes nothing", async () => {
      await service().create({ ...DIRECT, location: "00000002" }, ACTOR);
      const second = await service().create(DIRECT, ACTOR);
      await service().create(DIRECT, ACTOR);
      const before = await locations().get("00000001");

      await expect(deactivate("00000001")).rejects.toMatchObject({
        code: "LOCATION_HAS_PURCHASE_ORDERS",
        status: 409,
        message: `Purchase order ${second.id} is still Open for delivery to this location.`,
        messageParams: { order: second.id },
      });
      expect(await locations().get("00000001")).toEqual(before);
    });

    it("refuses a location with an Open requisition, naming the lowest one", async () => {
      await requisition();
      const elsewhere = await requisition({ location: "00000002" });
      await requisition({ location: "00000002" });

      await expect(deactivate("00000002")).rejects.toMatchObject({
        code: "LOCATION_HAS_REQUISITIONS",
        status: 409,
        message: `Purchase requisition ${elsewhere.id} is still Open at this location.`,
        messageParams: { requisition: elsewhere.id },
      });
      expect((await locations().get("00000002")).active).toBe(true);
    });

    it("lets the location go once its orders are Completed, Cancelled or Closed Early and its requisitions are no longer Open", async () => {
      // A requisition converted in full is Completed; cancelling its order leaves it so.
      const converted = await requisition();
      const cancelled = await service().create(converting(converted.id, "100"), ACTOR);
      await service().cancel(cancelled.id, cancelled.version, ACTOR);
      const dropped = await requisition();
      await requisitions().cancel(dropped.id, dropped.version, ACTOR);
      // Received in full, then its stock counted away so only the documents are in question.
      const received = await service().create(DIRECT, ACTOR);
      await new GoodsReceiptService({ em: scopedEm() }).post({ purchaseOrder: received.id, lines: [{ line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "10", unit: "each" }] }, ACTOR);
      for (const [material, quantity, unit] of [["00000001", "-20", "kg"], ["00000002", "-10", "each"]]) {
        await new StockService({ em: scopedEm() }).correct({ material, location: "00000001", quantity, unit, reason: "Count" }, ACTOR);
      }
      const closed = await service().create(DIRECT, ACTOR);
      await scopedEm().nativeUpdate(PurchaseOrder, { code: closed.id }, { status: "closed-early" });
      expect((await service().get(received.id)).status).toBe("completed");
      expect((await requisitions().get(converted.id)).status).toBe("completed");

      await expect(deactivate("00000001")).resolves.toMatchObject({ active: false });
    });
  });

  describe("list and get", () => {
    it("lists the tenant's orders with their lines by ID, and gets one", async () => {
      await service().create(DIRECT, ACTOR);
      await service().create({ ...DIRECT, supplier: "00000002", lines: [line("00000002", "1", "each", "2027-03-03")] }, ACTOR);
      await seedMasters(orm, "test");
      await service("test").create(DIRECT, ACTOR);

      expect((await service().list()).map(({ id, lines }) => [id, lines.length])).toEqual([
        ["00000001", 2],
        ["00000002", 1],
      ]);
      expect(await service().get("00000002")).toMatchObject({ supplier: "00000002" });
    });

    it("doesn't find an unknown ID, or another tenant's order (TEN-014)", async () => {
      await service().create(DIRECT, ACTOR);

      await expect(service().get("00000009")).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND", status: 404 });
      await expect(service("test").get("00000001")).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });
    });

    // Lesson 2026-10-23: EXPLAIN the query MikroORM really sends.
    it("reads a page's lines with each requisition by its primary key, never every requisition of the tenant (#236)", async () => {
      const { id: converted } = await requisition();
      await requisition();
      await service().create(converting(converted, "40"), ACTOR);
      await service().create(DIRECT, ACTOR);
      const queries: { sql: string; params: readonly unknown[] }[] = [];
      const observed = await initOrm({ databasePath: orm.config.get("dbName")! }, { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
      try {
        const em = observed.em.fork();
        selectTenant(em, "prod");

        const page = await new PurchaseOrderService({ em }).list();

        expect(page.map(({ id, lines }) => [id, lines.map(({ requisition }) => requisition)])).toEqual([
          ["00000001", [converted]],
          ["00000002", [null, null]],
        ]);
        const linesQuery = queries.find(({ sql }) => sql.includes(" from `purchase_order_line` as "));
        expect(linesQuery).toBeDefined();
        const plan = (await observed.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${linesQuery!.sql}`, [...linesQuery!.params])).map(
          ({ detail }) => detail,
        );
        expect(plan).toContainEqual(expect.stringMatching(/^SEARCH \w+ USING INDEX sqlite_autoindex_purchase_requisition_1 \(id=\?\) LEFT-JOIN$/));
        expect(plan.filter((detail) => /^(MATERIALIZE|SCAN) /.test(detail))).toEqual([]);
      } finally {
        await observed.close();
      }
    });
  });

  describe("setPlannedDates (BUY-024)", () => {
    it("changes the dates of the named lines at the loaded version, audits only what changed, and advances the version", async () => {
      const order = await service().create(DIRECT, ACTOR);

      const changed = await service().setPlannedDates(
        order.id,
        [
          { line: 2, plannedDate: "2027-03-12" },
          { line: 1, plannedDate: "2027-03-03" },
        ],
        order.version,
        ACTOR,
      );

      expect(changed.lines.map(({ plannedDate }) => plannedDate)).toEqual(["2027-03-03", "2027-03-12"]);
      expect(changed.version).toBe(2);
      expect(await entries("purchase-orders.purchase-order.updated")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel Service",
          before: { line2PlannedDate: "2027-03-05" },
          after: { line2PlannedDate: "2027-03-12" },
        },
      ]);
    });

    it("advances the version even when the clock reads the order's last update to the millisecond", async () => {
      // The order's version moves only when its row changes, and a line date change marks it through
      // updatedAt: a clock that hasn't moved since the last write would leave the version behind.
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-21T12:00:00.000Z") });
      try {
        const order = await service().create(DIRECT, ACTOR);

        const changed = await service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }], order.version, ACTOR);

        expect(changed.version).toBe(order.version + 1);
        await expect(service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-05-01" }], order.version, ACTOR)).rejects.toMatchObject({
          code: "VERSION_CONFLICT",
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("writes and records nothing when no date differs", async () => {
      const order = await service().create(DIRECT, ACTOR);

      const same = await service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-03-03" }], order.version, ACTOR);

      expect(same.version).toBe(1);
      expect(await entries("purchase-orders.purchase-order.updated")).toEqual([]);
    });

    it("names a line the order doesn't have, changing nothing", async () => {
      const order = await service().create(DIRECT, ACTOR);

      await expect(
        service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }, { line: 3, plannedDate: "2027-04-01" }], order.version, ACTOR),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { "lines.1.line": [LINE_NO_SUCH_LINE_MESSAGE] } });
      expect((await service().get(order.id)).lines[0].plannedDate).toBe("2027-03-03");
    });

    it("refuses a stale version and keeps the newer change (AUD-025, API-029)", async () => {
      const order = await service().create(DIRECT, ACTOR);
      await service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }], 1, ACTOR);

      await expect(service().setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-05-01" }], 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        status: 409,
      });
      expect((await service().get(order.id)).lines[0].plannedDate).toBe("2027-04-01");
    });

    it("maps a change landing between the version check and the flush to VERSION_CONFLICT, and passes other errors through", async () => {
      const order = await service().create(DIRECT, ACTOR);
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(service("prod", em).setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }], 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });

      const other = scopedEm();
      vi.spyOn(other, "transactional").mockRejectedValueOnce(new Error("boom"));
      await expect(service("prod", other).setPlannedDates(order.id, [{ line: 1, plannedDate: "2027-04-01" }], 1, ACTOR)).rejects.toThrow("boom");
    });

    it("can't reach another tenant's order (TEN-014)", async () => {
      await service().create(DIRECT, ACTOR);

      await expect(service("test").setPlannedDates("00000001", [{ line: 1, plannedDate: "2027-04-01" }], 1, ACTOR)).rejects.toMatchObject({
        code: "PURCHASE_ORDER_NOT_FOUND",
      });
    });
  });

  describe("create under racing writes", () => {
    it("maps a clash on the unique ID to a conflict, and passes other errors through", async () => {
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(service("prod", em).create(DIRECT, ACTOR)).rejects.toMatchObject({ code: "ORDER_ID_RACE", message: ORDER_ID_RACE, status: 409 });

      const other = scopedEm();
      vi.spyOn(other, "transactional").mockRejectedValueOnce(new Error("boom"));
      await expect(service("prod", other).create(DIRECT, ACTOR)).rejects.toThrow("boom");
    });

    it("stops at the last eight-digit ID", async () => {
      const em = scopedEm();
      em.create(PurchaseOrder, {
        code: "99999999",
        supplier: await em.findOneOrFail(Supplier, { code: "00000001" }),
        location: await em.findOneOrFail(Location, { code: "00000001" }),
      });
      await em.flush();

      await expect(service().create(DIRECT, ACTOR)).rejects.toMatchObject({ code: "ORDER_IDS_EXHAUSTED", status: 409 });
    });
  });

  describe("seedDemo", () => {
    const at = new Date("2025-06-15T23:30:00Z");

    it("creates an order stamped at the seed's moment, converting a requisition fully, without any audit", async () => {
      const source = await requisition();
      const auditBefore = await scopedEm().count(TenantAuditEvent, {});
      expect(await service().seedDemo(converting(source.id, "100"), at)).toEqual({ id: "00000001" });
      expect(await service().get("00000001")).toMatchObject({ status: "open", createdAt: at, lines: [{ requisition: source.id, quantity: "100.000000" }] });
      expect(await scopedEm().findOneOrFail(PurchaseOrder, { code: "00000001" })).toMatchObject({ createdAt: at, updatedAt: at });
      expect(await requisitions().get(source.id)).toMatchObject({ converted: "100.000000", status: "completed" });
      expect(await scopedEm().count(TenantAuditEvent, {})).toBe(auditBefore);
    });

    it("applies the same rules as create: an over-converting line is refused and nothing is written", async () => {
      const source = await requisition();
      await expect(service().seedDemo(converting(source.id, "101"), at)).rejects.toMatchObject({ code: "REQUISITION_OVER_CONVERTED" });
      expect(await scopedEm().count(PurchaseOrder, {})).toBe(0);
      expect(await scopedEm().findOneOrFail(PurchaseRequisition, { code: source.id })).toMatchObject({ converted: "0.000000", status: "open" });
    });
  });
});
