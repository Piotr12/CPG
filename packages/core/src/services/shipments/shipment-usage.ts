import { Shipment, ShipmentLine, type CustomerOrder, type CustomerOrderLine, type EntityManager } from "@cpg/db";
import { isNothing, outstandingOf, toIssueOf } from "../../domain/goods-issues/issue-quantity";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";

/*
 * What a customer order's writers need to know about its shipments. A leaf module, so the order and
 * goods-issue services never import the shipment service.
 */

/**
 * The IDs of those of `lines` that a shipment names (shipments spec Q10): such a line keeps its
 * material and stays on its order, so a planned dispatch always means what it was planned for.
 * `lines` are an order's visible lines, never none.
 */
export async function shippedOrderLineIds(em: EntityManager, lines: readonly CustomerOrderLine[]): Promise<Set<string>> {
  const shipped = await em.find(ShipmentLine, { orderLine: { $in: [...lines] } });
  return new Set(shipped.map(({ orderLine }) => orderLine.id));
}

/**
 * Completes, and audits, every Open shipment of `order` that has nothing left to issue (spec Q8): after
 * a goods issue, or an order edit that left its lines nothing outstanding. Reads the order lines through
 * `em`'s identity map, so the caller's unflushed changes count. Shipments never reopen.
 */
export async function completeFinishedShipments(em: EntityManager, order: CustomerOrder, actor: AuditActor): Promise<void> {
  const open = await em.find(Shipment, { order, status: "open" }, { refresh: true });
  if (open.length === 0) return;
  const lines = await em.find(ShipmentLine, { shipment: { $in: open } }, { populate: ["orderLine"] });
  for (const shipment of open) {
    const finished = lines
      .filter((line) => line.shipment.id === shipment.id)
      .every(({ quantity, issued, orderLine }) => isNothing(toIssueOf(quantity, issued, outstandingOf(orderLine))));
    if (!finished) continue;
    shipment.status = "completed";
    recordTenantAudit(em, actor, {
      action: "shipments.shipment.completed",
      subject: { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${order.code}` },
      before: { status: "open" },
      after: { status: shipment.status },
    });
  }
}
