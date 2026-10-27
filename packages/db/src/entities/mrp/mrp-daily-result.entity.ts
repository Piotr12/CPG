import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { MrpRun } from "./mrp-run.entity";

const owned = tenantOwned();

/**
 * One planned day of one material at one location in an MRP run: the engine's bucket (`MrpBucket`)
 * as six-decimal texts in the base unit, signed where a balance goes negative (R03). Materials and
 * locations are their business IDs, which never change (spec Q6).
 */
export const MrpDailyResult = defineEntity({
  name: "MrpDailyResult",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    run: () => p.manyToOne(MrpRun),
    material: p.string().length(8),
    location: p.string().length(8),
    date: p.string().length(10),
    firmDemand: p.string(),
    forecastDemand: p.string(),
    dependentDemand: p.string(),
    transferOut: p.string(),
    tentativeSupply: p.string(),
    dependableSupply: p.string(),
    atRiskSupply: p.string(),
    transferIn: p.string(),
    proposedReceipts: p.string(),
    safetyTarget: p.string(),
    projectedBefore: p.string(),
    projectedAfter: p.string(),
    shortage: p.string(),
  },
  /** One row per day and pair; it also serves the latest-run page and the report's filtered reads in order (E18-S01). */
  uniques: [{ properties: ["tenant", "run", "material", "location", "date"] }],
});
export type MrpDailyResult = InferEntity<typeof MrpDailyResult>;
