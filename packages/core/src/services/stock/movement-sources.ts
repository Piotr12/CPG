import { GoodsIssue, GoodsReceipt, TransferPosting, type EntityManager, type StockMovement } from "@cpg/db";
import { GOODS_ISSUE_MOVEMENT } from "../goods-issues/goods-issue.service";
import { GOODS_RECEIPT_MOVEMENT } from "../goods-receipts/goods-receipt.service";
import { TRANSFER_DISPATCH_MOVEMENT, TRANSFER_RECEIPT_MOVEMENT } from "../transfers/transfer.service";

/** The page that shows a movement's source document: the receipt's order, the issue's shipment, the transfer. */
export type SourceDocument = { type: "purchase-order" | "shipment" | "transfer"; id: string };

/**
 * Where a movement came from (INV-012): `id` is its goods receipt's, goods issue's or transfer's
 * business ID, and `document` the page that lists it. A correction is its own document: both null.
 */
export interface MovementSource {
  id: string | null;
  document: SourceDocument | null;
}

export const NO_SOURCE: MovementSource = { id: null, document: null };

/**
 * The source of each movement in `movements`, by `postingId`: one read per kind of document, so a
 * ledger page costs at most three queries. A movement is posted by its document's own transaction
 * and neither is ever deleted, so every non-correction movement finds one.
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
  return sources;
}
