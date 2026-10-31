import { targetInForce } from "../../safety-stock/target-on";
import type { MrpSafetyTarget } from "../mrp-inputs";
import type { MrpPair } from "../projection/pairs";
import { pairKey } from "../projection/pairs";

/** The safety-stock target in force on each horizon day of one material at one location. */
export interface MrpSafetyLevels extends MrpPair {
  /** One per horizon date, zero on the days before the pair's first target. */
  levels: bigint[];
}

/**
 * The daily safety-stock targets of `targets` over the horizon `dates`: each target applies from its
 * date until the next one of its pair (DEM-015/016), so a rise from 20 to 40 inside the horizon gives
 * 20 before that day and 40 from it (MRP-043). Only pairs with a target in force on at least one day
 * come back, whatever its quantity: a pair with no target has none (DEM-014).
 */
export function safetyLevels(targets: readonly MrpSafetyTarget[], dates: readonly string[]): MrpSafetyLevels[] {
  const byPair = new Map<string, MrpSafetyTarget[]>();
  for (const target of targets) {
    const key = pairKey(target.material, target.location);
    (byPair.get(key) ?? byPair.set(key, []).get(key)!).push(target);
  }
  const result: MrpSafetyLevels[] = [];
  for (const pairTargets of byPair.values()) {
    const inForce = dates.map((date) => targetInForce(pairTargets, date));
    if (inForce.every((target) => target === null)) continue;
    const { material, location } = pairTargets[0];
    result.push({ material, location, levels: inForce.map((target) => target?.quantity ?? 0n) });
  }
  return result;
}
