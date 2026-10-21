import { Shipment, ShipmentLine, type CustomerOrder, type CustomerOrderLine, type EntityManager } from "@cpg/db";
import { isNothing, outstandingOf, toIssueOf } from "../../domain/goods-issues/issue-quantity";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { PostingContext } from "../stock/stock-posting";

/*
 * What a customer order's writers need to know about its shipments. A leaf module, so the order and
 * goods-issue services never import the shipment service.
 */

/**
 * Whether a shipment names any of `lines` (shipments spec Q10): such a line keeps its material and
 * stays on its order, so a planned dispatch always means what it was planned for. One count, loading
 * nothing, and no query at all when an edit removes or replaces no line.
 */
export async function isAnyShipped(em: EntityManager, lines: readonly CustomerOrderLine[]): Promise<boolean> {
  return lines.length > 0 && (await em.count(ShipmentLine, { orderLine: { $in: [...lines] } })) > 0;
}

/**
 * Completes, and audits, every Open shipment of `order` that has nothing left to issue (spec Q8): after
 * a goods issue, or an order edit that left its lines nothing outstanding. Reads the order lines through
 * `em`'s identity map, so the caller's unflushed changes count. Ordinary postings never reopen shipments.
 * The demo seed completes them too, unaudited.
 */
export async function completeFinishedShipments(em: EntityManager, order: CustomerOrder, context: PostingContext): Promise<void> {
  const open = await em.find(Shipment, { order, status: "open" }, { refresh: true });
  if (open.length === 0) return;
  const lines = await em.find(ShipmentLine, { shipment: { $in: open } }, { populate: ["orderLine"] });
  for (const shipment of open) {
    const finished = lines
      .filter((line) => line.shipment.id === shipment.id)
      .every(({ quantity, issued, orderLine }) => isNothing(toIssueOf(quantity, issued, outstandingOf(orderLine))));
    if (!finished) continue;
    shipment.status = "completed";
    if (context.kind === "user") recordTenantAudit(em, context.actor, {
      action: "shipments.shipment.completed",
      subject: { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${order.code}` },
      before: { status: "open" },
      after: { status: shipment.status },
    });
  }
}

/** Reversal can restore demand to every sibling, including a shipment auto-completed by another's issue. */
export async function recalculateReversedShipments(em: EntityManager, order: CustomerOrder, actor: AuditActor): Promise<void> {
  const { id: orderId, code: orderCode } = order;
  // Everything the caller changed must be persisted before releasing its managed entities. The
  // transaction stays open: later failures still roll back the counters, stock, links and every batch.
  await em.flush();
  em.clear();
  let cursor = "";
  while (true) {
    const shipments = await em.find(Shipment, { order: orderId, status: { $in: ["open", "completed"] }, code: { $gt: cursor } }, { orderBy: { code: "asc" }, limit: 100 });
    if (shipments.length === 0) return;
    const lines = await em.find(ShipmentLine, { shipment: { $in: shipments } }, { populate: ["orderLine"] });
    for (const shipment of shipments) {
      const finished = lines.filter((line) => line.shipment.id === shipment.id)
        .every(({ quantity, issued, orderLine }) => isNothing(toIssueOf(quantity, issued, outstandingOf(orderLine))));
      const status = finished ? "completed" : "open";
      if (shipment.status === status) continue;
      const before = { status: shipment.status };
      shipment.status = status;
      recordTenantAudit(em, actor, {
        action: "shipments.shipment.recalculated",
        subject: { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${orderCode}` },
        before, after: { status },
      });
    }
    await em.flush();
    cursor = shipments[shipments.length - 1].code;
    em.clear();
  }
}
