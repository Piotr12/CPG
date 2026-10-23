import { GoodsIssueLine, type CustomerOrderLine, type EntityManager } from "@cpg/db";
import { postedReferences } from "../stock/posted-references";

/** Net fulfilment can return to zero; immutable issue lines still lock the original order identity. */
export function postedOrderLineIds(em: EntityManager, lines: readonly CustomerOrderLine[]): Promise<Set<string>> {
  return postedReferences(lines.map(({ id }) => id), async (batch, limit) => {
    const issues = await em.find(GoodsIssueLine, { shipmentLine: { orderLine: { $in: batch } } }, {
      populate: ["shipmentLine"], fields: ["shipmentLine.orderLine"], limit, disableIdentityMap: true,
    });
    return issues.map((issue) => issue.shipmentLine.orderLine.id);
  });
}
