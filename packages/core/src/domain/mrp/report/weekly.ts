import { bucketStart, isoWeek } from "../../demand/demand-buckets";
import { formatSignedQuantity, parseSignedQuantity } from "../../stock/signed-quantity";
import type { MrpMark } from "./plan-marks";

/** The figures a week sums: what flows in or out on its days. */
export const MRP_WEEK_FLOWS = [
  "firmDemand",
  "forecastDemand",
  "dependentDemand",
  "transferOut",
  "tentativeSupply",
  "dependableSupply",
  "atRiskSupply",
  "transferIn",
  "proposedReceipts",
] as const;

/** The figures a week takes from its last day: levels, never summed (PRD §07, spec Q4). */
export const MRP_WEEK_LEVELS = ["safetyTarget", "projectedBefore", "projectedAfter"] as const;

type Flow = (typeof MRP_WEEK_FLOWS)[number];
type Level = (typeof MRP_WEEK_LEVELS)[number];

/** One stored day of a plan as the fold reads it: six-decimal texts, signed where a balance is negative. */
export type WeekDay = { date: string; shortage: string } & Record<Flow | Level, string>;

/**
 * One ISO week of a plan, for display only (E18-S02, UX-027): its flows summed, its levels at its last
 * day, and its weakest day's balance and shortage. It has no shortage sum: a shortage that lasts a week
 * is one shortage, not seven (PRD §07).
 */
export type MrpWeek = {
  /** The week's first and last day inside the horizon. */
  start: string;
  end: string;
  /** Its ISO week-year and number (`isoWeek`), as the demand review counts weeks. */
  year: number;
  week: number;
  /** Fewer than seven days: the horizon cuts it (spec Q3). */
  partial: boolean;
  /** The lowest `projectedBefore` of its days (spec Q5). */
  lowestProjectedBefore: string;
  /** The largest `shortage` of its days. */
  peakShortage: string;
  /** The marks of its days, in the plan's order. */
  marks: MrpMark[];
} & Record<Flow | Level, string>;

const DAYS_PER_WEEK = 7;

/** A stored figure as exact micro-units. The run wrote it with `formatSignedQuantity`, so a text that doesn't parse is a defect, not data. */
function micro(text: string): bigint {
  const value = parseSignedQuantity(text);
  if (value === null) throw new Error(`An MRP daily figure isn't a six-decimal quantity: ${JSON.stringify(text)}.`);
  return value;
}

/**
 * Folds a plan's days, in date order, into its ISO weeks (Monday to Sunday, calendar days, N04), cut to
 * the days given (spec Q3), and gives each week the marks whose date it holds. Exact `bigint` sums, never
 * floats (R03). The days are read only: the fold writes nothing (MRP-006).
 */
export function foldWeeks(days: readonly WeekDay[], marks: readonly MrpMark[]): MrpWeek[] {
  const groups: WeekDay[][] = [];
  for (const day of days) {
    const group = groups.at(-1);
    if (group && bucketStart("week", group[0].date) === bucketStart("week", day.date)) group.push(day);
    else groups.push([day]);
  }
  return groups.map((group) => {
    const first = group[0];
    const last = group.at(-1)!;
    const flows = Object.fromEntries(MRP_WEEK_FLOWS.map((flow) => [flow, formatSignedQuantity(group.reduce((sum, day) => sum + micro(day[flow]), 0n))]));
    const levels = Object.fromEntries(MRP_WEEK_LEVELS.map((level) => [level, last[level]]));
    let lowest = first;
    let peak = first;
    for (const day of group) {
      if (micro(day.projectedBefore) < micro(lowest.projectedBefore)) lowest = day;
      if (micro(day.shortage) > micro(peak.shortage)) peak = day;
    }
    const { year, week } = isoWeek(first.date);
    return {
      start: first.date,
      end: last.date,
      year,
      week,
      partial: group.length < DAYS_PER_WEEK,
      ...(flows as Record<Flow, string>),
      ...(levels as Record<Level, string>),
      lowestProjectedBefore: lowest.projectedBefore,
      peakShortage: peak.shortage,
      marks: marks.filter(({ date }) => date >= first.date && date <= last.date),
    };
  });
}
