import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Material } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const CALENDAR_DATE_LENGTH = 10;

const owned = tenantOwned();

/**
 * The safety stock to keep of a material at a location from `effectiveFrom` until the next target
 * (E03-S03, DEM-015/016). The date is ISO text, with no time zone, which sorts correctly; the
 * quantity is six-decimal base-unit text (R03). At most one target per material, location and date
 * (DEM-017).
 */
export const SafetyStockTarget = defineEntity({
  name: "SafetyStockTarget",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    material: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    effectiveFrom: p.string().length(CALENDAR_DATE_LENGTH),
    quantity: p.string(),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["material", "location", "effectiveFrom"] }],
});

export type SafetyStockTarget = InferEntity<typeof SafetyStockTarget>;
