import { formatDecimal } from "../../quantities/decimal";
import { parseSignedQuantity } from "../../stock/signed-quantity";
import { planExcess, type ExcessDay } from "../excess/plan-excess";

/** One stored day of a plan, as far as its summary reads it: six-decimal texts, signed where negative. */
export interface SummarizedDay extends Record<keyof ExcessDay, string> {
  date: string;
  shortage: string;
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
  for (const day of days) if (parseSignedQuantity(day.projectedBefore)! < parseSignedQuantity(lowest.projectedBefore)!) lowest = day;
  const short = days.find((day) => parseSignedQuantity(day.shortage)! > 0n);
  const read = days.map((day) => ({
    tentativeSupply: parseSignedQuantity(day.tentativeSupply)!,
    dependableSupply: parseSignedQuantity(day.dependableSupply)!,
    transferIn: parseSignedQuantity(day.transferIn)!,
    safetyTarget: parseSignedQuantity(day.safetyTarget)!,
    projectedBefore: parseSignedQuantity(day.projectedBefore)!,
  }));
  // Never negative, so `formatDecimal` (lesson 2026-11-01): one rule for a stored run and the engine's buckets.
  return { lowestProjectedBefore: lowest.projectedBefore, firstShortageDate: short?.date ?? null, excess: formatDecimal(planExcess(read), { fixed: true }) };
}
