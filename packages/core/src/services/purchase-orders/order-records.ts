import { PurchaseOrder, type PurchaseOrderLine, type EntityManager } from "@cpg/db";
import { isLineReceived } from "../../domain/goods-receipts/receipt-quantity";
import { ConflictError, NotFoundError } from "../../http/errors";

/*
 * What the purchase-order service and the goods-receipt service (which receives against orders) both
 * need: finding one, and refusing a Completed one. A leaf module, so neither service imports the other.
 */

/** The order with business ID `id` in `em`'s tenant, with its supplier and location, or `PURCHASE_ORDER_NOT_FOUND` (TEN-014). */
export async function findOrder(em: EntityManager, id: string, options: { refresh?: boolean } = {}): Promise<PurchaseOrder> {
  const order = await em.findOne(PurchaseOrder, { code: id }, { ...options, populate: ["supplier", "location"] });
  if (!order) throw new NotFoundError("PURCHASE_ORDER_NOT_FOUND", `There is no purchase order ${id} in this tenant.`);
  return order;
}

/** Refuses a change to an order that is no longer Open: a Completed order takes no receipt and no edit (LFC-008, spec Q3, Q8). */
export function assertOrderOpen(order: PurchaseOrder): void {
  if (order.status !== "open") {
    throw new ConflictError(`Purchase order ${order.code} is ${order.status}, so it can't change.`, "PURCHASE_ORDER_NOT_OPEN");
  }
}

/** Old containers can still advance received after migration during deployment overlap. */
export function orderLineState(line: Pick<PurchaseOrderLine, "status" | "quantity" | "received">): PurchaseOrderLine["status"] {
  if (line.status === "cancelled" || line.status === "closed-early") return line.status;
  return isLineReceived(line.quantity, line.received) ? "completed" : "open";
}
