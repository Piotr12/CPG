import type { MrpBucket } from "../mrp-result";

/** The figures of one planned day that excess reads (E19-S02). */
export type ExcessDay = Pick<MrpBucket, "tentativeSupply" | "dependableSupply" | "transferIn" | "safetyTarget" | "projectedBefore">;

/**
 * A plan's excess (E19-S02 spec Q1, PRD §04 "surplus planned supply visible"): the open supply its documents
 * bring that the horizon's demand and safety stock don't need. It is the last day's balance before proposals
 * above that day's safety target, capped at the plan's open supply over the horizon: requisitions,
 * purchase-order lines and production output (`tentativeSupply`, `dependableSupply`) and transfer receipts
 * (`transferIn`), overdue ones on today's day. At-risk supply is in no balance, and proposals are in
 * `projectedAfter` only, so neither counts. Surplus physical stock alone is never excess. It describes the
 * current documents: an accepted lot-rounded proposal shows its rounding on the next run. MRP never acts on it (R10).
 */
export function planExcess(days: readonly ExcessDay[]): bigint {
  let supply = 0n;
  for (const { tentativeSupply, dependableSupply, transferIn } of days) supply += tentativeSupply + dependableSupply + transferIn;
  // A plan always has its 90 days (`horizonDates`).
  const last = days[days.length - 1];
  const surplus = last.projectedBefore - last.safetyTarget;
  if (surplus <= 0n) return 0n;
  return surplus < supply ? surplus : supply;
}
