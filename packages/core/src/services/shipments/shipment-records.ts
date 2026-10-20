import { Shipment, type EntityManager } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";

/*
 * What the shipment service and the goods-issue service (which issues against shipments) both need:
 * finding one, and refusing a Completed one. A leaf module, so neither service imports the other.
 */

/** The shipment with business ID `code` in `em`'s tenant, with its order's customer and location, or `SHIPMENT_NOT_FOUND` (TEN-014). */
export async function findShipment(em: EntityManager, code: string, options: { refresh?: boolean } = {}): Promise<Shipment> {
  const shipment = await em.findOne(Shipment, { code }, { ...options, populate: ["order", "order.customer", "order.location"] });
  if (!shipment) throw new NotFoundError("SHIPMENT_NOT_FOUND", `There is no shipment ${code} in this tenant.`);
  return shipment;
}

/** `items` grouped by `key`, each group in the items' order: one pass, however many headers a page has. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/** Refuses an issue against a Completed shipment: nothing is left to issue on it (shipments spec Q8). */
export function assertShipmentOpen(shipment: Shipment): void {
  if (shipment.status !== "open") {
    throw new ConflictError(`Shipment ${shipment.code} is ${shipment.status}, so nothing more is issued against it.`, "SHIPMENT_NOT_OPEN");
  }
}
