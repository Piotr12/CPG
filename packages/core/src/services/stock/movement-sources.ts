import { GoodsIssue, GoodsReceipt, ProductionCompletion, TransferPosting, type EntityManager, type StockMovement } from "@cpg/db";
import { GOODS_ISSUE_MOVEMENT } from "../goods-issues/goods-issue.service";
import { GOODS_RECEIPT_MOVEMENT } from "../goods-receipts/goods-receipt.service";
import { PRODUCTION_COMPLETION_MOVEMENT } from "../production-orders/production-completion.service";
import { TRANSFER_DISPATCH_MOVEMENT, TRANSFER_RECEIPT_MOVEMENT } from "../transfers/transfer.service";

/**
 * The page that shows a movement's source document: the receipt's order, the issue's shipment, the
 * transfer, the completion's production order.
 */
export type SourceDocument = { type: "purchase-order" | "shipment" | "transfer" | "production-order"; id: string };

/**
 * Where a movement came from (INV-012): `id` is its goods receipt's, goods issue's, transfer's or
 * production completion's business ID, and `document` the page that lists it. A correction (a stock
 * import posts corrections too) is its own document: both null.
 */
export interface MovementSource {
  id: string | null;
  document: SourceDocument | null;
}

export const NO_SOURCE: MovementSource = { id: null, document: null };

/**
 * The source of each movement in `movements`, by `postingId`: one read per kind of document, so a
 * ledger page costs at most four queries. A movement is posted by its document's own transaction and
 * neither is ever deleted, so every non-correction movement finds one.
 */
export async function movementSources(em: EntityManager, movements: StockMovement[]): Promise<Map<string, MovementSource>> {
  const ids = (...types: string[]) => [...new Set(movements.filter((movement) => types.includes(movement.type)).map((movement) => movement.postingId))];
  const sources = new Map<string, MovementSource>();
  const receipts = ids(GOODS_RECEIPT_MOVEMENT);
  if (receipts.length > 0) {
    for (const receipt of await em.find(GoodsReceipt, { id: { $in: receipts } }, { populate: ["order"] })) {
      sources.set(receipt.id, { id: receipt.code, document: { type: "purchase-order", id: receipt.order.code } });
    }
  }
  const issues = ids(GOODS_ISSUE_MOVEMENT);
  if (issues.length > 0) {
    for (const issue of await em.find(GoodsIssue, { id: { $in: issues } }, { populate: ["shipment"] })) {
      sources.set(issue.id, { id: issue.code, document: { type: "shipment", id: issue.shipment.code } });
    }
  }
  const postings = ids(TRANSFER_DISPATCH_MOVEMENT, TRANSFER_RECEIPT_MOVEMENT);
  if (postings.length > 0) {
    for (const posting of await em.find(TransferPosting, { id: { $in: postings } }, { populate: ["transfer"] })) {
      sources.set(posting.id, { id: posting.transfer.code, document: { type: "transfer", id: posting.transfer.code } });
    }
  }
  const completions = ids(PRODUCTION_COMPLETION_MOVEMENT);
  if (completions.length > 0) {
    for (const completion of await em.find(ProductionCompletion, { id: { $in: completions } }, { populate: ["order"] })) {
      sources.set(completion.id, { id: completion.code, document: { type: "production-order", id: completion.order.code } });
    }
  }
  return sources;
}
