import { GoodsIssueLine, Shipment, type EntityManager, type ShipmentLine } from "@cpg/db";
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

/**
 * The IDs of `lines` that any goods issue has ever named (shipment edit spec Q6, Q9): a reversal
 * returns `issued` to zero but never erases the issue (#91). Bounded like `postedOrderLineIds`: 100
 * IDs to a query, at most 100 issue lines read at a time, and a found ID leaves the batch at once.
 */
export async function postedShipmentLineIds(em: EntityManager, lines: readonly ShipmentLine[]): Promise<Set<string>> {
  const posted = new Set<string>();
  for (let start = 0; start < lines.length; start += 100) {
    const remaining = new Set(lines.slice(start, start + 100).map(({ id }) => id));
    while (remaining.size > 0) {
      const issues = await em.find(GoodsIssueLine, { shipmentLine: { $in: [...remaining] } }, { fields: ["shipmentLine"], limit: 100, disableIdentityMap: true });
      if (issues.length === 0) break;
      for (const { shipmentLine } of issues) {
        posted.add(shipmentLine.id);
        remaining.delete(shipmentLine.id);
      }
    }
  }
  return posted;
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

/** What `SHIPMENT_NOT_OPEN` says each refused action can't do; screens translate the code. */
const NOT_OPEN_CONSEQUENCE = { issue: "nothing more is issued against it", change: "it can't be changed", cancel: "it can't be cancelled" } as const;

/**
 * Refuses `action` on a shipment that isn't Open: an issue against a Completed or Cancelled one has
 * nothing left to issue (shipments spec Q8), and neither can be edited or cancelled (shipment edit spec).
 */
export function assertShipmentOpen(shipment: Shipment, action: keyof typeof NOT_OPEN_CONSEQUENCE = "issue"): void {
  if (shipment.status !== "open") {
    throw new ConflictError(`Shipment ${shipment.code} is ${shipment.status}, so ${NOT_OPEN_CONSEQUENCE[action]}.`, "SHIPMENT_NOT_OPEN");
  }
}
