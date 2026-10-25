import { ShipmentLine, type CustomerOrderLine, type EntityManager } from "@cpg/db";
import { postedShipmentLineIds } from "../shipments/shipment-records";
import { REFERENCE_BATCH } from "../stock/posted-references";

/**
 * Net fulfilment can return to zero; immutable issue lines still lock the original order identity.
 * Two single-table reads, each from its `(tenant, column)` index: the batch's shipment lines, then
 * which of those a goods issue names. As one join, SQLite would start from every goods issue line of
 * the tenant (#257). The shipment lines come in keyset batches, never cut by a `limit`, so many
 * unissued shipment lines can't hide an issued one; an order line found issued leaves the batch.
 */
export async function postedOrderLineIds(em: EntityManager, lines: readonly CustomerOrderLine[]): Promise<Set<string>> {
  const posted = new Set<string>();
  for (let start = 0; start < lines.length; start += REFERENCE_BATCH) {
    const remaining = new Set(lines.slice(start, start + REFERENCE_BATCH).map(({ id }) => id));
    let after: string | undefined;
    while (remaining.size > 0) {
      const batch = await em.find(
        ShipmentLine,
        { orderLine: { $in: [...remaining] }, ...(after !== undefined && { id: { $gt: after } }) },
        { fields: ["orderLine"], orderBy: { id: "asc" }, limit: REFERENCE_BATCH, disableIdentityMap: true },
      );
      const issued = await postedShipmentLineIds(em, batch);
      for (const { id, orderLine } of batch) {
        if (!issued.has(id)) continue;
        posted.add(orderLine.id);
        remaining.delete(orderLine.id);
      }
      if (batch.length < REFERENCE_BATCH) break;
      after = batch.at(-1)!.id;
    }
  }
  return posted;
}
