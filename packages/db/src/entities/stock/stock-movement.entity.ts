import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material } from "../materials/material.entity";
import { Location } from "../locations/location.entity";
import { tenantOwned } from "../tenants/tenant-owned";

const owned = tenantOwned();
export const STOCK_MOVEMENT_IMMUTABLE = "Stock movements are immutable";
/** Signed BUoM history; no service changes or deletes it. The future Test reset owns deletion. */
export const StockMovement = defineEntity({
  name: "StockMovement",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    postingId: p.uuid(),
    position: p.integer(),
    type: p.string(),
    material: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    businessDate: p.string().length(10),
    occurredAt: p.datetime().onCreate(() => new Date()),
    quantity: p.string(),
    baseUnit: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string(),
    numerator: p.string(),
    denominator: p.string(),
    balanceBefore: p.string(),
    balanceAfter: p.string(),
    reason: p.string().length(500),
    actorUserId: p.string().nullable(),
    actorUsername: p.string(),
    channel: p.enum(["ui", "api", "seed"]),
  },
  uniques: [{ properties: ["tenant", "postingId", "position"] }],
  indexes: [{ properties: ["tenant", "material", "location", "occurredAt"] }],
  triggers: [{
    name: "stock_movement_no_update", timing: "before", events: ["update"],
    body: `select raise(abort, '${STOCK_MOVEMENT_IMMUTABLE}');`,
  }],
});
export type StockMovement = InferEntity<typeof StockMovement>;
