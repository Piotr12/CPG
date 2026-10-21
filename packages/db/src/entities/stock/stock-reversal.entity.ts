import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { StockMovement } from "./stock-movement.entity";

const owned = tenantOwned();
export const STOCK_REVERSAL_IMMUTABLE = "Stock reversal links are immutable";

/** Append-only link: an original can have one inverse, without updating either movement. */
export const StockReversal = defineEntity({
  name: "StockReversal",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    original: () => p.manyToOne(StockMovement),
    inverse: () => p.manyToOne(StockMovement),
  },
  uniques: [{ properties: ["tenant", "original"] }, { properties: ["tenant", "inverse"] }],
  triggers: [{
    name: "stock_reversal_no_update", timing: "before", events: ["update"],
    body: `select raise(abort, '${STOCK_REVERSAL_IMMUTABLE}');`,
  }],
});
export type StockReversal = InferEntity<typeof StockReversal>;
