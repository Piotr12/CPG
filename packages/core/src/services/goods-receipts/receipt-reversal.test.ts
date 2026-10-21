import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initOrm, migrate, selectTenant, GoodsReceipt, GoodsReceiptLine, Location, Material, MaterialConversion, PurchaseOrder, PurchaseOrderLine, StockMovement, StockReversal, Supplier, TenantAuditEvent, type Orm } from "@cpg/db";
import { PurchaseOrderService } from "../purchase-orders/purchase-order.service";
import { StockService } from "../stock/stock.service";
import { StockReversalService } from "../stock/stock-reversal.service";
import * as audit from "../audit/audit-recorder";
import { GoodsReceiptService } from "./goods-receipt.service";
import { prepareReceiptReversal } from "./receipt-reversal";
const actor = { userId: "u", username: "Alice", sessionId: "s", channel: "ui" as const, token: null };
let orm: Orm; let directory: string;
const scope = () => { const em = orm.em.fork(); selectTenant(em, "prod"); return em; };
const orders = () => new PurchaseOrderService({ em: scope() });
const receipts = () => new GoodsReceiptService({ em: scope() });
const reverse = (id: string) => new StockReversalService({ em: scope() }).reverse(id, { reason: "Wrong receipt" }, actor);
const orderInput = { supplier: "00000001", location: "00000001", lines: [{ material: "00000001", quantity: "10", unit: "each", plannedDate: "2026-11-01" }] };
const movement = async (code: string, position = 0) => {
  const receipt = await scope().findOneOrFail(GoodsReceipt, { code });
  return scope().findOneOrFail(StockMovement, { postingId: receipt.id, position }, { populate: ["material", "location"] });
};
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-receipt-reversal-"));
  const databasePath = path.join(directory, "db.sqlite"); await migrate({ databasePath }); orm = await initOrm({ databasePath });
  const em = scope();
  const material = em.create(Material, { code: "00000001", type: "raw", description: "Bolts", baseUnit: "each" });
  em.create(MaterialConversion, { material, unit: "box", numerator: "1", denominator: "3" });
  em.create(Location, { code: "00000001", name: "Plant" }); em.create(Supplier, { code: "00000001", name: "Supplier" }); await em.flush();
});
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await orm.close(); rmSync(directory, { recursive: true }); });
it("reopens only the received line, advances the version and preserves immutable receipt records", async () => {
  const order = await orders().create({ ...orderInput, lines: [...orderInput.lines, ...orderInput.lines] }, actor);
  const receipt = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "10", unit: "each" }, { line: 2, quantity: "10", unit: "each" }] }, actor);
  const completed = await orders().get(order.id); expect(completed.status).toBe("completed");
  const original = await movement(receipt.id); const reversed = await reverse(original.id);
  expect(await new StockService({ em: scope() }).getMovement(reversed.movement.id)).toMatchObject({ source: { id: receipt.id, document: { type: "purchase-order", id: order.id } }, reverses: original.id });
  const result = await orders().get(order.id);
  expect(result).toMatchObject({ status: "open", lines: [{ received: "0.000000" }, { received: "10.000000" }] });
  expect(result.version).toBeGreaterThan(completed.version);
  expect(await receipts().get(receipt.id)).toMatchObject({ id: receipt.id, lines: receipt.lines.map((line) => ({ ...line, reversedBy: line.line === 1 ? expect.any(String) : null })) });
  expect(await scope().findOneOrFail(TenantAuditEvent, { action: "purchase-orders.purchase-order.receipt-reversed" })).toMatchObject({ before: { status: "completed", received: "10.000000" }, after: { status: "open", received: "0.000000", movement: original.id } });
});
it("can leave an over-received order completed and advances its timestamp even within the same millisecond", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-21T10:00:00Z"), toFake: ["Date"] });
  const order = await orders().create(orderInput, actor);
  const first = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "5", unit: "each" }] }, actor);
  await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "15", unit: "each" }] }, actor);
  const before = await orders().get(order.id);
  await reverse((await movement(first.id)).id);
  expect(await orders().get(order.id)).toMatchObject({ status: "completed", version: before.version + 1, lines: [{ received: "15.000000" }] });
});
it("keeps explicit closure and reverses captured rounded quantity after conversion removal", async () => {
  const order = await orders().create(orderInput, actor);
  const receipt = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "2", unit: "box" }] }, actor);
  await scope().nativeUpdate(PurchaseOrder, { code: order.id }, { status: "closed" });
  await scope().nativeDelete(MaterialConversion, {});
  expect(await reverse((await movement(receipt.id)).id)).toMatchObject({ movement: { quantity: "-0.666667" } });
  expect(await orders().get(order.id)).toMatchObject({ status: "closed", lines: [{ received: "0.000000" }] });
});
it("refuses insufficient stock with no receipt, progress or audit mutation", async () => {
  const order = await orders().create(orderInput, actor);
  const receipt = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "5", unit: "each" }] }, actor);
  await new StockService({ em: scope() }).correct({ material: "00000001", location: "00000001", quantity: "-3", unit: "each", reason: "Used" }, actor);
  const before = await orders().get(order.id); const audits = await scope().count(TenantAuditEvent, {});
  await expect(reverse((await movement(receipt.id)).id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(await orders().get(order.id)).toEqual(before); expect(await scope().count(TenantAuditEvent, {})).toBe(audits);
  expect(await scope().count(StockReversal, {})).toBe(0);
});
it("rolls stock, link, order progress and audit back when the owning document audit fails", async () => {
  const order = await orders().create(orderInput, actor);
  const receipt = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "10", unit: "each" }] }, actor);
  const before = await orders().get(order.id); const record = audit.recordTenantAudit;
  vi.spyOn(audit, "recordTenantAudit").mockImplementation((em, who, event) => {
    if (event.action === "purchase-orders.purchase-order.receipt-reversed") throw new Error("Audit unavailable");
    return record(em, who, event);
  });
  await expect(reverse((await movement(receipt.id)).id)).rejects.toThrow("Audit unavailable");
  expect(await orders().get(order.id)).toEqual(before); expect(await scope().count(StockMovement, {})).toBe(1);
  expect(await scope().count(StockReversal, {})).toBe(0);
});
it("refuses missing sources, mismatched source ownership and impossible received counters", async () => {
  const order = await orders().create(orderInput, actor);
  const receipt = await receipts().post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "5", unit: "each" }] }, actor);
  const original = await movement(receipt.id);
  await expect(prepareReceiptReversal(scope(), { ...original, postingId: randomUUID() }, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  const second = await orders().create(orderInput, actor); const em = scope();
  const otherOrder = await em.findOneOrFail(PurchaseOrder, { code: second.id });
  const source = em.create(GoodsReceipt, { code: "00000002", order: otherOrder, businessDate: "2026-10-21" });
  const wrongLine = await em.findOneOrFail(PurchaseOrderLine, { order: { code: order.id } });
  em.create(GoodsReceiptLine, { receipt: source, orderLine: wrongLine, position: 0, quantity: "5.000000", enteredQuantity: "5", enteredUnit: "each", numerator: "1", denominator: "1" }); await em.flush();
  await expect(prepareReceiptReversal(scope(), { ...original, postingId: source.id }, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  await scope().nativeUpdate(PurchaseOrderLine, { id: wrongLine.id }, { received: "1.000000" });
  await expect(reverse(original.id)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
  expect(await scope().count(StockMovement, {})).toBe(1);
});
it("reads legacy receipt lines without inventing a reversible movement when their source movement is missing", async () => {
  const created = await orders().create(orderInput, actor); const em = scope();
  const order = await em.findOneOrFail(PurchaseOrder, { code: created.id });
  const orderLine = await em.findOneOrFail(PurchaseOrderLine, { order });
  const receipt = em.create(GoodsReceipt, { code: "00000001", order, businessDate: "2026-10-21" });
  em.create(GoodsReceiptLine, { receipt, orderLine, position: 0, quantity: "5.000000", enteredQuantity: "5", enteredUnit: "each", numerator: "1", denominator: "1" }); await em.flush();
  expect(await receipts().get(receipt.code)).toMatchObject({ lines: [{ movementId: null, reversedBy: null, quantity: "5.000000" }] });
});
