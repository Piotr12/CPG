import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { PurchaseOrderLine } from "../purchase-orders/purchase-order-line.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { GoodsReceipt, goodsReceiptTriggers } from "./goods-receipt.entity";

const owned = tenantOwned();

/**
 * One line of a goods receipt: what arrived for one `orderLine` of the receipt's purchase order.
 * `quantity` is six-decimal base-unit text (R03), with the entered quantity, unit and factor kept
 * (MAT-019). `position` is the line's 0-based index in the receipt, and the position of its stock
 * movement in the receipt's posting.
 */
export const GoodsReceiptLine = defineEntity({
  name: "GoodsReceiptLine",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    receipt: () => p.manyToOne(GoodsReceipt),
    position: p.integer(),
    orderLine: () => p.manyToOne(PurchaseOrderLine).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
  },
  uniques: [{ properties: ["receipt", "position"] }],
  triggers: goodsReceiptTriggers("goods_receipt_line"),
});

export type GoodsReceiptLine = InferEntity<typeof GoodsReceiptLine>;
