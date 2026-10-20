import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Material } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** How MRP supplies a material at a location (R02: a raw material is always bought). */
export const PROCUREMENT_MODES = ["make", "buy"] as const;
export type ProcurementMode = (typeof PROCUREMENT_MODES)[number];

const owned = tenantOwned();

/**
 * How one material is planned at one location (E03-S03): made or bought, the lead time in whole
 * calendar days (MAT-018), and the minimum lot and lot multiple a supply proposal respects. The two
 * quantities are in the material's base unit, six-decimal text like every stored quantity (R03).
 * One set per material and location, with all four values: an absent set is what MRP reports as
 * missing parameters (MAT-017).
 */
export const PlanningParameterSet = defineEntity({
  name: "PlanningParameterSet",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    material: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    procurement: p.enum(PROCUREMENT_MODES),
    leadTimeDays: p.integer(),
    minimumQuantity: p.string(),
    lotMultiple: p.string(),
    /** Optimistic-lock version (AUD-024, API-029): an edit carries the one it loaded. */
    version: p.integer().version(),
  },
  uniques: [{ properties: ["material", "location"] }],
});

export type PlanningParameterSet = InferEntity<typeof PlanningParameterSet>;
