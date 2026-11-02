import type { MrpBucket } from "../mrp-result";
import type { SizedPair, SizedProposal } from "./size-proposals";

/** The days of one planned pair that sizing reads (E17-S03): the projection's, with its at-risk supply. */
export type SizingDay = Pick<MrpBucket, "date" | "safetyTarget" | "projectedBefore" | "atRiskSupply">;

/**
 * The balance sizing reads (E17-S03 spec Q2, Q6): each day's `projectedBefore`, plus every at-risk output up
 * to that day, so the demand it was to cover is blocked rather than replanned; plus the pair's provisional
 * dependent demand up to that day when `provisional` is given (`projectedBefore` already subtracts it, so
 * adding it back sizes without it); plus every `carried` proposal whose need date is on or before that day,
 * as `sizeProposals` carries its own. The projection itself never counts the first or the last. With nothing
 * to add, the days themselves are returned: most pairs have no at-risk output and no provisional demand.
 */
export function sizingBuckets(
  buckets: readonly SizingDay[],
  provisional: readonly bigint[] | null,
  carried: readonly Pick<SizedProposal, "needDate" | "quantity">[],
): SizedPair["buckets"] {
  if (provisional === null && carried.length === 0 && buckets.every(({ atRiskSupply }) => atRiskSupply === 0n)) return buckets;
  const carriedOn = new Map<string, bigint>();
  for (const { needDate, quantity } of carried) carriedOn.set(needDate, (carriedOn.get(needDate) ?? 0n) + quantity);
  let added = 0n;
  return buckets.map(({ date, safetyTarget, projectedBefore, atRiskSupply }, day) => {
    added += atRiskSupply + (provisional?.[day] ?? 0n) + (carriedOn.get(date) ?? 0n);
    return { date, safetyTarget, projectedBefore: projectedBefore + added };
  });
}
