import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer,
  CustomerOrder,
  GoodsIssue,
  GoodsIssueLine,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
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
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { ISSUE_LINE_SHIPMENT_MESSAGE, ISSUE_NO_SUCH_LINE_MESSAGE, ISSUE_QUANTITY_MESSAGE, type IssueCreateInput } from "../../validators/goods-issues/goods-issue.schema";
import type { AuditActor } from "../audit/actor";
import { CustomerOrderService, type CustomerOrderView } from "../customer-orders/customer-order.service";
import { ShipmentService, type ShipmentView } from "../shipments/shipment.service";
import { StockService } from "../stock/stock.service";
import { TransferService } from "../transfers/transfer.service";
import { GOODS_ISSUE_MOVEMENT, GoodsIssueService, ISSUE_ID_RACE } from "./goods-issue.service";

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
/** One line of 60 widgets. */
const SIXTY = { ...ORDER, lines: [{ ...ORDER.lines[0], quantity: "60" }] };

const today = () => new Date().toISOString().slice(0, 10);

describe("GoodsIssueService", () => {
  let orm: Orm;
  let directory: string;
  const scoped = (tenant: TenantCode = "prod", from: Orm = orm) => {
    const em = from.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod") => new GoodsIssueService({ em: scoped(tenant) });
  const orders = () => new CustomerOrderService({ em: scoped() });
  const shipments = () => new ShipmentService({ em: scoped() });
  const stock = (material: string, location = "00000001") => new StockService({ em: scoped() }).get({ material, location });
  const count = (material: string, quantity: string, location = "00000001") =>
    new StockService({ em: scoped() }).correct({ material, location, quantity, unit: "each", reason: "Count" }, ACTOR);
  /** A shipment of the whole of each of `order`'s lines. */
  const shipAll = (order: CustomerOrderView) =>
    shipments().create({ customerOrder: order.id, plannedDate: "2026-11-03", lines: order.lines.map(({ id, quantity }) => ({ orderLine: id, quantity, unit: "each" })) }, ACTOR);
  const issueOf = (shipment: ShipmentView, ...lines: IssueCreateInput["lines"]): IssueCreateInput => ({ shipment: shipment.id, lines });
  const each = (line: number, quantity: string) => ({ line, quantity, unit: "each" });
  const entries = async (action: string) =>
    (await scoped().find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(({ subjectId, subjectLabel, before, after }) => ({
      subjectId,
      subjectLabel,
      before,
      after,
    }));
  /** Everything an issue writes, to show a refusal wrote none of it. */
  const written = async (order: string) => ({
    issues: await scoped().count(GoodsIssue, {}),
    lines: await scoped().count(GoodsIssueLine, {}),
    movements: await scoped().count(StockMovement, { type: GOODS_ISSUE_MOVEMENT }),
    fulfilled: (await orders().get(order)).lines.map(({ fulfilled }) => fulfilled),
    issued: (await scoped().find(ShipmentLine, {}, { orderBy: { position: "asc" } })).map(({ issued }) => issued),
    stock: (await stock("00000001")).quantity,
  });

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "cpg-issue-service-"));
    const config = loadConfig({ DATA_DIR: directory });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const widget = em.create(Material, { code: "00000001", type: "finished", description: "Widget", baseUnit: "each" });
      em.create(MaterialConversion, { material: widget, unit: "box", numerator: "10", denominator: "1" });
      em.create(Material, { code: "00000002", type: "finished", description: "Gadget", baseUnit: "each" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      em.create(Location, { code: "00000002", name: "Warehouse" });
      em.create(Customer, { code: "00000001", name: "Retail" });
      await em.flush();
    }
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("post", () => {
    it("fulfils only its line and lowers only that material's stock at the order's location (SAL-010, INV-003)", async () => {
      await count("00000001", "100");
      await count("00000002", "100");
      await count("00000001", "9", "00000002");
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await shipAll(order);

      const issue = await service().post(issueOf(shipment, each(1, "20")), ACTOR);

      expect(issue).toEqual({
        id: "00000001",
        shipment: shipment.id,
        customerOrder: order.id,
        location: "00000001",
        businessDate: today(),
        createdAt: expect.any(Date),
        lines: [{ movementId: expect.any(String), reversedBy: null, line: 1, orderLine: order.lines[0].id, material: "00000001", quantity: "20.000000", enteredQuantity: "20", enteredUnit: "each", numerator: "1", denominator: "1" }],
      });
      expect(await orders().get(order.id)).toMatchObject({ status: "open", lines: [{ fulfilled: "20.000000", status: "open" }, { fulfilled: "0.000000", status: "open" }] });
      expect((await stock("00000001")).quantity).toBe("80.000000");
      expect((await stock("00000002")).quantity).toBe("100.000000");
      expect((await stock("00000001", "00000002")).quantity).toBe("9.000000");
      expect(await shipments().get(shipment.id)).toMatchObject({ status: "open", lines: [{ issued: "20.000000", toIssue: "30.000000" }, { issued: "0.000000", toIssue: "30.000000" }] });
      const [movement] = await scoped().find(StockMovement, { type: GOODS_ISSUE_MOVEMENT });
      expect(movement).toMatchObject({
        postingId: (await scoped().findOneOrFail(GoodsIssue, { code: issue.id })).id,
        quantity: "-20.000000",
        balanceBefore: "100.000000",
        balanceAfter: "80.000000",
        reason: `Goods issue 00000001 for shipment ${shipment.id}, customer order ${order.id}`,
      });
    });

    it("accumulates repeated issues and keeps the order Open with the rest outstanding (SAL-011, LFC-002)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);

      await service().post(issueOf(shipment, each(1, "20")), ACTOR);
      const second = await service().post(issueOf(shipment, each(1, "25")), ACTOR);

      expect(second.id).toBe("00000002");
      expect(await orders().get(order.id)).toMatchObject({ status: "open", lines: [{ quantity: "60.000000", fulfilled: "45.000000", status: "open" }] });
      expect((await shipments().get(shipment.id)).lines[0]).toMatchObject({ issued: "45.000000", toIssue: "15.000000" });
      expect((await stock("00000001")).quantity).toBe("55.000000");
    });

    it("refuses an over-issue with no stock or demand change, and the exact final issue completes the line, then the order (SAL-012, SAL-013, LFC-003, LFC-010)", async () => {
      await count("00000001", "100");
      await count("00000002", "100");
      const order = await orders().create({ ...ORDER, lines: [{ ...ORDER.lines[0], quantity: "60" }, ORDER.lines[1]] }, ACTOR);
      const shipment = await shipAll(order);
      await service().post(issueOf(shipment, each(1, "50")), ACTOR);
      const before = await written(order.id);

      await expect(service().post(issueOf(shipment, each(1, "11")), ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "lines.0.quantity": [ISSUE_QUANTITY_MESSAGE] },
      });
      expect(await written(order.id)).toEqual(before);

      await service().post(issueOf(shipment, each(1, "10")), ACTOR);
      expect(await orders().get(order.id)).toMatchObject({ status: "open", lines: [{ fulfilled: "60.000000", status: "completed" }, { status: "open" }] });
      expect((await shipments().get(shipment.id)).status).toBe("open");

      await service().post(issueOf(shipment, each(2, "30")), ACTOR);
      expect(await orders().get(order.id)).toMatchObject({ status: "completed", lines: [{ status: "completed" }, { fulfilled: "30.000000", status: "completed" }] });
      expect((await shipments().get(shipment.id)).status).toBe("completed");
      await expect(service().post(issueOf(shipment, each(2, "1")), ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN" });
    });

    it("refuses beyond a shipment's plan whatever the stock, and beyond the order line across shipments (SAL-018, spec Q5)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const fifteen = await shipments().create({ customerOrder: order.id, plannedDate: "2026-11-03", lines: [{ orderLine: order.lines[0].id, quantity: "15", unit: "each" }] }, ACTOR);
      const all = await shipAll(order);

      await expect(service().post(issueOf(fifteen, each(1, "16")), ACTOR)).rejects.toMatchObject({ fieldErrors: { "lines.0.quantity": [ISSUE_QUANTITY_MESSAGE] } });
      await service().post(issueOf(all, each(1, "50")), ACTOR);
      // The order line has 10 left: the 15-unit shipment may issue those 10, not 11.
      expect((await shipments().get(fifteen.id)).lines[0].toIssue).toBe("10.000000");
      await expect(service().post(issueOf(fifteen, each(1, "11")), ACTOR)).rejects.toMatchObject({ fieldErrors: { "lines.0.quantity": [ISSUE_QUANTITY_MESSAGE] } });

      await service().post(issueOf(fifteen, each(1, "10")), ACTOR);
      // Nothing is left on the order, so both shipments complete, each audited once.
      expect((await shipments().list()).map(({ id, status }) => [id, status])).toEqual([
        [all.id, "completed"],
        [fifteen.id, "completed"],
      ]);
      // Both complete in one transaction, possibly in one millisecond: compare them in ID order.
      expect((await entries("shipments.shipment.completed")).sort((a, b) => a.subjectId.localeCompare(b.subjectId))).toEqual([
        { subjectId: fifteen.id, subjectLabel: `${fifteen.id} — customer order ${order.id}`, before: { status: "open" }, after: { status: "completed" } },
        { subjectId: all.id, subjectLabel: `${all.id} — customer order ${order.id}`, before: { status: "open" }, after: { status: "completed" } },
      ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)));
    });

    it("refuses an issue beyond the stock naming available and requested, writing nothing (INV-005)", async () => {
      await count("00000001", "10");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      const before = await written(order.id);

      await expect(service().post(issueOf(shipment, each(1, "11")), ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        messageParams: { material: "00000001", location: "00000001", available: "10.000000", requested: "11.000000", unit: "each" },
      });

      expect(await written(order.id)).toEqual(before);
      expect(await entries("goods-issues.goods-issue.posted")).toEqual([]);
      expect(await entries("customer-orders.customer-order.fulfilled")).toEqual([]);
    });

    it("can't issue stock that a transfer has dispatched into transit: only physical stock at the location counts (R09)", async () => {
      await count("00000001", "10");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      const transfers = new TransferService({ em: scoped() });
      const transfer = await transfers.create(
        { material: "00000001", source: "00000001", destination: "00000002", quantity: "10", unit: "each", plannedDispatch: "2026-11-01", plannedArrival: "2026-11-02" },
        ACTOR,
      );
      await new TransferService({ em: scoped() }).dispatch(transfer.id, { quantity: "10", unit: "each" }, ACTOR);

      await expect(service().post(issueOf(shipment, each(1, "1")), ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        messageParams: { available: "0.000000", requested: "1.000000" },
      });
      expect((await orders().get(order.id)).lines[0].fulfilled).toBe("0.000000");
    });

    it("lets at most one of two racing issues spend the same stock (INV-021, AUD-026)", async () => {
      await count("00000001", "10");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(
          retryingStaleSnapshot(() =>
            inRequestTransaction(em, async () => {
              await new StockService({ em }).get({ material: "00000001", location: "00000001" });
              if (!raced) {
                raced = true;
                await new GoodsIssueService({ em: scoped("prod", other) }).post(issueOf(shipment, each(1, "7")), ACTOR);
              }
              return new GoodsIssueService({ em }).post(issueOf(shipment, each(1, "7")), ACTOR);
            }),
          ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { available: "3.000000", requested: "7.000000" } });
        expect((await stock("00000001")).quantity).toBe("3.000000");
        expect(await scoped().count(GoodsIssue, {})).toBe(1);
        expect(await scoped().count(StockMovement, { type: GOODS_ISSUE_MOVEMENT })).toBe(1);
        expect((await orders().get(order.id)).lines[0].fulfilled).toBe("7.000000");
      } finally {
        await other.close();
      }
    });

    it("lets at most one of two racing issues spend the same outstanding, on two shipments, with stock to spare (INV-021, spec Q7)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const [first, second] = [await shipAll(order), await shipAll(order)];
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(
          retryingStaleSnapshot(() =>
            inRequestTransaction(em, async () => {
              await new StockService({ em }).get({ material: "00000001", location: "00000001" });
              if (!raced) {
                raced = true;
                await new GoodsIssueService({ em: scoped("prod", other) }).post(issueOf(first, each(1, "60")), ACTOR);
              }
              return new GoodsIssueService({ em }).post(issueOf(second, each(1, "60")), ACTOR);
            }),
          ),
        ).rejects.toMatchObject({ code: "SHIPMENT_NOT_OPEN" });
        expect((await stock("00000001")).quantity).toBe("40.000000");
        expect((await orders().get(order.id)).lines[0]).toMatchObject({ fulfilled: "60.000000", status: "completed" });
        expect(await scoped().count(GoodsIssue, {})).toBe(1);
      } finally {
        await other.close();
      }
    });

    it("issues in any unit the material converts, keeping what was entered (R03)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);

      const issue = await service().post(issueOf(shipment, { line: 1, quantity: "2.5", unit: "box" }), ACTOR);

      expect(issue.lines[0]).toMatchObject({ quantity: "25.000000", enteredQuantity: "2.5", enteredUnit: "box", numerator: "10", denominator: "1" });
      expect(await scoped().findOneOrFail(StockMovement, { type: GOODS_ISSUE_MOVEMENT })).toMatchObject({ quantity: "-25.000000", enteredQuantity: "-2.500000", enteredUnit: "box" });
      expect((await orders().get(order.id)).lines[0].fulfilled).toBe("25.000000");
    });

    it("refuses a line of another shipment, a line the shipment doesn't have and an unconvertible unit, collecting them all and writing nothing", async () => {
      await count("00000001", "100");
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await shipAll(order);
      const other = await shipAll(order);
      const before = await written(order.id);

      await expect(
        service().post(issueOf(shipment, each(1, "5"), { ...each(2, "5"), shipment: other.id }, each(3, "1"), { line: 2, quantity: "1", unit: "box" }), ACTOR),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: {
          "lines.1.shipment": [ISSUE_LINE_SHIPMENT_MESSAGE],
          "lines.2.line": [ISSUE_NO_SUCH_LINE_MESSAGE],
          "lines.3.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE],
        },
      });
      expect(await written(order.id)).toEqual(before);

      // Naming the issue's own shipment on a line is fine.
      expect((await service().post(issueOf(shipment, { ...each(1, "5"), shipment: shipment.id }), ACTOR)).lines).toHaveLength(1);
    });

    it("refuses a shipment this tenant doesn't have, and one whose order is no longer Open (TEN-014)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      await expect(service("test").post(issueOf(shipment, each(1, "1")), ACTOR)).rejects.toMatchObject({ code: "SHIPMENT_NOT_FOUND" });
      // A later story's Close Early ends an order without completing its shipments.
      const em = scoped();
      (await em.findOneOrFail(CustomerOrder, { code: order.id })).status = "closed-early";
      await em.flush();

      await expect(service().post(issueOf(shipment, each(1, "1")), ACTOR)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_OPEN" });
      expect((await stock("00000001")).quantity).toBe("100.000000");
    });

    it("dates the issue and its movement today and leaves the order's and shipment's dates alone (INV-010, INV-011, AUD-030)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);

      const issue = await service().post(issueOf(shipment, each(1, "5")), ACTOR);

      expect(issue.businessDate).toBe(today());
      expect((await scoped().findOneOrFail(StockMovement, { type: GOODS_ISSUE_MOVEMENT })).businessDate).toBe(today());
      expect((await orders().get(order.id)).lines[0].requiredDate).toBe("2026-11-04");
      expect((await shipments().get(shipment.id)).plannedDate).toBe("2026-11-03");
      const [entry] = await scoped().find(TenantAuditEvent, { action: "goods-issues.goods-issue.posted" });
      expect(entry.occurredAt).toBeInstanceOf(Date);
      expect(entry.after).toMatchObject({ businessDate: today() });
    });

    it("audits the issue, the order's and the shipment's quantities and each movement in the same transaction (R08)", async () => {
      await count("00000001", "100");
      await count("00000002", "100");
      const order = await orders().create(ORDER, ACTOR);
      const shipment = await shipAll(order);

      const issue = await service().post(issueOf(shipment, each(1, "50"), each(2, "10")), ACTOR);

      expect(await entries("goods-issues.goods-issue.posted")).toEqual([
        {
          subjectId: issue.id,
          subjectLabel: `${issue.id} — shipment ${shipment.id}`,
          before: null,
          after: { id: issue.id, shipment: shipment.id, customerOrder: order.id, location: "00000001", businessDate: today(), lines: "1: 00000001 50.000000 each; 2: 00000002 10.000000 each" },
        },
      ]);
      expect(await entries("customer-orders.customer-order.fulfilled")).toEqual([
        {
          subjectId: order.id,
          subjectLabel: `Customer order ${order.id}`,
          before: { status: "open", line1Fulfilled: "0.000000", line1Status: "open", line2Fulfilled: "0.000000", line2Status: "open" },
          after: { status: "open", line1Fulfilled: "50.000000", line1Status: "completed", line2Fulfilled: "10.000000", line2Status: "open" },
        },
      ]);
      expect(await entries("shipments.shipment.issued")).toEqual([
        {
          subjectId: shipment.id,
          subjectLabel: `${shipment.id} — customer order ${order.id}`,
          before: { line1Issued: "0.000000", line2Issued: "0.000000" },
          after: { line1Issued: "50.000000", line2Issued: "10.000000" },
        },
      ]);
      expect((await entries("stock.movement.posted")).filter(({ after }) => (after as { type: string }).type === GOODS_ISSUE_MOVEMENT)).toHaveLength(2);
    });

    it("advances the order's version, so an edit from a copy loaded before the issue conflicts", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);

      await service().post(issueOf(shipment, each(1, "5")), ACTOR);

      const after = await orders().get(order.id);
      expect(after.version).toBe(order.version + 1);
      const { customer, location } = order;
      const lines = order.lines.map(({ id, material, requiredDate }) => ({ id, material, quantity: "70", unit: "each", requiredDate }));
      await expect(orders().update(order.id, { customer, location, lines }, order.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });

    it("locks a delivered line's material, unit and date, the header location, and its quantity below the delivered (SAL-020, SAL-021, SAL-022)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      await service().post(issueOf(shipment, each(1, "40")), ACTOR);
      const current = await orders().get(order.id);
      const changes = (line: Partial<{ material: string; quantity: string; unit: string; requiredDate: string }>, header: Partial<{ location: string }> = {}) => ({
        customer: current.customer,
        location: header.location ?? current.location,
        lines: [{ id: current.lines[0].id, material: "00000001", quantity: "60", unit: "each", requiredDate: "2026-11-04", ...line }],
      });

      await expect(orders().update(order.id, changes({ quantity: "39" }), current.version, ACTOR)).rejects.toMatchObject({ fieldErrors: { "lines.0.quantity": expect.any(Array) } });
      for (const line of [{ material: "00000002" }, { requiredDate: "2026-11-05" }, { quantity: "6", unit: "box" }]) {
        await expect(orders().update(order.id, changes(line), current.version, ACTOR)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
      }
      await expect(orders().update(order.id, changes({}, { location: "00000002" }), current.version, ACTOR)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
      expect(await orders().get(order.id)).toEqual(current);
    });

    it("maps an issue ID taken at the same moment and a stale order to conflicts, and passes other failures on", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      const em = scoped();
      const input = issueOf(shipment, each(1, "1"));
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(new GoodsIssueService({ em }).post(input, ACTOR)).rejects.toMatchObject({ code: "ISSUE_ID_RACE", message: ISSUE_ID_RACE });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(new GoodsIssueService({ em }).post(input, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("disk full"));
      await expect(new GoodsIssueService({ em }).post(input, ACTOR)).rejects.toThrow("disk full");
    });
  });

  describe("list and get", () => {
    it("lists in pages of 100, newest first, each with its own lines (lesson 2026-10-20)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const shipment = await shipAll(order);
      const em = scoped();
      const shipmentLine = await em.findOneOrFail(ShipmentLine, { position: 0 }, { populate: ["shipment"] });
      for (let index = 1; index <= 101; index++) {
        const issue = em.create(GoodsIssue, { code: String(index).padStart(8, "0"), shipment: shipmentLine.shipment, businessDate: "2026-10-20" });
        em.create(GoodsIssueLine, { issue, position: 0, shipmentLine, quantity: `${index}.000000`, enteredQuantity: String(index), enteredUnit: "each", numerator: "1", denominator: "1" });
      }
      await em.flush();

      const first = await service().list({ shipment: shipment.id });
      expect(first).toHaveLength(100);
      expect([first[0].id, first[99].id]).toEqual(["00000101", "00000002"]);
      expect(first.every(({ id, lines }) => lines.length === 1 && lines[0].quantity === `${Number(id)}.000000`)).toBe(true);
      expect((await service().list({ page: 2 })).map(({ id }) => id)).toEqual(["00000001"]);
      expect(await service().list({ page: 3 })).toEqual([]);
    });

    it("lists the tenant's issues newest first, or one shipment's, and reads one (TEN-014)", async () => {
      await count("00000001", "100");
      const order = await orders().create(SIXTY, ACTOR);
      const first = await shipAll(order);
      const second = await shipments().create({ customerOrder: order.id, plannedDate: "2026-11-05", lines: [{ orderLine: order.lines[0].id, quantity: "5", unit: "each" }] }, ACTOR);
      await service().post(issueOf(first, each(1, "3")), ACTOR);
      await service().post(issueOf(second, each(1, "4")), ACTOR);

      expect((await service().list()).map(({ id, shipment }) => [id, shipment])).toEqual([
        ["00000002", second.id],
        ["00000001", first.id],
      ]);
      expect((await service().list({ shipment: first.id })).map(({ id }) => id)).toEqual(["00000001"]);
      expect(await service().get("00000002")).toMatchObject({ shipment: second.id, customerOrder: order.id, lines: [{ line: 1, quantity: "4.000000" }] });
      expect(await service("test").list()).toEqual([]);
      await expect(service("test").get("00000001")).rejects.toMatchObject({ code: "GOODS_ISSUE_NOT_FOUND" });
      await expect(service().list({ shipment: "00000009" })).rejects.toMatchObject({ code: "SHIPMENT_NOT_FOUND" });
    });
  });
});
