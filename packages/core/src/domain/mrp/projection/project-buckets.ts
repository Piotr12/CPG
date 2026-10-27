import type { MrpBucket } from "../mrp-result";

/** One day's flows: a bucket without the figures the projection derives. */
export type MrpFlows = Omit<MrpBucket, "projectedBefore" | "projectedAfter" | "shortage">;

/** A day with every flow zero, which the seams then add to. */
export function emptyFlows(date: string): MrpFlows {
  return {
    date,
    firmDemand: 0n,
    forecastDemand: 0n,
    dependentDemand: 0n,
    transferOut: 0n,
    tentativeSupply: 0n,
    dependableSupply: 0n,
    atRiskSupply: 0n,
    transferIn: 0n,
    proposedReceipts: 0n,
    safetyTarget: 0n,
  };
}

/**
 * The buckets of one material at one location, from today's `physical` stock and each day's `flows`.
 * A day's balance is the previous one plus tentative, dependable and transfer receipts, minus firm,
 * forecast, dependent and transfer demand, so same-day receipts offset same-day demand (PRD §04
 * closure defaults). At-risk supply is shown but never counted. The balance may go negative (R09);
 * the shortage is how far below zero it is.
 */
export function projectBuckets(physical: bigint, flows: readonly MrpFlows[]): MrpBucket[] {
  let balance = physical;
  let proposed = 0n;
  return flows.map((day) => {
    balance += day.tentativeSupply + day.dependableSupply + day.transferIn;
    balance -= day.firmDemand + day.forecastDemand + day.dependentDemand + day.transferOut;
    proposed += day.proposedReceipts;
    return { ...day, projectedBefore: balance, projectedAfter: balance + proposed, shortage: balance < 0n ? -balance : 0n };
  });
}
