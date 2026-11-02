import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { MrpRun } from "./mrp-run.entity";

const owned = tenantOwned();

/**
 * One exception of an MRP run (E16-S03, the data model's "MRP exception"): what the plan can't do as
 * the documents say, or can't plan without guessing. `position` is its place in the run's order, so
 * two runs on the same data store the same rows in the same positions. `material` and `location` are
 * business IDs (a transfer's source for Insufficient Transfer Stock); `date` is absent where the code
 * has none, and `details` holds the code's other params as strings. `exceptionCode` is the API's
 * `code`, named apart from the `code` business ID other tenant tables carry. It is a plain string, not
 * an enum: core owns the codes, and a code a later story adds needs no table rebuild (spec Q6). Only
 * the latest run keeps its exceptions; the run reference cascades, as for `MrpRecommendation`.
 *
 * Since E18-S02 the run also stores its warnings here, after its exceptions: `OVERDUE_SUPPLY` and
 * `OVERDUE_TRANSFER`, overdue supply counted on the run's first day. The read never lists them as
 * exceptions; the report shows them as marks. Since E17-S03 its provisional actions follow
 * (`PROVISIONAL_PRODUCTION`), and since E18-S03 each feasible fallback's rejected BOMs (`BOM_REJECTIONS`, on
 * the proposal's need date), which the read attaches to that proposal.
 */
export const MrpRunException = defineEntity({
  name: "MrpRunException",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    run: () => p.manyToOne(MrpRun).deleteRule("cascade"),
    position: p.integer(),
    exceptionCode: p.string().length(40),
    material: p.string().length(8),
    location: p.string().length(8),
    date: p.string().length(10).nullable(),
    details: p.json<Record<string, string>>().nullable(),
  },
  /** One row per position; it also serves the latest-run read of a page's exceptions. */
  uniques: [{ properties: ["tenant", "run", "material", "location", "position"] }],
});
export type MrpRunException = InferEntity<typeof MrpRunException>;
