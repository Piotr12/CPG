import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Shipment } from "../shipments/shipment.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** What the triggers say when anything tries to change a posted goods issue or one of its lines. */
export const GOODS_ISSUE_IMMUTABLE = "Goods issues are immutable";

/**
 * Triggers that make a goods-issue table's rows unchangeable in the database itself: a posting is
 * history, and a reversal (E11-S02) will append, never rewrite. The Test reset can still delete rows.
 */
export function goodsIssueTriggers(table: string) {
  const body = `select raise(abort, '${GOODS_ISSUE_IMMUTABLE}');`;
  return [{ name: `${table}_no_update`, timing: "before" as const, events: ["update" as const], body }];
}

const owned = tenantOwned();

/**
 * Goods that left against one `shipment` (E08-S02), posted on `businessDate` (the server's UTC date,
 * INV-010) at `createdAt`. `code` is its business ID: eight digits, sequential per tenant, never
 * reused. Its lines are `GoodsIssueLine`s, and its stock movements carry its `id` as their posting ID.
 */
export const GoodsIssue = defineEntity({
  name: "GoodsIssue",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    shipment: () => p.manyToOne(Shipment).index(),
    businessDate: p.string().length(10),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  triggers: goodsIssueTriggers("goods_issue"),
});

export type GoodsIssue = InferEntity<typeof GoodsIssue>;
