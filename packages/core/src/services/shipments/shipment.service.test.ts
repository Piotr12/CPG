import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer,
  CustomerOrder,
  CustomerOrderLine,
  GoodsIssue,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
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
  SHIPMENT_QUANTITY_ISSUED_MESSAGE,
  SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE,
  type ShipmentCreateInput,
} from "../../validators/shipments/shipment.schema";
import type { AuditActor } from "../audit/actor";
import { CustomerOrderService, type CustomerOrderView } from "../customer-orders/customer-order.service";
import { ISSUE_NO_SUCH_LINE_MESSAGE } from "../../validators/goods-issues/goods-issue.schema";
import { GoodsIssueService } from "../goods-issues/goods-issue.service";
import { StockReversalService } from "../stock/stock-reversal.service";
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
        version: 1,
        createdAt: expect.any(Date),
        lines: [
          { line: 1, orderLine: a.id, material: "00000001", quantity: "50.000000", enteredQuantity: "50", enteredUnit: "each", numerator: "1", denominator: "1", issued: "0.000000", posted: false, toIssue: "50.000000" },
          { line: 2, orderLine: b.id, material: "00000002", quantity: "30.000000", enteredQuantity: "30", enteredUnit: "each", numerator: "1", denominator: "1", issued: "0.000000", posted: false, toIssue: "30.000000" },
        ],
      });
      // The next added line is numbered after these two (shipment edit spec Q3).
      expect((await scoped().findOneOrFail(Shipment, { code: "00000001" })).nextLine).toBe(2);
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

  describe("update", () => {
    const issues = () => new GoodsIssueService({ em: scoped() });
    const audits = (action: string) => scoped().find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } });
    const each = (orderLine: string, quantity: string, unit = "each") => ({ orderLine, quantity, unit });
    /** An order with lines A (50) and B (30), and shipment 00000001 planning 20 of A and 10 of B. */
    async function planned() {
      const order = await orders().create(ORDER, ACTOR);
      const [a, b] = order.lines;
      const shipment = await service().create(shipmentOf(order, each(a.id, "20"), each(b.id, "10")), ACTOR);
      return { order, a, b, shipment };
    }

    it("changes the date and a quantity, adds a line numbered after every earlier one and removes an unissued one, audited, at a new version (shipment edit spec Q2, Q3, Q5)", async () => {
      const { order, a, b, shipment } = await planned();
      const removed = await service().update(shipment.id, { plannedDate: "2026-11-09", lines: [each(a.id, "25")] }, 1, ACTOR);
      expect(removed).toMatchObject({ plannedDate: "2026-11-09", status: "open", version: 2, lines: [{ line: 1, orderLine: a.id, quantity: "25.000000" }] });
      expect(await scoped().count(ShipmentLine, {})).toBe(1);

      // B comes back as a new line 3: number 2 is never handed out again.
      const added = await service().update(shipment.id, { plannedDate: "2026-11-09", lines: [each(a.id, "25"), each(b.id, "1", "each")] }, 2, ACTOR);
      expect(added.lines.map(({ line, orderLine, quantity }) => [line, orderLine, quantity])).toEqual([[1, a.id, "25.000000"], [3, b.id, "1.000000"]]);
      expect(added.version).toBe(3);
      expect((await scoped().findOneOrFail(Shipment, { code: shipment.id })).nextLine).toBe(3);
      expect((await audits("shipments.shipment.updated")).map(({ subjectId, subjectLabel, before, after }) => ({ subjectId, subjectLabel, before, after }))).toEqual([
        {
          subjectId: shipment.id,
          subjectLabel: `${shipment.id} — customer order ${order.id}`,
          before: { plannedDate: "2026-11-03", status: "open", lines: "1: 00000001 20.000000 each; 2: 00000002 10.000000 each" },
          after: { plannedDate: "2026-11-09", status: "open", lines: "1: 00000001 25.000000 each" },
        },
        {
          subjectId: shipment.id,
          subjectLabel: `${shipment.id} — customer order ${order.id}`,
          before: { plannedDate: "2026-11-09", status: "open", lines: "1: 00000001 25.000000 each" },
          after: { plannedDate: "2026-11-09", status: "open", lines: "1: 00000001 25.000000 each; 3: 00000002 1.000000 each" },
        },
      ]);
      // A goods issue naming the removed number is refused: the line is gone.
      await expect(issues().post({ shipment: shipment.id, lines: [{ line: 2, quantity: "1", unit: "each" }] }, ACTOR)).rejects.toMatchObject({
        fieldErrors: { "lines.0.line": [ISSUE_NO_SUCH_LINE_MESSAGE] },
      });
    });

    it("persists a date-only edit and advances the version, which a refreshing completion check would otherwise discard", async () => {
      const { a, b, shipment } = await planned();
      const edited = await service().update(shipment.id, { plannedDate: "2026-12-01", lines: [each(a.id, "20"), each(b.id, "10")] }, 1, ACTOR);
      expect(edited).toMatchObject({ plannedDate: "2026-12-01", version: 2 });
      expect(await service().get(shipment.id)).toMatchObject({ plannedDate: "2026-12-01", version: 2 });
    });

    it("records nothing and keeps the version for an edit that changes nothing, comparing decimals, and keeps a stored conversion (R03)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await service().create(shipmentOf(order, each(order.lines[0].id, "2.5", "box")), ACTOR);
      const em = scoped();
      (await em.findOneOrFail(MaterialConversion, { unit: "box" })).numerator = "12";
      await em.flush();

      const same = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(order.lines[0].id, "2.500", "box")] }, 1, ACTOR);
      expect(same).toMatchObject({ version: 1, lines: [{ quantity: "25.000000", enteredQuantity: "2.5", numerator: "10" }] });
      expect(await audits("shipments.shipment.updated")).toEqual([]);
      // A changed entry converts at today's factor.
      expect((await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(order.lines[0].id, "3", "box")] }, 1, ACTOR)).lines[0])
        .toMatchObject({ quantity: "36.000000", enteredQuantity: "3", numerator: "12" });
    });

    it("refuses a quantity below what the line issued, completes the shipment at exactly that, and audits both (issue criteria, spec Q4)", async () => {
      const { order, a, shipment } = await planned();
      const one = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "50")] }, 1, ACTOR);
      await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "30", unit: "each" }] }, ACTOR);
      const loaded = await service().get(shipment.id);
      expect(loaded.version).toBeGreaterThan(one.version);

      await expect(service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "20")] }, loaded.version, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.0.quantity": [SHIPMENT_QUANTITY_ISSUED_MESSAGE] },
      });
      expect((await service().get(shipment.id)).lines[0].quantity).toBe("50.000000");

      const done = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "30")] }, loaded.version, ACTOR);
      expect(done).toMatchObject({ status: "completed", lines: [{ quantity: "30.000000", issued: "30.000000", toIssue: "0.000000", posted: true }] });
      expect((await orders().get(order.id)).lines[0]).toMatchObject({ fulfilled: "30.000000", status: "open" });
      const trail = await scoped().find(TenantAuditEvent, { subjectType: "Shipment", action: { $in: ["shipments.shipment.updated", "shipments.shipment.completed"] } }, { orderBy: { occurredAt: "asc" } });
      expect(trail.map(({ action }) => action).slice(-2)).toEqual(["shipments.shipment.updated", "shipments.shipment.completed"]);
      await expect(service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "40")] }, done.version, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN", message: `Shipment ${shipment.id} is completed, so it can't be changed.` });
    });

    it("lets a raised line leave at most the order line's outstanding to issue, a new line plan at most its outstanding, and a lowered line pass whatever is outstanding (spec Q4, SAL-018)", async () => {
      const { order, a, b, shipment } = await planned();
      // A second shipment issues 45 of A's 50, so A has 5 outstanding while this shipment plans 20 of it.
      const other = await service().create(shipmentOf(order, each(a.id, "45")), ACTOR);
      await issues().post({ shipment: other.id, lines: [{ line: 1, quantity: "45", unit: "each" }] }, ACTOR);
      const version = (await service().get(shipment.id)).version;

      await expect(service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "21"), each(b.id, "30.000001")] }, version, ACTOR)).rejects.toMatchObject({
        fieldErrors: { "lines.0.quantity": [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE], "lines.1.quantity": [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE] },
      });
      const lowered = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "15"), each(b.id, "30")] }, version, ACTOR);
      expect(lowered.lines.map(({ quantity, toIssue }) => [quantity, toIssue])).toEqual([["15.000000", "5.000000"], ["30.000000", "30.000000"]]);

      const fresh = await orders().create(ORDER, ACTOR);
      const newLine = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "15"), each(b.id, "30")] }, lowered.version, ACTOR);
      expect(newLine.version).toBe(lowered.version);
      await expect(
        service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "15"), { ...each(fresh.lines[0].id, "1"), customerOrder: fresh.id }, each(fresh.lines[1].id, "1"), each(b.id, "1", "box")] }, lowered.version, ACTOR),
      ).rejects.toMatchObject({
        fieldErrors: { "lines.1.customerOrder": [SHIPMENT_LINE_ORDER_MESSAGE], "lines.2.orderLine": [SHIPMENT_NO_SUCH_LINE_MESSAGE], "lines.3.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
    });

    it("refuses to remove a line any goods issue named, even after its reversal, naming the line (spec Q9)", async () => {
      const { a, b, shipment } = await planned();
      const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }] }, ACTOR);
      const em = scoped();
      const movement = await em.findOneOrFail(StockMovement, { postingId: (await em.findOneOrFail(GoodsIssue, { code: issue.id })).id });
      await new StockReversalService({ em: scoped() }).reverse(movement.id, { reason: "Wrong" }, ACTOR);
      const loaded = await service().get(shipment.id);
      expect(loaded.lines[0]).toMatchObject({ issued: "0.000000", posted: true });

      await expect(service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(b.id, "10")] }, loaded.version, ACTOR)).rejects.toMatchObject({
        code: "SHIPMENT_LINE_ISSUED",
        message: "Line 1 has goods issued against it, so it stays on the shipment. Lower it to what was issued instead.",
        messageParams: { line: "1" },
      });
      expect((await service().get(shipment.id)).lines.map(({ orderLine }) => orderLine)).toEqual([a.id, b.id]);
    });

    it("refuses a stale version, a cancelled shipment, a malformed edit and another tenant's shipment, and maps a lost race (TEN-014)", async () => {
      const { a, shipment } = await planned();
      const changes = { plannedDate: "2026-11-04", lines: [each(a.id, "20")] };
      await service().update(shipment.id, changes, 1, ACTOR);
      await expect(service().update(shipment.id, { ...changes, plannedDate: "2026-11-05" }, 1, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect((await service().get(shipment.id)).plannedDate).toBe("2026-11-04");
      await expect(service().update(shipment.id, { ...changes, lines: [] }, 2, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service("test").update(shipment.id, changes, 2, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_FOUND" });

      const em = scoped();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(new ShipmentService({ em }).update(shipment.id, changes, 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const cancelled = await service().cancel(shipment.id, 2, ACTOR);
      await expect(service().update(shipment.id, changes, cancelled.version, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN", message: `Shipment ${shipment.id} is cancelled, so it can't be changed.` });
    });

    it("numbers a new line after the highest current line when the counter is behind, as on a shipment an older release created", async () => {
      const { a, b, shipment } = await planned();
      const em = scoped();
      (await em.findOneOrFail(Shipment, { code: shipment.id })).nextLine = 0;
      await em.flush();
      const version = (await service().get(shipment.id)).version;

      await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "20")] }, version, ACTOR);
      const readded = await service().update(shipment.id, { plannedDate: "2026-11-03", lines: [each(a.id, "20"), each(b.id, "5")] }, version + 1, ACTOR);
      // The counter took over from the highest line (2) on the first edit, so the new line is 3.
      expect(readded.lines.map(({ line }) => line)).toEqual([1, 3]);
    });
  });

  describe("cancel", () => {
    it("cancels an Open shipment nothing was issued against, audited, changing no stock or order, and ends it for issues, edits and a second cancel (shipment edit spec Q6)", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "20", unit: "each" }), ACTOR);
      const orderBefore = await orders().get(order.id);

      const cancelled = await service().cancel(shipment.id, 1, ACTOR);
      expect(cancelled).toMatchObject({ status: "cancelled", version: 2, lines: [{ quantity: "20.000000", issued: "0.000000" }] });
      const [entry] = await scoped().find(TenantAuditEvent, { action: "shipments.shipment.cancelled" });
      expect(entry).toMatchObject({ subjectId: shipment.id, subjectLabel: `${shipment.id} — customer order ${order.id}`, before: { status: "open" }, after: { status: "cancelled" } });
      expect(await orders().get(order.id)).toEqual(orderBefore);
      expect((await stock("00000001")).quantity).toBe("100.000000");

      await expect(new GoodsIssueService({ em: scoped() }).post({ shipment: shipment.id, lines: [{ line: 1, quantity: "1", unit: "each" }] }, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN" });
      await expect(service().cancel(shipment.id, 2, ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN", message: `Shipment ${shipment.id} is cancelled, so it can't be cancelled.` });
      // The order's own completion leaves a cancelled shipment as it is.
      await orders().cancel(order.id, orderBefore.version, ACTOR);
      expect((await service().get(shipment.id)).status).toBe("cancelled");
    });

    it("refuses a shipment any goods issue was posted against, even one since reversed, and a stale version; maps a lost race", async () => {
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await service().create(shipmentOf(order, { orderLine: order.lines[0].id, quantity: "20", unit: "each" }), ACTOR);
      await expect(service().cancel(shipment.id, 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const issue = await new GoodsIssueService({ em: scoped() }).post({ shipment: shipment.id, lines: [{ line: 1, quantity: "5", unit: "each" }] }, ACTOR);
      const em = scoped();
      const movement = await em.findOneOrFail(StockMovement, { postingId: (await em.findOneOrFail(GoodsIssue, { code: issue.id })).id });
      await new StockReversalService({ em: scoped() }).reverse(movement.id, { reason: "Wrong" }, ACTOR);
      const loaded = await service().get(shipment.id);
      expect(loaded.lines[0]).toMatchObject({ issued: "0.000000", posted: true });

      await expect(service().cancel(shipment.id, loaded.version, ACTOR)).rejects.toMatchObject({
        code: "SHIPMENT_ISSUED",
        message: `Goods have been issued against shipment ${shipment.id}, so it can't be cancelled. To finish it, lower its lines to what was issued.`,
      });
      expect((await service().get(shipment.id)).status).toBe("open");

      const spied = scoped();
      vi.spyOn(spied, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(new ShipmentService({ em: spied }).cancel(shipment.id, loaded.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      vi.spyOn(spied, "transactional").mockRejectedValueOnce(new Error("disk full"));
      await expect(new ShipmentService({ em: spied }).cancel(shipment.id, loaded.version, ACTOR)).rejects.toThrow("disk full");
    });
  });
});
