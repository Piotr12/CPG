import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { ShipmentLine } from "../shipments/shipment-line.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { GoodsIssue, goodsIssueTriggers } from "./goods-issue.entity";

const owned = tenantOwned();

/**
 * One line of a goods issue: what left for one `shipmentLine` of the issue's shipment. `quantity` is
 * six-decimal base-unit text (R03), with the entered quantity, unit and factor kept. `position` is the
 * line's 0-based index in the issue, and the position of its stock movement in the issue's posting.
 */
export const GoodsIssueLine = defineEntity({
  name: "GoodsIssueLine",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    issue: () => p.manyToOne(GoodsIssue),
    position: p.integer(),
    shipmentLine: () => p.manyToOne(ShipmentLine).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
  },
  uniques: [{ properties: ["issue", "position"] }],
  /**
   * Serve a list page's line read, `issue IN (…)`, and the shipment page's posted-line check,
   * `shipmentLine IN (…)`, which SQLite would plan through the tenant alone (#247).
   */
  indexes: [{ properties: ["tenant", "issue"] }, { properties: ["tenant", "shipmentLine"] }],
  triggers: goodsIssueTriggers("goods_issue_line"),
});

export type GoodsIssueLine = InferEntity<typeof GoodsIssueLine>;
