import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material } from "../materials/material.entity";
import { Location } from "../locations/location.entity";
import { tenantOwned } from "../tenants/tenant-owned";

const owned = tenantOwned();
/** Exact physical stock, updated in the same transaction as its movements. Missing pairs mean zero. */
export const StockBalance = defineEntity({
  name: "StockBalance",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    material: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    quantity: p.string(),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["material", "location"] }],
});
export type StockBalance = InferEntity<typeof StockBalance>;
