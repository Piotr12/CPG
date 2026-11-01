import type { AuditChannel, MrpRecommendationKind, MrpRun, MrpRunMode } from "@cpg/db";
import { addDays } from "../../domain/demand/demand-buckets";
import type { MrpBucket, MrpProposalTiming } from "../../domain/mrp/mrp-result";
import type { MrpMark } from "../../domain/mrp/report/plan-marks";
import type { MrpWeek } from "../../domain/mrp/report/weekly";
import type { MrpReportBucket } from "../../validators/mrp/mrp-latest.schema";

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

/** One planned material-location pair: its 90 days, and what the report shows beside them (E18-S01). */
export interface MrpPlanView {
  material: string;
  materialDescription: string;
  materialActive: boolean;
  /** The material's base unit: the unit of every figure. */
  baseUnit: string;
  location: string;
  locationName: string;
  locationActive: boolean;
  /** The lowest projected balance before proposals over the horizon (spec Q7). */
  lowestProjectedBefore: string;
  /** The first day with a shortage, or null. */
  firstShortageDate: string | null;
  buckets: MrpBucketView[];
  /** The run's replenishment proposals for this pair, by need date (E16-S01). */
  proposals: MrpProposalView[];
  /** The run's exceptions for this pair, a transfer's at its source, in run order (E16-S03). Never a warning. */
  exceptions: MrpExceptionView[];
  /** What the report marks on its days (E18-S02): overdue supply and transfers, late and Beyond Horizon proposals. */
  marks: MrpMarkView[];
  /** Its days folded into ISO weeks, for display: only when the read asked for `bucket=week` (E18-S02). */
  weeks?: MrpWeekView[];
}

/** One mark of a plan, on the day it falls on (E18-S02, UX-018). */
export type MrpMarkView = MrpMark;

/** One ISO week of a plan: flows summed, levels at week end, the weakest day's balance and shortage (UX-027). */
export type MrpWeekView = MrpWeek;

/**
 * One stored MRP exception (E16-S03): its code, its fixed English message, and `params` as strings,
 * the pair and its date among them. Screens translate it by code and params (spec Q7).
 */
export interface MrpExceptionView {
  code: string;
  message: string;
  params: Record<string, string>;
}

/**
 * One stored replenishment proposal (E16-S01): what it would create, the day it covers, a six-decimal
 * BUoM quantity above zero, and its timing (E16-S02): its planned start, never before the run's start,
 * its planned finish, the days it is late (Late Supply) and whether it finishes after the run's last day
 * (Beyond Horizon), and the BOM and revision a production order is exploded through (E17-S01).
 */
export interface MrpProposalView extends MrpProposalTiming {
  /** The proposal's ID for accepting it (E19-S01): unique across tenants, so another tenant's is never found. */
  id: string;
  kind: MrpRecommendationKind;
  needDate: string;
  quantity: string;
  /** Whether it can be accepted at all (`isExecutableProposal`): a Make proposal can't yet. */
  executable: boolean;
  /** The business ID of the document accepting it created, or null while it isn't accepted. */
  document: string | null;
  /** The BOM a production-order proposal plans through (E17-S01, MRP-031); null for a requisition, or a row an older image wrote. */
  bom: string | null;
  /** That BOM's current revision number; null where `bom` is. */
  bomRevision: number | null;
}

/** `GET /api/tenants/{tenant}/mrp/runs/latest`: the latest run and one page of its plans. */
export interface MrpLatestView {
  run: MrpRunView;
  /** The view the read was asked for: `week` adds each plan's `weeks`; `buckets` are always the days. */
  bucket: MrpReportBucket;
  page: number;
  pageSize: number;
  /** Planned pairs the filters leave: the whole run's without filters. */
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
