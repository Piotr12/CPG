import type { AuditChannel, MrpRun, MrpRunMode } from "@cpg/db";
import { addDays } from "../../domain/demand/demand-buckets";
import type { MrpBucket } from "../../domain/mrp/mrp-result";

/** A bucket's figures, in the order the engine declares them; `date` is the bucket's key, not a figure. */
export const MRP_FIGURES = [
  "firmDemand",
  "forecastDemand",
  "dependentDemand",
  "transferOut",
  "tentativeSupply",
  "dependableSupply",
  "atRiskSupply",
  "transferIn",
  "proposedReceipts",
  "safetyTarget",
  "projectedBefore",
  "projectedAfter",
  "shortage",
] as const satisfies readonly Exclude<keyof MrpBucket, "date">[];

export type MrpFigure = (typeof MRP_FIGURES)[number];

/** One stored MRP run, as the page, the action and both API routes show it. */
export interface MrpRunView {
  /** The eight-digit run ID. */
  id: string;
  createdAt: Date;
  /** The username that started it. */
  account: string;
  channel: AuditChannel;
  mode: MrpRunMode;
  generation: number;
  /** The first and last planned day (ISO), `horizonDays` apart inclusive. */
  startDate: string;
  endDate: string;
  horizonDays: number;
  /** Planned material-location pairs. */
  pairs: number;
}

/** One planned day: six-decimal texts in the base unit, signed where a balance is negative. */
export type MrpBucketView = { date: string } & Record<MrpFigure, string>;

export interface MrpPlanView {
  material: string;
  location: string;
  buckets: MrpBucketView[];
}

/** `GET /api/tenants/{tenant}/mrp/runs/latest`: the latest run and one page of its plans. */
export interface MrpLatestView {
  run: MrpRunView;
  page: number;
  pageSize: number;
  /** Planned pairs in the whole run. */
  total: number;
  plans: MrpPlanView[];
}

export function toRunView(run: MrpRun): MrpRunView {
  return {
    id: run.code,
    createdAt: run.createdAt,
    account: run.actorUsername,
    channel: run.channel,
    mode: run.mode,
    generation: run.generation,
    startDate: run.startDate,
    endDate: addDays(run.startDate, run.horizonDays - 1),
    horizonDays: run.horizonDays,
    pairs: run.pairs,
  };
}
