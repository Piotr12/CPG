import { formatDecimal } from "../../quantities/decimal";
import { planExcess, type ExcessDay } from "../excess/plan-excess";

/** One stored day of a plan, as far as its summary reads it: six-decimal texts, signed where negative. */
export interface SummarizedDay extends Record<keyof ExcessDay, string> {
  date: string;
  shortage: string;
}

/** A stored figure, as `formatSignedQuantity` wrote it. */
const FIGURE = /^(-?)(\d+)\.(\d{6})$/;

/**
 * A stored figure as exact micro-units. Unlike `parseSignedQuantity`, it has no twelve-digit limit: a balance
 * may sum needs beyond what one entry may hold, as two lines of 999,999,999,999 do.
 */
function figure(text: string): bigint {
  const [, sign, whole, fraction] = FIGURE.exec(text)!;
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction);
  return sign ? -value : value;
}

/** What the MRP report's pair list shows of one plan (E18-S01, spec Q4 and Q7). */
export interface MrpPlanSummary {
  /** The lowest projected balance before proposals over the horizon, as stored. */
  lowestProjectedBefore: string;
  /** The first day whose shortage is above zero, or null when the plan never runs short. */
  firstShortageDate: string | null;
  /** The open supply the plan's documents bring beyond its need (`planExcess`, E19-S02), as a six-decimal text. */
  excess: string;
}

/**
 * Summarizes a plan's days, in date order. Balances compare as exact micro-units, never floats (R03);
 * the lowest is the first day that reaches it, its stored text unchanged. The shortage is measured
 * from the balance before proposals (`project-buckets.ts`), so the two figures agree. Excess is derived
 * from the stored figures alone, so a run stored before E19-S02 shows it too.
 */
export function summarizePlan(days: readonly [SummarizedDay, ...SummarizedDay[]]): MrpPlanSummary {
  let lowest = days[0];
  for (const day of days) if (figure(day.projectedBefore) < figure(lowest.projectedBefore)) lowest = day;
  const short = days.find((day) => figure(day.shortage) > 0n);
  const read = days.map((day) => ({
    tentativeSupply: figure(day.tentativeSupply),
    dependableSupply: figure(day.dependableSupply),
    transferIn: figure(day.transferIn),
    safetyTarget: figure(day.safetyTarget),
    projectedBefore: figure(day.projectedBefore),
  }));
  // Never negative, so `formatDecimal` (lesson 2026-11-01): one rule for a stored run and the engine's buckets.
  return { lowestProjectedBefore: lowest.projectedBefore, firstShortageDate: short?.date ?? null, excess: formatDecimal(planExcess(read), { fixed: true }) };
}
