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
  selectTenant,
  StockBalance,
  StockMovement,
  Supplier,
  TenantAuditEvent,
  UniqueConstraintViolationException,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { formatDecimal, MAX_QUANTITY } from "../../domain/quantities/decimal";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { QUANTITY_OUT_OF_RANGE_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { RECEIPT_LINE_ORDER_MESSAGE, type ReceiptCreateInput } from "../../validators/goods-receipts/goods-receipt.schema";
import { LINE_NO_SUCH_LINE_MESSAGE } from "../../validators/purchasing/purchasing-fields.schema";
import type { AuditActor } from "../audit/actor";
import { MaterialService } from "../materials/material.service";
import { PurchaseOrderService, type NewOrder } from "../purchase-orders/purchase-order.service";
import { PurchaseRequisitionService } from "../purchase-requisitions/purchase-requisition.service";
import { StockService } from "../stock/stock.service";
import { SupplierService } from "../suppliers/supplier.service";
import { GOODS_RECEIPT_MOVEMENT, GoodsReceiptService, RECEIPT_ID_RACE } from "./goods-receipt.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const ADMIN: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

/** An order to supplier 1 at location 1: 100 kg of steel planned a week ago, and 10 bolts. */
const ORDER: NewOrder = {
  supplier: "00000001",
  location: "00000001",
  lines: [
    { material: "00000001", quantity: "100", unit: "kg", plannedDate: "2026-10-13" },
    { material: "00000002", quantity: "10", unit: "each", plannedDate: "2026-10-14" },
  ],
};

const receiptOf = (purchaseOrder: string, ...lines: ReceiptCreateInput["lines"]): ReceiptCreateInput => ({ purchaseOrder, lines });
const today = () => new Date().toISOString().slice(0, 10);

describe("GoodsReceiptService", () => {
  let orm: Orm;
  let directory: string;
  const scoped = (tenant: TenantCode = "prod", from: Orm = orm) => {
    const em = from.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod") => new GoodsReceiptService({ em: scoped(tenant) });
  const orders = (tenant: TenantCode = "prod") => new PurchaseOrderService({ em: scoped(tenant) });
  const stock = (material: string, location = "00000001") => new StockService({ em: scoped() }).get({ material, location });
  const entries = async (action: string) =>
    (await scoped().find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(({ subjectId, subjectLabel, before, after }) => ({
      subjectId,
      subjectLabel,
      before,
      after,
    }));

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "cpg-receipt-service-"));
    const config = loadConfig({ DATA_DIR: directory });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const steel = em.create(Material, { code: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg" });
      em.create(MaterialConversion, { material: steel, unit: "t", numerator: "1000", denominator: "1" });
      em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      em.create(Location, { code: "00000002", name: "Warehouse" });
      em.create(Supplier, { code: "00000001", name: "Steel Service" });
      await em.flush();
    }
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("post", () => {
    it("raises stock at the order's location and the line's received, and keeps the order Open, across repeated receipts (BUY-010, BUY-011, INV-002)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      await new StockService({ em: scoped() }).correct({ material: "00000001", location: "00000002", quantity: "7", unit: "kg", reason: "Count" }, ACTOR);

      const first = await service().post(receiptOf(order.id, { line: 1, quantity: "30", unit: "kg" }), ACTOR);
      expect(first).toEqual({
        id: "00000001",
        purchaseOrder: order.id,
        location: "00000001",
        businessDate: today(),
        createdAt: expect.any(Date),
        lines: [{ movementId: expect.any(String), reversedBy: null, line: 1, material: "00000001", quantity: "30.000000", enteredQuantity: "30", enteredUnit: "kg", numerator: "1", denominator: "1" }],
        warnings: [],
      });
      expect((await orders().get(order.id)).lines[0]).toMatchObject({ received: "30.000000", outstanding: "70.000000", status: "open" });
      expect((await stock("00000001")).quantity).toBe("30.000000");

      const second = await service().post(receiptOf(order.id, { line: 1, quantity: "50", unit: "kg" }), ACTOR);
      expect(second.id).toBe("00000002");
      const after = await orders().get(order.id);
      expect(after).toMatchObject({ status: "open", lines: [{ received: "80.000000", outstanding: "20.000000", status: "open" }, { received: "0.000000", outstanding: "10.000000", status: "open" }] });
      expect((await stock("00000001")).quantity).toBe("80.000000");
      // Only the target pair moves (INV-002): the warehouse keeps its 7 kg, the bolts have none.
      expect((await stock("00000001", "00000002")).quantity).toBe("7.000000");
      expect((await stock("00000002")).quantity).toBe("0.000000");
      // Each receipt posted its own movement once, under its own posting ID.
      const movements = await scoped().find(StockMovement, { type: GOODS_RECEIPT_MOVEMENT }, { orderBy: { occurredAt: "asc", id: "asc" } });
      expect(movements.map(({ quantity, balanceBefore, balanceAfter, reason }) => ({ quantity, balanceBefore, balanceAfter, reason }))).toEqual([
        { quantity: "30.000000", balanceBefore: "0.000000", balanceAfter: "30.000000", reason: "Goods receipt 00000001 for purchase order 00000001" },
        { quantity: "50.000000", balanceBefore: "30.000000", balanceAfter: "80.000000", reason: "Goods receipt 00000002 for purchase order 00000001" },
      ]);
      const receipts = await scoped().find(GoodsReceipt, {}, { orderBy: { code: "asc" } });
      expect(movements.map(({ postingId }) => postingId)).toEqual(receipts.map(({ id }) => id));
    });

    it("posts several lines of one order in one receipt and one posting (BUY-012)", async () => {
      const order = await orders().create(
        { ...ORDER, lines: [{ ...ORDER.lines[0], quantity: "50" }, ORDER.lines[1]] },
        ACTOR,
      );

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "5", unit: "each" }), ACTOR);

      expect(receipt.lines.map(({ line, quantity }) => [line, quantity])).toEqual([[1, "20.000000"], [2, "5.000000"]]);
      expect((await orders().get(order.id)).lines.map(({ received, outstanding }) => [received, outstanding])).toEqual([
        ["20.000000", "30.000000"],
        ["5.000000", "5.000000"],
      ]);
      expect((await stock("00000001")).quantity).toBe("20.000000");
      expect((await stock("00000002")).quantity).toBe("5.000000");
      const movements = await scoped().find(StockMovement, {}, { orderBy: { position: "asc" } });
      expect(new Set(movements.map(({ postingId }) => postingId)).size).toBe(1);
      expect(movements.map(({ position }) => position)).toEqual([0, 1]);
    });

    it("converts an entered unit to the base unit and keeps what was entered (R03, MAT-019)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "0.025", unit: "t" }), ACTOR);

      expect(receipt.lines[0]).toMatchObject({ quantity: "25.000000", enteredQuantity: "0.025", enteredUnit: "t", numerator: "1000", denominator: "1" });
      expect(await scoped().findOneOrFail(StockMovement, {})).toMatchObject({ quantity: "25.000000", enteredQuantity: "0.025000", enteredUnit: "t" });
    });

    it("writes nothing when one line fails validation while another could pass (AUD-018)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      await expect(
        service().post(
          receiptOf(order.id, { line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "5", unit: "box" }, { line: 3, quantity: "1", unit: "kg" }),
          ACTOR,
        ),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.1.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE], "lines.2.line": [LINE_NO_SUCH_LINE_MESSAGE] },
      });

      expect(await scoped().count(GoodsReceipt, {})).toBe(0);
      expect(await scoped().count(GoodsReceiptLine, {})).toBe(0);
      expect(await scoped().count(StockMovement, {})).toBe(0);
      expect((await orders().get(order.id)).lines.map(({ received }) => received)).toEqual(["0.000000", "0.000000"]);
      expect(await entries("goods-receipts.goods-receipt.posted")).toEqual([]);
      expect(await entries("stock.movement.posted")).toEqual([]);
    });

    it("writes nothing when the posting itself refuses, such as at a location deactivated since", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const em = scoped();
      (await em.findOneOrFail(Location, { code: "00000001" })).active = false;
      await em.flush();

      await expect(service().post(receiptOf(order.id, { line: 1, quantity: "20", unit: "kg" }), ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });

      expect(await scoped().count(GoodsReceipt, {})).toBe(0);
      expect(await scoped().count(StockMovement, {})).toBe(0);
      expect((await orders().get(order.id)).lines[0].received).toBe("0.000000");
    });

    it("receives on an Open order whose supplier was deactivated since, raising stock (LFC-021)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const suppliers = new SupplierService({ em: scoped() });
      await suppliers.update("00000001", { active: false }, (await suppliers.get("00000001")).version, ADMIN);

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "30", unit: "kg" }), ACTOR);

      expect(receipt.lines[0].quantity).toBe("30.000000");
      expect((await stock("00000001")).quantity).toBe("30.000000");
      expect((await orders().get(order.id)).lines[0]).toMatchObject({ received: "30.000000", status: "open" });
    });

    it("refuses a line from another order (BUY-013)", async () => {
      const first = await orders().create(ORDER, ACTOR);
      const second = await orders().create(ORDER, ACTOR);

      await expect(
        service().post(receiptOf(first.id, { line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "5", unit: "each", purchaseOrder: second.id }), ACTOR),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { "lines.1.purchaseOrder": [RECEIPT_LINE_ORDER_MESSAGE] } });
      expect(await scoped().count(StockMovement, {})).toBe(0);

      // Naming the receipt's own order on a line is fine.
      const receipt = await service().post(receiptOf(first.id, { line: 1, quantity: "20", unit: "kg", purchaseOrder: first.id }), ACTOR);
      expect(receipt.purchaseOrder).toBe(first.id);
    });

    it("leaves a short delivery Open with the rest outstanding (BUY-014)", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);

      await service().post(receiptOf(order.id, { line: 1, quantity: "95", unit: "kg" }), ACTOR);

      expect(await orders().get(order.id)).toMatchObject({ status: "open", lines: [{ received: "95.000000", outstanding: "5.000000", status: "open" }] });
    });

    it("completes the line and the order on an exact receipt (BUY-016)", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }), ACTOR);

      expect(receipt.warnings).toEqual([]);
      expect(await orders().get(order.id)).toMatchObject({ status: "completed", lines: [{ received: "100.000000", outstanding: "0.000000", status: "completed" }] });
    });

    it("accepts an excess with a warning, completes the order and never shows a negative outstanding (BUY-015)", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "110", unit: "kg" }), ACTOR);

      expect(receipt.warnings).toEqual([{ code: "OVER_RECEIPT", line: 1, excess: "10.000000" }]);
      expect(await orders().get(order.id)).toMatchObject({ status: "completed", lines: [{ received: "110.000000", outstanding: "0.000000", status: "completed" }] });
      expect((await stock("00000001")).quantity).toBe("110.000000");
    });

    it("keeps the header Open while one line is complete and another isn't, and warns on more for the complete one (LFC-009)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      await service().post(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }), ACTOR);
      expect(await orders().get(order.id)).toMatchObject({ status: "open", lines: [{ status: "completed" }, { status: "open" }] });

      const more = await service().post(receiptOf(order.id, { line: 1, quantity: "4", unit: "kg" }, { line: 2, quantity: "10", unit: "each" }), ACTOR);
      expect(more.warnings).toEqual([{ code: "OVER_RECEIPT", line: 1, excess: "4.000000" }]);
      expect((await orders().get(order.id)).status).toBe("completed");
    });

    it("refuses a Completed order, and an order this tenant doesn't have (LFC-008, TEN-014)", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);
      await service().post(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }), ACTOR);

      await expect(service().post(receiptOf(order.id, { line: 1, quantity: "1", unit: "kg" }), ACTOR)).rejects.toMatchObject({
        code: "PURCHASE_ORDER_NOT_OPEN",
        message: "Purchase order 00000001 is completed, so it can't change.",
      });
      await expect(service("test").post(receiptOf(order.id, { line: 1, quantity: "1", unit: "kg" }), ACTOR)).rejects.toMatchObject({
        code: "PURCHASE_ORDER_NOT_FOUND",
      });
      expect(await scoped().count(GoodsReceipt, {})).toBe(1);
    });

    it("dates the movement and the receipt today, keeps the order's planned dates and audits with its own timestamp (INV-010, AUD-030)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      const receipt = await service().post(receiptOf(order.id, { line: 1, quantity: "30", unit: "kg" }), ACTOR);

      expect(receipt.businessDate).toBe(today());
      expect((await scoped().findOneOrFail(StockMovement, {})).businessDate).toBe(today());
      expect((await orders().get(order.id)).lines.map(({ plannedDate }) => plannedDate)).toEqual(["2026-10-13", "2026-10-14"]);
      const [entry] = await scoped().find(TenantAuditEvent, { action: "goods-receipts.goods-receipt.posted" });
      expect(entry.occurredAt).toBeInstanceOf(Date);
    });

    it("audits the receipt, the order's received quantities and each movement in the same transaction (R08)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      await service().post(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }, { line: 2, quantity: "10", unit: "each" }), ACTOR);

      expect(await entries("goods-receipts.goods-receipt.posted")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — purchase order 00000001",
          before: null,
          after: {
            id: "00000001",
            purchaseOrder: "00000001",
            location: "00000001",
            businessDate: today(),
            lines: "1: 00000001 100.000000 kg; 2: 00000002 10.000000 each",
          },
        },
      ]);
      expect(await entries("purchase-orders.purchase-order.received")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel Service",
          before: { status: "open", line1Received: "0.000000", line2Received: "0.000000" },
          after: { status: "completed", line1Received: "100.000000", line2Received: "10.000000" },
        },
      ]);
      expect(await entries("stock.movement.posted")).toHaveLength(2);
    });

    it("advances the order's version, so an edit from a copy loaded before the receipt conflicts (AUD-025)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      await service().post(receiptOf(order.id, { line: 1, quantity: "30", unit: "kg" }), ACTOR);

      await expect(orders().setPlannedDates(order.id, [{ line: 1, plannedDate: "2026-11-01" }], order.version, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
      const current = await orders().get(order.id);
      expect(current.version).toBeGreaterThan(order.version);
    });

    it("refuses a received total no quantity can hold", async () => {
      const max = formatDecimal(MAX_QUANTITY, { fixed: true });
      const order = await orders().create({ ...ORDER, lines: [{ ...ORDER.lines[0], quantity: max }] }, ACTOR);
      const em = scoped();
      (await em.findOneOrFail(PurchaseOrderLine, { position: 1 })).received = max;
      await em.flush();

      await expect(service().post(receiptOf(order.id, { line: 1, quantity: "0.000001", unit: "kg" }), ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.0.quantity": [QUANTITY_OUT_OF_RANGE_MESSAGE] },
      });
      expect(await scoped().count(StockMovement, {})).toBe(0);
    });

    it("maps a receipt ID taken at the same moment and a stale order to conflicts", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const em = scoped();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(new GoodsReceiptService({ em }).post(receiptOf(order.id, { line: 1, quantity: "1", unit: "kg" }), ACTOR)).rejects.toMatchObject({
        code: "RECEIPT_ID_RACE",
        message: RECEIPT_ID_RACE,
      });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(new GoodsReceiptService({ em }).post(receiptOf(order.id, { line: 1, quantity: "1", unit: "kg" }), ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("disk full"));
      await expect(new GoodsReceiptService({ em }).post(receiptOf(order.id, { line: 1, quantity: "1", unit: "kg" }), ACTOR)).rejects.toThrow("disk full");
    });

    it("adds both of two racing receipts, the second retried on what the first committed", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        const posted = await retryingStaleSnapshot(() =>
          inRequestTransaction(em, async () => {
            await new PurchaseOrderService({ em }).get(order.id);
            if (!raced) {
              raced = true;
              await new GoodsReceiptService({ em: scoped("prod", other) }).post(receiptOf(order.id, { line: 1, quantity: "60", unit: "kg" }), ACTOR);
            }
            return new GoodsReceiptService({ em }).post(receiptOf(order.id, { line: 1, quantity: "60", unit: "kg" }), ACTOR);
          }),
        );
        expect(posted).toMatchObject({ id: "00000002", warnings: [{ code: "OVER_RECEIPT", line: 1, excess: "20.000000" }] });
        expect((await orders().get(order.id)).lines[0]).toMatchObject({ received: "120.000000", status: "completed" });
        expect((await stock("00000001")).quantity).toBe("120.000000");
      } finally {
        await other.close();
      }
    });
  });

  describe("list and get", () => {
    it("lists in pages of 100, newest first, each with its own lines (#115, lesson 2026-10-20)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const em = scoped();
      const orderLine = await em.findOneOrFail(PurchaseOrderLine, { position: 2 }, { populate: ["order"] });
      for (let index = 1; index <= 101; index++) {
        const receipt = em.create(GoodsReceipt, { code: String(index).padStart(8, "0"), order: orderLine.order, businessDate: "2026-10-20" });
        em.create(GoodsReceiptLine, { receipt, position: 0, orderLine, quantity: `${index}.000000`, enteredQuantity: String(index), enteredUnit: "each", numerator: "1", denominator: "1" });
      }
      await em.flush();

      const first = await service().list();
      expect(first).toHaveLength(100);
      expect([first[0].id, first[99].id]).toEqual(["00000101", "00000002"]);
      expect(first.every(({ id, lines }) => lines.length === 1 && lines[0].quantity === `${Number(id)}.000000`)).toBe(true);
      expect(await service().list({ page: 1 })).toEqual(first);
      expect((await service().list({ purchaseOrder: order.id, page: 2 })).map(({ id }) => id)).toEqual(["00000001"]);
      expect(await service().list({ page: 3 })).toEqual([]);
    });

    it("lists the tenant's receipts newest first, or one order's, and reads one (TEN-014)", async () => {
      const first = await orders().create(ORDER, ACTOR);
      const second = await orders().create(ORDER, ACTOR);
      await service().post(receiptOf(first.id, { line: 1, quantity: "30", unit: "kg" }), ACTOR);
      await service().post(receiptOf(second.id, { line: 2, quantity: "3", unit: "each" }), ACTOR);
      await service().post(receiptOf(first.id, { line: 2, quantity: "4", unit: "each" }), ACTOR);

      expect((await service().list()).map(({ id, purchaseOrder }) => [id, purchaseOrder])).toEqual([
        ["00000003", first.id],
        ["00000002", second.id],
        ["00000001", first.id],
      ]);
      expect((await service().list({ purchaseOrder: first.id })).map(({ id }) => id)).toEqual(["00000003", "00000001"]);
      expect(await service().list({})).toHaveLength(3);
      expect(await service("test").list()).toEqual([]);
      await expect(service("test").list({ purchaseOrder: first.id })).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND" });

      expect(await service().get("00000002")).toEqual({
        id: "00000002",
        purchaseOrder: second.id,
        location: "00000001",
        businessDate: today(),
        createdAt: expect.any(Date),
        lines: [{ movementId: expect.any(String), reversedBy: null, line: 2, material: "00000002", quantity: "3.000000", enteredQuantity: "3", enteredUnit: "each", numerator: "1", denominator: "1" }],
      });
      await expect(service("test").get("00000002")).rejects.toMatchObject({ code: "GOODS_RECEIPT_NOT_FOUND", status: 404 });
    });
  });

  describe("purchase-order edits after a receipt", () => {
    it("keeps the planned date of an Open order editable and audited, and refuses edits to a Completed one (BUY-024, spec Q8)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      await service().post(receiptOf(order.id, { line: 1, quantity: "80", unit: "kg" }), ACTOR);

      const loaded = await orders().get(order.id);
      const edited = await orders().setPlannedDates(order.id, [{ line: 1, plannedDate: "2026-10-27" }], loaded.version, ACTOR);
      expect(edited.lines[0]).toMatchObject({ plannedDate: "2026-10-27", received: "80.000000", outstanding: "20.000000" });
      expect(await entries("purchase-orders.purchase-order.updated")).toEqual([
        expect.objectContaining({ before: { line1PlannedDate: "2026-10-13" }, after: { line1PlannedDate: "2026-10-27" } }),
      ]);

      await service().post(receiptOf(order.id, { line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "10", unit: "each" }), ACTOR);
      const completed = await orders().get(order.id);
      await expect(orders().setPlannedDates(order.id, [{ line: 1, plannedDate: "2026-11-01" }], completed.version, ACTOR)).rejects.toMatchObject({
        code: "PURCHASE_ORDER_NOT_OPEN",
      });
    });

    it("refuses a base-unit change of a material on an order line before any posting (MAT-031)", async () => {
      await orders().create(ORDER, ACTOR);
      const materials = new MaterialService({ em: scoped() });
      const bolts = await materials.get("00000002");

      await expect(materials.update(bolts.id, { baseUnit: "pcs" }, bolts.version, ACTOR)).rejects.toMatchObject({ code: "BASE_UNIT_IN_USE" });
      expect(await scoped().count(StockMovement, {})).toBe(0);
    });

    it("leaves stock untouched until a receipt posts, then raises it exactly once (INV-024)", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);
      expect(await scoped().count(StockBalance, {})).toBe(0);

      await service().post(receiptOf(order.id, { line: 1, quantity: "40", unit: "kg" }), ACTOR);

      expect((await stock("00000001")).quantity).toBe("40.000000");
      expect(await scoped().count(StockMovement, {})).toBe(1);
    });

    it("leaves stock at zero when a requisition is converted into an order, until a receipt posts (BUY-009)", async () => {
      const requisition = await new PurchaseRequisitionService({ em: scoped() }).create(
        { material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2026-10-20" },
        ACTOR,
      );
      const order = await orders().create({ ...ORDER, lines: [{ ...ORDER.lines[0], requisition: requisition.id }] }, ACTOR);
      expect(order.lines[0].requisition).toBe(requisition.id);

      expect(await stock("00000001")).toMatchObject({ quantity: "0.000000", movements: [] });
      expect(await scoped().count(StockBalance, {})).toBe(0);

      await service().post(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }), ACTOR);
      expect((await stock("00000001")).quantity).toBe("100.000000");
    });
  });

  describe("seedDemo", () => {
    const at = new Date("2025-06-15T23:30:00Z");

    it("posts and stamps everything from the seed's moment without audit, under the same rules as post", async () => {
      const order = await orders().create({ ...ORDER, lines: [ORDER.lines[0]] }, ACTOR);
      const auditBefore = await scoped().count(TenantAuditEvent, {});
      const receipt = await service().seedDemo(receiptOf(order.id, { line: 1, quantity: "100", unit: "kg" }), at);
      expect(receipt).toMatchObject({ id: "00000001", businessDate: "2025-06-15", createdAt: at, lines: [{ quantity: "100.000000" }], warnings: [] });
      const [movement] = await scoped().find(StockMovement, { type: GOODS_RECEIPT_MOVEMENT });
      expect(movement).toMatchObject({ businessDate: "2025-06-15", channel: "seed", actorUsername: "Demo seed", quantity: "100.000000", balanceAfter: "100.000000" });
      expect(movement.occurredAt).toEqual(at);
      expect(await orders().get(order.id)).toMatchObject({ status: "completed", lines: [{ received: "100.000000", status: "completed" }] });
      expect((await scoped().findOneOrFail(PurchaseOrder, { code: order.id })).updatedAt).toEqual(at);
      expect(await scoped().count(TenantAuditEvent, {})).toBe(auditBefore);
    });

    it("refuses a line the order doesn't have and writes nothing", async () => {
      const order = await orders().create(ORDER, ACTOR);
      await expect(service().seedDemo(receiptOf(order.id, { line: 3, quantity: "1", unit: "kg" }), at))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { "lines.0.line": [LINE_NO_SUCH_LINE_MESSAGE] } });
      expect(await scoped().count(GoodsReceipt, {})).toBe(0);
      expect(await scoped().count(StockMovement, {})).toBe(0);
    });
  });
});
