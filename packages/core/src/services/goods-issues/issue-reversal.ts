import { CustomerOrderLine, GoodsIssueLine, type EntityManager, type StockMovement } from "@cpg/db";
import { documentState } from "../../domain/document-lifecycle/lifecycle";
import { isLineFulfilled } from "../../domain/goods-issues/issue-quantity";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { recalculateReversedShipments } from "../shipments/shipment-usage";
import { assertReversalSource, inconsistentReversal, subtractReversedQuantity } from "../stock/reversal-records";

/** A goods issue's immutable source selects both counters; no client input selects an order line. */
export async function prepareIssueReversal(em: EntityManager, original: StockMovement, actor: AuditActor): Promise<() => Promise<void>> {
  const line = await em.findOne(GoodsIssueLine, { issue: original.postingId, position: original.position }, {
    populate: ["issue.shipment.order.location", "shipmentLine.shipment", "shipmentLine.orderLine.material", "shipmentLine.orderLine.order"], refresh: true,
  });
  if (!line || line.issue.shipment.id !== line.shipmentLine.shipment.id ||
    line.issue.shipment.order.id !== line.shipmentLine.orderLine.order.id) throw inconsistentReversal();
  const shipment = line.issue.shipment;
  const { order } = shipment;
  const { orderLine } = line.shipmentLine;
  assertReversalSource(original, orderLine.material.id, order.location.id, line.quantity, -1n);
  const issued = subtractReversedQuantity(line.shipmentLine.issued, line.quantity);
  const fulfilled = subtractReversedQuantity(orderLine.fulfilled, line.quantity);
  const lines = await em.find(CustomerOrderLine, { order, removed: false });
  return async () => {
    const before = { status: order.status, line: orderLine.id, lineStatus: orderLine.status, fulfilled: orderLine.fulfilled, abandoned: orderLine.abandoned };
    const shipmentBefore = { line: line.shipmentLine.position + 1, issued: line.shipmentLine.issued };
    line.shipmentLine.issued = issued;
    orderLine.fulfilled = fulfilled;
    if (orderLine.status === "open" || orderLine.status === "completed") orderLine.status = isLineFulfilled(orderLine) ? "completed" : "open";
    order.status = documentState(lines.map(({ status }) => status));
    order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
    recordTenantAudit(em, actor, {
      action: "customer-orders.customer-order.issue-reversed",
      subject: { type: "CustomerOrder", id: order.code, label: `Customer order ${order.code}` },
      before,
      after: { status: order.status, line: orderLine.id, lineStatus: orderLine.status, fulfilled, abandoned: orderLine.abandoned, issue: line.issue.code, movement: original.id },
    });
    recordTenantAudit(em, actor, {
      action: "shipments.shipment.issue-reversed",
      subject: { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${order.code}` },
      before: shipmentBefore, after: { line: line.shipmentLine.position + 1, issued, issue: line.issue.code, movement: original.id },
    });
    await recalculateReversedShipments(em, order, actor);
  };
}
