import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { MrpRun } from "./mrp-run.entity";

/** What a recommendation would create: never a transfer (N06) and never a purchase order (MRP-030). */
export const MRP_RECOMMENDATION_KINDS = ["purchase-requisition", "production-order"] as const;
export type MrpRecommendationKind = (typeof MRP_RECOMMENDATION_KINDS)[number];

const owned = tenantOwned();

/**
 * One replenishment proposal of an MRP run (E16-S01, the data model's "MRP recommendation"): what it
 * would create, for which material and location (business IDs, spec Q6 of #274), the day it covers
 * and its quantity as a six-decimal text in the base unit (R03). Only the latest run keeps them, as
 * with its daily results. The run reference cascades, so deleting a run removes its recommendations
 * even from an image that predates this table (a Test reset during a deploy, #278 spec).
 *
 * `leadTimeDays` is the pair's lead time the proposal was timed with (E16-S02): the read derives its
 * planned start and finish, lateness and Beyond Horizon mark from it and the run's start, through the
 * engine's own rule. It defaults to 0, so a row an older image writes reads as received on its need date,
 * which is how that image planned it.
 */
export const MrpRecommendation = defineEntity({
  name: "MrpRecommendation",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    run: () => p.manyToOne(MrpRun).deleteRule("cascade"),
    material: p.string().length(8),
    location: p.string().length(8),
    kind: p.enum(MRP_RECOMMENDATION_KINDS),
    needDate: p.string().length(10),
    quantity: p.string(),
    leadTimeDays: p.integer().default(0),
  },
  /** One proposal per pair and day; it also serves the latest-run read of a page's proposals. */
  uniques: [{ properties: ["tenant", "run", "material", "location", "needDate"] }],
});
export type MrpRecommendation = InferEntity<typeof MrpRecommendation>;
