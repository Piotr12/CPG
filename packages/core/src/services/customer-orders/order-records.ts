import { CustomerOrder, type EntityManager } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";

/*
 * What the customer-order, shipment and goods-issue services all need: finding an order and refusing
 * one that is no longer Open. A leaf module, so none of them imports another's service.
 */

/** The order with business ID `code` in `em`'s tenant, with its customer and location, or `CUSTOMER_ORDER_NOT_FOUND` (TEN-014). */
export async function findCustomerOrder(em: EntityManager, code: string, options: { refresh?: boolean } = {}): Promise<CustomerOrder> {
  const order = await em.findOne(CustomerOrder, { code }, { ...options, populate: ["customer", "location"] });
  if (!order) throw new NotFoundError("CUSTOMER_ORDER_NOT_FOUND", `There is no customer order ${code} in this tenant.`);
  return order;
}

/** Refuses a shipment or an issue against an order that is no longer Open: nothing more leaves against it (shipments spec Q3). */
export function assertCustomerOrderOpen(order: CustomerOrder): void {
  if (order.status !== "open") {
    throw new ConflictError(`Customer order ${order.code} is ${order.status}, so nothing more ships against it.`, "CUSTOMER_ORDER_NOT_OPEN");
  }
}
