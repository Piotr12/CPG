import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initOrm, migrate, selectTenant, Customer, CustomerOrder, CustomerOrderLine, GoodsIssue, GoodsIssueLine, Location, Material, Shipment, ShipmentLine, StockMovement, StockReversal, TenantAuditEvent, type Orm } from "@cpg/db";
import { CustomerOrderService, type CustomerOrderView } from "../customer-orders/customer-order.service";
import { ShipmentService } from "../shipments/shipment.service";
import { StockService } from "../stock/stock.service";
import { StockReversalService } from "../stock/stock-reversal.service";
import * as audit from "../audit/audit-recorder";
import { GoodsIssueService } from "./goods-issue.service";
import { prepareIssueReversal } from "./issue-reversal";
const actor = { userId: "u", username: "Alice", sessionId: "s", channel: "ui" as const, token: null };
let orm: Orm; let directory: string;
const scope = () => { const em = orm.em.fork(); selectTenant(em, "prod"); return em; };
const orders = () => new CustomerOrderService({ em: scope() });
const shipments = () => new ShipmentService({ em: scope() });
const issues = () => new GoodsIssueService({ em: scope() });
const reverse = (id: string) => new StockReversalService({ em: scope() }).reverse(id, { reason: "Wrong issue" }, actor);
const orderInput = { customer: "00000001", location: "00000001", lines: [{ material: "00000001", quantity: "10", unit: "each", requiredDate: "2026-11-01" }] };
const ship = (order: CustomerOrderView) => shipments().create({ customerOrder: order.id, plannedDate: "2026-11-01", lines: order.lines.map((line) => ({ orderLine: line.id, quantity: line.quantity, unit: "each" })) }, actor);
const movement = async (code: string, position = 0) => {
  const issue = await scope().findOneOrFail(GoodsIssue, { code });
  return scope().findOneOrFail(StockMovement, { postingId: issue.id, position }, { populate: ["material", "location"] });
};
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-issue-reversal-"));
  const databasePath = path.join(directory, "db.sqlite"); await migrate({ databasePath }); orm = await initOrm({ databasePath });
  const em = scope();
  em.create(Material, { code: "00000001", type: "raw", description: "Bolts", baseUnit: "each" });
  em.create(Location, { code: "00000001", name: "Plant" }); em.create(Customer, { code: "00000001", name: "Customer" }); await em.flush();
  await new StockService({ em: scope() }).correct({ material: "00000001", location: "00000001", quantity: "100", unit: "each", reason: "Opening" }, actor);
});
afterEach(async () => { vi.restoreAllMocks(); await orm.close(); rmSync(directory, { recursive: true }); });
it("reverses one full line and reopens its order, own shipment and auto-completed siblings across batches", async () => {
  const order = await orders().create({ ...orderInput, lines: [...orderInput.lines, ...orderInput.lines] }, actor);
  const shipment = await ship(order); const em = scope();
  const storedOrder = await em.findOneOrFail(CustomerOrder, { code: order.id });
  const orderLine = await em.findOneOrFail(CustomerOrderLine, order.lines[0].id);
  for (let index = 2; index <= 301; index++) {
    const sibling = em.create(Shipment, { code: String(index).padStart(8, "0"), order: storedOrder, plannedDate: "2026-11-01" });
    em.create(ShipmentLine, { shipment: sibling, orderLine, position: 0, quantity: "10.000000", enteredQuantity: "10", enteredUnit: "each", numerator: "1", denominator: "1" });
  }
  await em.flush();
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }, { line: 2, quantity: "10", unit: "each" }] }, actor);
  const before = await orders().get(order.id);
  expect(await scope().count(Shipment, { status: "completed" })).toBe(301);
  const retained: number[] = []; const record = audit.recordTenantAudit;
  vi.spyOn(audit, "recordTenantAudit").mockImplementation((tx, who, event) => {
    if (event.action === "shipments.shipment.recalculated") retained.push(tx.getUnitOfWork().getIdentityMap().values().length);
    return record(tx, who, event);
  });
  await reverse((await movement(issue.id)).id);
  // Four pages retain only their current shipments, lines and shared references, never earlier pages.
  expect(retained).toHaveLength(301);
  expect(Math.max(...retained)).toBeLessThan(310);
  expect(await orders().get(order.id)).toMatchObject({ status: "open", version: before.version + 1, lines: [{ fulfilled: "0.000000", status: "open", posted: true }, { fulfilled: "10.000000", status: "completed", posted: true }] });
  expect(await shipments().get(shipment.id)).toMatchObject({ status: "open", lines: [{ issued: "0.000000", toIssue: "10.000000" }, { issued: "10.000000", toIssue: "0.000000" }] });
  expect(await scope().count(Shipment, { status: "open" })).toBe(301);
  expect(await scope().count(TenantAuditEvent, { action: "shipments.shipment.recalculated" })).toBe(301);
  expect(await issues().get(issue.id)).toEqual({ ...issue, lines: issue.lines.map((line) => ({ ...line, reversedBy: line.line === 1 ? expect.any(String) : null })) });
  expect(await new StockService({ em: scope() }).get({ material: "00000001", location: "00000001" })).toMatchObject({ quantity: "90.000000" });
});
it("keeps a partial order open, leaves unaffected sibling quantities and statuses alone, and retains historical edit locks at zero", async () => {
  const order = await orders().create(orderInput, actor); const shipment = await ship(order); await ship(order);
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "each" }] }, actor);
  await reverse((await movement(issue.id)).id);
  const current = await orders().get(order.id);
  expect(current).toMatchObject({ status: "open", lines: [{ fulfilled: "0.000000", posted: true }] });
  expect(await scope().count(TenantAuditEvent, { action: "shipments.shipment.recalculated" })).toBe(0);
  const changes = { ...orderInput, lines: [{ ...orderInput.lines[0], id: order.lines[0].id }] };
  for (const edit of [{ ...changes, customer: "00000002" }, { ...changes, location: "00000002" }, { ...changes, lines: [{ ...changes.lines[0], requiredDate: "2026-11-02" }] }]) {
    await expect(orders().update(order.id, edit, current.version, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
  }
  await expect(orders().update(order.id, changes, order.version, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(await orders().update(order.id, { ...changes, lines: [{ ...changes.lines[0], quantity: "12" }] }, current.version, actor)).toMatchObject({ lines: [{ quantity: "12.000000", posted: true }] });
});
it("preserves explicit closure and abandoned quantity", async () => {
  const order = await orders().create(orderInput, actor); const shipment = await ship(order);
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "each" }] }, actor);
  await scope().nativeUpdate(CustomerOrder, { code: order.id }, { status: "closed-early" });
  await scope().nativeUpdate(CustomerOrderLine, { id: order.lines[0].id }, { status: "closed-early", abandoned: "6.000000" });
  await reverse((await movement(issue.id)).id);
  expect(await orders().get(order.id)).toMatchObject({ status: "closed-early", lines: [{ fulfilled: "0.000000", abandoned: "6.000000", status: "closed-early" }] });
  expect(await shipments().get(shipment.id)).toMatchObject({ status: "open", lines: [{ issued: "0.000000" }] });
});
it("rolls back counters, stock, links and earlier flushed batches after a later document audit failure", async () => {
  const order = await orders().create(orderInput, actor); const shipment = await ship(order);
  const em = scope();
  const storedOrder = await em.findOneOrFail(CustomerOrder, { code: order.id });
  const orderLine = await em.findOneOrFail(CustomerOrderLine, order.lines[0].id);
  for (let index = 2; index <= 102; index++) {
    const sibling = em.create(Shipment, { code: String(index).padStart(8, "0"), order: storedOrder, plannedDate: "2026-11-01" });
    em.create(ShipmentLine, { shipment: sibling, orderLine, position: 0, quantity: "10.000000", enteredQuantity: "10", enteredUnit: "each", numerator: "1", denominator: "1" });
  }
  await em.flush();
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }] }, actor);
  const before = await orders().get(order.id); const beforeShipment = await shipments().get(shipment.id); const record = audit.recordTenantAudit;
  vi.spyOn(audit, "recordTenantAudit").mockImplementation((em, who, event) => {
    if (event.action === "shipments.shipment.recalculated" && event.subject.id === "00000101") throw new Error("Audit unavailable");
    return record(em, who, event);
  });
  await expect(reverse((await movement(issue.id)).id)).rejects.toThrow("Audit unavailable");
  expect(await orders().get(order.id)).toEqual(before); expect(await shipments().get(shipment.id)).toEqual(beforeShipment);
  expect(await scope().count(Shipment, { status: "completed" })).toBe(102);
  expect(await scope().count(TenantAuditEvent, { action: "shipments.shipment.recalculated" })).toBe(0);
  expect(await scope().count(StockReversal, {})).toBe(0); expect(await scope().count(StockMovement, {})).toBe(2);
  expect(await scope().count(TenantAuditEvent, { action: "customer-orders.customer-order.issue-reversed" })).toBe(0);
});
it("refuses missing issue lines, unrelated shipments, unrelated orders and impossible counters before posting", async () => {
  const order = await orders().create(orderInput, actor); const shipment = await ship(order);
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "each" }] }, actor);
  const original = await movement(issue.id);
  await expect(prepareIssueReversal(scope(), { ...original, postingId: randomUUID() }, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  const sibling = await shipments().create({ customerOrder: order.id, plannedDate: "2026-11-01", lines: [{ orderLine: order.lines[0].id, quantity: "6", unit: "each" }] }, actor); const em = scope();
  const otherShipment = await em.findOneOrFail(Shipment, { code: sibling.id });
  const wrongLine = await em.findOneOrFail(ShipmentLine, { shipment: { code: shipment.id } });
  const source = em.create(GoodsIssue, { code: "00000002", shipment: otherShipment, businessDate: "2026-10-21" });
  em.create(GoodsIssueLine, { issue: source, shipmentLine: wrongLine, position: 0, quantity: "4.000000", enteredQuantity: "4", enteredUnit: "each", numerator: "1", denominator: "1" }); await em.flush();
  await expect(prepareIssueReversal(scope(), { ...original, postingId: source.id }, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  const second = await orders().create(orderInput, actor);
  const em2 = scope(); const corrupt = await em2.findOneOrFail(ShipmentLine, wrongLine.id);
  corrupt.orderLine = await em2.findOneOrFail(CustomerOrderLine, second.lines[0].id); await em2.flush();
  await expect(reverse(original.id)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  const em3 = scope(); const restore = await em3.findOneOrFail(ShipmentLine, wrongLine.id);
  restore.orderLine = await em3.findOneOrFail(CustomerOrderLine, order.lines[0].id); restore.issued = "0.000000"; await em3.flush();
  await expect(reverse(original.id)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  expect(await scope().count(StockMovement, {})).toBe(2);
});
it("keeps a still-fulfilled historical aggregate completed and completes a sibling with no remaining plan", async () => {
  const order = await orders().create(orderInput, actor); const shipment = await ship(order);
  const issue = await issues().post({ shipment: shipment.id, lines: [{ line: 1, quantity: "5", unit: "each" }] }, actor);
  // Legacy over-fulfilment: source identity is immutable, and the remaining totals still cover demand.
  await scope().nativeUpdate(CustomerOrderLine, { id: order.lines[0].id }, { fulfilled: "20.000000", status: "completed" });
  await scope().nativeUpdate(ShipmentLine, { shipment: { code: shipment.id } }, { issued: "20.000000" });
  await reverse((await movement(issue.id)).id);
  expect(await orders().get(order.id)).toMatchObject({ status: "completed", lines: [{ fulfilled: "15.000000", status: "completed" }] });
  expect(await shipments().get(shipment.id)).toMatchObject({ status: "completed", lines: [{ issued: "15.000000", toIssue: "0.000000" }] });
});
