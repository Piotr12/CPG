import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer,
  CustomerOrder,
  CustomerOrderLine,
  Location,
  Material,
  MaterialConversion,
  Shipment,
  ShipmentLine,
  StockMovement,
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
import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import {
  SHIPMENT_LINE_ORDER_MESSAGE,
  SHIPMENT_NO_SUCH_LINE_MESSAGE,
  SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE,
  type ShipmentCreateInput,
} from "../../validators/shipments/shipment.schema";
import type { AuditActor } from "../audit/actor";
import { CustomerOrderService, type CustomerOrderView } from "../customer-orders/customer-order.service";
import { StockService } from "../stock/stock.service";
import { SHIPMENT_ID_RACE, ShipmentService } from "./shipment.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };

/** Line A: 50 widgets due 4 Nov; line B: 30 gadgets due 8 Nov; at location 1 for customer 1. */
const ORDER = {
  customer: "00000001",
  location: "00000001",
  lines: [
    { material: "00000001", quantity: "50", unit: "each", requiredDate: "2026-11-04" },
    { material: "00000002", quantity: "30", unit: "each", requiredDate: "2026-11-08" },
  ],
};

describe("ShipmentService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod") => new ShipmentService({ em: scoped(tenant) });
  const orders = (tenant: TenantCode = "prod") => new CustomerOrderService({ em: scoped(tenant) });
  const shipmentOf = (order: CustomerOrderView, ...lines: ShipmentCreateInput["lines"]): ShipmentCreateInput => ({ customerOrder: order.id, plannedDate: "2026-11-03", lines });
  const stock = (material: string) => new StockService({ em: scoped() }).get({ material, location: "00000001" });

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-shipment-service-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const widget = em.create(Material, { code: "00000001", type: "finished", description: "Widget", baseUnit: "each" });
      em.create(MaterialConversion, { material: widget, unit: "box", numerator: "10", denominator: "1" });
      em.create(Material, { code: "00000002", type: "finished", description: "Gadget", baseUnit: "each" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      em.create(Customer, { code: "00000001", name: "Retail" });
      await em.flush();
    }
    await new StockService({ em: scoped() }).correct({ material: "00000001", location: "00000001", quantity: "100", unit: "each", reason: "Count" }, ACTOR);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("create", () => {
    it("references exactly one order and its matching lines, and moves no stock and fulfils nothing (SAL-006, SAL-007, SAL-009)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const [a, b] = order.lines;

      const shipment = await service().create(
        shipmentOf(order, { orderLine: a.id, quantity: "50", unit: "each" }, { orderLine: b.id, quantity: "30", unit: "each", customerOrder: order.id }),
        ACTOR,
      );

      expect(shipment).toEqual({
        id: "00000001",
        customerOrder: order.id,
        customer: "00000001",
        location: "00000001",
        plannedDate: "2026-11-03",
        status: "open",
        createdAt: expect.any(Date),
        lines: [
          { line: 1, orderLine: a.id, material: "00000001", quantity: "50.000000", enteredQuantity: "50", enteredUnit: "each", numerator: "1", denominator: "1", issued: "0.000000", toIssue: "50.000000" },
          { line: 2, orderLine: b.id, material: "00000002", quantity: "30.000000", enteredQuantity: "30", enteredUnit: "each", numerator: "1", denominator: "1", issued: "0.000000", toIssue: "30.000000" },
        ],
      });
      expect((await stock("00000001")).quantity).toBe("100.000000");
      expect(await scoped().count(StockMovement, { type: { $ne: "correction" } })).toBe(0);
      expect((await orders().get(order.id)).lines.map(({ fulfilled }) => fulfilled)).toEqual(["0.000000", "0.000000"]);
      const [entry] = await scoped().find(TenantAuditEvent, { action: "shipments.shipment.created" });
      expect(entry).toMatchObject({
        subjectId: "00000001",
        subjectLabel: `00000001 — customer order ${order.id}`,
        before: null,
        after: { id: "00000001", customerOrder: order.id, location: "00000001", plannedDate: "2026-11-03", status: "open", lines: "1: 00000001 50.000000 each; 2: 00000002 30.000000 each" },
      });
    });

    it("plans in any unit the material converts and keeps what was entered (R03)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      const shipment = await service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "2.5", unit: "box" }), ACTOR);

      expect(shipment.lines[0]).toMatchObject({ quantity: "25.000000", enteredQuantity: "2.5", enteredUnit: "box", numerator: "10", denominator: "1", toIssue: "25.000000" });
    });

    it("refuses a line of another order, stated or by its ID, and writes nothing (SAL-008)", async () => {
      const first = await orders().create(ORDER, ACTOR);
      const second = await orders().create(ORDER, ACTOR);

      await expect(
        service().create(
          shipmentOf(
            first,
            { orderLine: first.lines[0].id, quantity: "10", unit: "each" },
            { orderLine: second.lines[1].id, quantity: "5", unit: "each", customerOrder: second.id },
            { orderLine: second.lines[0].id, quantity: "5", unit: "each" },
          ),
          ACTOR,
        ),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.1.customerOrder": [SHIPMENT_LINE_ORDER_MESSAGE], "lines.2.orderLine": [SHIPMENT_NO_SUCH_LINE_MESSAGE] },
      });
      expect(await scoped().count(Shipment, {})).toBe(0);
      expect(await scoped().count(ShipmentLine, {})).toBe(0);
      expect(await scoped().count(TenantAuditEvent, { action: "shipments.shipment.created" })).toBe(0);
    });

    it("refuses more than a line's outstanding and a unit the material doesn't convert, collecting both (spec Q3)", async () => {
      const order = await orders().create(ORDER, ACTOR);

      await expect(
        service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "50.000001", unit: "each" }, { orderLine: order.lines[1].id, quantity: "1", unit: "box" }), ACTOR),
      ).rejects.toMatchObject({
        fieldErrors: { "lines.0.quantity": [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE], "lines.1.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      // Two shipments may each plan the whole outstanding: only a goods issue is binding.
      await service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "50", unit: "each" }), ACTOR);
      expect((await service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "50", unit: "each" }), ACTOR)).id).toBe("00000002");
    });

    it("refuses a line removed from its order, which no longer awaits anything", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const removed = order.lines[1].id;
      await orders().update(
        order.id,
        { customer: order.customer, location: order.location, lines: [{ id: order.lines[0].id, material: "00000001", quantity: "50", unit: "each", requiredDate: "2026-11-04" }] },
        order.version,
        ACTOR,
      );

      await expect(service().create(shipmentOf(order, { orderLine: removed, quantity: "1", unit: "each" }), ACTOR)).rejects.toMatchObject({
        fieldErrors: { "lines.0.orderLine": [SHIPMENT_NO_SUCH_LINE_MESSAGE] },
      });
    });

    it("refuses an order that isn't Open, and one this tenant doesn't have (TEN-014)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const line = { orderLine: order.lines[0].id, quantity: "1", unit: "each" };
      await expect(service("test").create(shipmentOf(order, line), ACTOR)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_FOUND" });
      const em = scoped();
      (await em.findOneOrFail(CustomerOrder, { code: order.id })).status = "completed";
      await em.flush();

      await expect(service().create(shipmentOf(order, line), ACTOR)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_OPEN" });
      expect(await scoped().count(Shipment, {})).toBe(0);
    });

    it("maps a shipment ID taken at the same moment to a conflict, and passes other failures on", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const em = scoped();
      const input = shipmentOf(order, { orderLine: order.lines[0].id, quantity: "1", unit: "each" });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(new ShipmentService({ em }).create(input, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_ID_RACE", message: SHIPMENT_ID_RACE });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("disk full"));
      await expect(new ShipmentService({ em }).create(input, ACTOR)).rejects.toThrow("disk full");
    });
  });

  describe("seedDemo", () => {
    it("creates a shipment stamped at the seed's moment with no audit, under the same rules as create", async () => {
      const at = new Date("2025-06-15T08:30:00Z");
      const order = await orders().create(ORDER, ACTOR);
      const input = shipmentOf(order, { orderLine: order.lines[0].id, quantity: "50", unit: "each" });
      const seeded = await service().seedDemo(input, at);
      expect(seeded).toMatchObject({ id: "00000001", status: "open", createdAt: at, lines: [{ quantity: "50.000000", toIssue: "50.000000" }] });
      expect((await scoped().findOneOrFail(Shipment, { code: "00000001" })).createdAt).toEqual(at);
      expect(await scoped().count(TenantAuditEvent, { action: { $like: "shipments.%" } })).toBe(0);
      const user = await service().create(shipmentOf(order, { orderLine: order.lines[1].id, quantity: "1", unit: "each" }), ACTOR);
      expect(user.id).toBe("00000002");
      expect(user.createdAt.getTime()).toBeGreaterThan(at.getTime());
      expect(await scoped().count(TenantAuditEvent, { action: "shipments.shipment.created" })).toBe(1);
      await expect(service().seedDemo(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "51", unit: "each" }), at))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { "lines.0.quantity": [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE] } });
      expect(await scoped().count(Shipment, {})).toBe(2);
    });
  });

  describe("list and get", () => {
    it("lists in pages of 100, newest first, each with its own lines (lesson 2026-10-20)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const em = scoped();
      const orderLine = await em.findOneOrFail(CustomerOrderLine, { id: order.lines[0].id }, { populate: ["order"] });
      for (let index = 1; index <= 101; index++) {
        const shipment = em.create(Shipment, { code: String(index).padStart(8, "0"), order: orderLine.order, plannedDate: "2026-11-03" });
        em.create(ShipmentLine, { shipment, position: 0, orderLine, quantity: `${index}.000000`, enteredQuantity: String(index), enteredUnit: "each", numerator: "1", denominator: "1" });
      }
      await em.flush();

      const first = await service().list();
      expect(first).toHaveLength(100);
      expect([first[0].id, first[99].id]).toEqual(["00000101", "00000002"]);
      expect(first.every(({ id, lines }) => lines.length === 1 && lines[0].quantity === `${Number(id)}.000000`)).toBe(true);
      expect((await service().list({ customerOrder: order.id, page: 2 })).map(({ id }) => id)).toEqual(["00000001"]);
      expect(await service().list({ page: 3 })).toEqual([]);
    });

    it("lists the tenant's shipments newest first, or one order's, and reads one (TEN-014)", async () => {
      const first = await orders().create(ORDER, ACTOR);
      const second = await orders().create(ORDER, ACTOR);
      await service().create(shipmentOf(first, { orderLine: first.lines[0].id, quantity: "1", unit: "each" }), ACTOR);
      await service().create(shipmentOf(second, { orderLine: second.lines[1].id, quantity: "2", unit: "each" }), ACTOR);

      expect((await service().list()).map(({ id, customerOrder }) => [id, customerOrder])).toEqual([
        ["00000002", second.id],
        ["00000001", first.id],
      ]);
      expect((await service().list({ customerOrder: first.id })).map(({ id }) => id)).toEqual(["00000001"]);
      expect((await service().get("00000002")).lines).toMatchObject([{ line: 1, orderLine: second.lines[1].id, quantity: "2.000000" }]);
      expect(await service("test").list()).toEqual([]);
      await expect(service("test").get("00000001")).rejects.toMatchObject({ code: "SHIPMENT_NOT_FOUND" });
      await expect(service().list({ customerOrder: "00000009" })).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_FOUND" });
    });
  });
});
