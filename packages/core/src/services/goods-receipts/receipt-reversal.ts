import { GoodsReceiptLine, PurchaseOrderLine, type EntityManager, type StockMovement } from "@cpg/db";
import { documentState } from "../../domain/document-lifecycle/lifecycle";
import { orderLineState } from "../purchase-orders/order-records";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { assertReversalSource, inconsistentReversal, subtractReversedQuantity } from "../stock/reversal-records";

/** Resolve and check the historical receipt first; apply progress only after its inverse can post. */
export async function prepareReceiptReversal(em: EntityManager, original: StockMovement, actor: AuditActor): Promise<() => Promise<void>> {
  const line = await em.findOne(GoodsReceiptLine, { receipt: original.postingId, position: original.position }, {
    populate: ["receipt.order.supplier", "receipt.order.location", "orderLine.material", "orderLine.order"], refresh: true,
  });
  if (!line || line.receipt.order.id !== line.orderLine.order.id) throw inconsistentReversal();
  const { order } = line.receipt;
  assertReversalSource(original, line.orderLine.material.id, order.location.id, line.quantity, 1n);
  const received = subtractReversedQuantity(line.orderLine.received, line.quantity);
  const lines = await em.find(PurchaseOrderLine, { order });
  return async () => {
    const before = { status: order.status, line: line.orderLine.position, received: line.orderLine.received };
    line.orderLine.received = received;
    for (const current of lines) current.status = orderLineState(current);
    order.status = documentState(lines.map(({ status }) => status));
    order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
    recordTenantAudit(em, actor, {
      action: "purchase-orders.purchase-order.receipt-reversed",
      subject: { type: "PurchaseOrder", id: order.code, label: `${order.code} — ${order.supplier.code} ${order.supplier.name}` },
      before,
      after: { status: order.status, line: line.orderLine.position, received, receipt: line.receipt.code, movement: original.id },
    });
  };
}
