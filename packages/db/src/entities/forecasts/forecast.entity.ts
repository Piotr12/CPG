import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Material } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const CALENDAR_DATE_LENGTH = 10;

const owned = tenantOwned();

/**
 * The demand expected of a material at a location on a day, with no customer (E08-S03, DEM-001).
 * The date is ISO text, with no time zone, which sorts correctly; the quantity is six-decimal
 * base-unit text (R03). At most one forecast per material, location and original date, the key the
 * slice 3 netting uses (DEM-007, D04).
 */
export const Forecast = defineEntity({
  name: "Forecast",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    material: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    date: p.string().length(CALENDAR_DATE_LENGTH),
    quantity: p.string(),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["material", "location", "date"] }],
});

export type Forecast = InferEntity<typeof Forecast>;
