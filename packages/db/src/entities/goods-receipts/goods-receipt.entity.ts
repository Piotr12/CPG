import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { PurchaseOrder } from "../purchase-orders/purchase-order.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** What the triggers say when anything tries to change a posted goods receipt or one of its lines. */
export const GOODS_RECEIPT_IMMUTABLE = "Goods receipts are immutable";

/**
 * Triggers that make a receipt table's rows unchangeable in the database itself: a posting is history,
 * and a reversal (E11-S02) will append, never rewrite. Rows can still be deleted by the Test reset.
 */
export function goodsReceiptTriggers(table: string) {
  const body = `select raise(abort, '${GOODS_RECEIPT_IMMUTABLE}');`;
  return [{ name: `${table}_no_update`, timing: "before" as const, events: ["update" as const], body }];
}

const owned = tenantOwned();

/**
 * Goods that arrived against one purchase `order` (E09-S02, BUY-013), posted on `businessDate` (the
 * server's UTC date for a user, the seed's own date for the seed, INV-010) at `createdAt`. `code` is its business ID: eight digits, sequential per
 * tenant, never reused. Its lines are `GoodsReceiptLine`s, and its stock movements carry its `id` as
 * their posting ID.
 */
export const GoodsReceipt = defineEntity({
  name: "GoodsReceipt",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    order: () => p.manyToOne(PurchaseOrder).index(),
    businessDate: p.string().length(10),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  triggers: goodsReceiptTriggers("goods_receipt"),
});

export type GoodsReceipt = InferEntity<typeof GoodsReceipt>;
