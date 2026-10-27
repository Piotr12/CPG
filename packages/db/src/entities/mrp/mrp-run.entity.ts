import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { AUDIT_CHANNELS } from "../audit/audit-event";
import { tenantOwned } from "../tenants/tenant-owned";

/** How a run's proposals become documents: by hand (`manual`), or created by the run (E19-S03, not written yet). */
export const MRP_RUN_MODES = ["manual", "automatic"] as const;
export type MrpRunMode = (typeof MRP_RUN_MODES)[number];

const owned = tenantOwned();

/**
 * One on-demand MRP run of a tenant (E14-S02, PRD §04): its eight-digit ID, time, account, channel,
 * the dataset generation it planned and its horizon. Kept after a newer run supersedes it, so an ID is
 * never reused (R01); only the latest run keeps its daily results (spec Q1).
 */
export const MrpRun = defineEntity({
  name: "MrpRun",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** The first planned day: the server's UTC date when the run started. */
    startDate: p.string().length(10),
    horizonDays: p.integer(),
    mode: p.enum(MRP_RUN_MODES),
    generation: p.integer(),
    /** Planned material-location pairs: each has exactly `horizonDays` daily results. */
    pairs: p.integer(),
    actorUserId: p.string(),
    actorUsername: p.string(),
    /** The actor's channel: CPG's own screens or a bearer-token API call. */
    channel: p.enum(AUDIT_CHANNELS),
  },
  // Tenant-local business key: Test and Prod each number their runs from 00000001 (R05).
  uniques: [{ properties: ["tenant", "code"] }],
});
export type MrpRun = InferEntity<typeof MrpRun>;
