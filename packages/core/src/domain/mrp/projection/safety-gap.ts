import type { MrpBucket } from "../mrp-result";

/**
 * How far a day's projected balance, before proposals, falls below the safety-stock target in force
 * that day; zero at or above it (MRP-043). The target is a level the balance is compared with, never
 * demand the balance subtracts (#273 Q4), so the gap is derived here rather than stored (#275 Q2).
 */
export function safetyGap({ safetyTarget, projectedBefore }: Pick<MrpBucket, "safetyTarget" | "projectedBefore">): bigint {
  const gap = safetyTarget - projectedBefore;
  return gap > 0n ? gap : 0n;
}
