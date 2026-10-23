import { GoodsReceiptLine, type EntityManager, type PurchaseOrderLine } from "@cpg/db";
import { postedReferences } from "../stock/posted-references";

/**
 * The lines a goods receipt was ever posted for (#138). A full reversal returns `received` to zero
 * but keeps the receipt line, so the line stays processed: Close early, never Cancel. A line with
 * something received is posted without a lookup.
 */
export async function postedOrderLineIds(em: EntityManager, lines: readonly PurchaseOrderLine[]): Promise<Set<string>> {
  const unreceived = lines.filter(({ received }) => received === "0.000000");
  const reversed = await postedReferences(unreceived.map(({ id }) => id), async (batch, limit) => {
    const receipts = await em.find(GoodsReceiptLine, { orderLine: { $in: batch } }, { fields: ["orderLine"], limit, disableIdentityMap: true });
    return receipts.map(({ orderLine }) => orderLine.id);
  });
  return new Set(lines.filter(({ id, received }) => received !== "0.000000" || reversed.has(id)).map(({ id }) => id));
}
