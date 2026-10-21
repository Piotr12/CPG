import { GoodsIssueLine, type CustomerOrderLine, type EntityManager } from "@cpg/db";

/**
 * Net fulfilment can return to zero; immutable issue lines still lock the original order identity.
 * Bound both IN lists and results. Remove matched IDs after each batch so repeated issues for one
 * line cannot force a scan of its entire history, and never query separately for every order line.
 */
export async function postedOrderLineIds(em: EntityManager, lines: readonly CustomerOrderLine[]): Promise<Set<string>> {
  const posted = new Set<string>();
  for (let start = 0; start < lines.length; start += 100) {
    const remaining = new Set(lines.slice(start, start + 100).map(({ id }) => id));
    while (remaining.size > 0) {
      const issues = await em.find(GoodsIssueLine, { shipmentLine: { orderLine: { $in: [...remaining] } } }, {
        populate: ["shipmentLine"], fields: ["shipmentLine.orderLine"], limit: 100, disableIdentityMap: true,
      });
      if (issues.length === 0) break;
      for (const issue of issues) {
        const id = issue.shipmentLine.orderLine.id;
        posted.add(id);
        remaining.delete(id);
      }
    }
  }
  return posted;
}
