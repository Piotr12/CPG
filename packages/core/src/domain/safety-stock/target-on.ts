/**
 * Effective-dated safety-stock targets (PRD §04, DEM-014…017): each target applies from its date
 * until the next one for the same material and location, and with none in force the target is zero.
 * Dates are ISO `YYYY-MM-DD` text, which sorts and compares correctly as plain strings.
 */

/** One target of a material at a location. `quantity` is a six-decimal base-unit quantity. */
export interface DatedTarget {
  effectiveFrom: string;
  quantity: string;
}

/** The target when none is in force (DEM-014), in the stored six-decimal form. */
export const NO_TARGET = "0.000000";

/** Where a target stands on a given day. */
export type TargetStatus = "inEffect" | "scheduled" | "superseded";

/**
 * The target of `targets` (one material at one location) in force on `date`: the one with the
 * latest effective date on or before it, or null when none has started yet. Only the date is read,
 * so MRP passes its `bigint` targets through the same rule (#275).
 */
export function targetInForce<T extends Pick<DatedTarget, "effectiveFrom">>(targets: readonly T[], date: string): T | null {
  let inForce: T | null = null;
  for (const target of targets) {
    if (target.effectiveFrom <= date && (inForce === null || target.effectiveFrom > inForce.effectiveFrom)) {
      inForce = target;
    }
  }
  return inForce;
}

/** The quantity in force on `date`: a target applies until the next one (DEM-015, DEM-016), else 0. */
export function safetyTargetOn(targets: readonly DatedTarget[], date: string): string {
  return targetInForce(targets, date)?.quantity ?? NO_TARGET;
}

/**
 * Where `target`, one of `targets` (same material and location), stands on `today`: in effect, not
 * started yet (scheduled), or replaced by a later target that has started (superseded).
 */
export function targetStatus(targets: readonly DatedTarget[], target: DatedTarget, today: string): TargetStatus {
  if (target.effectiveFrom > today) return "scheduled";
  return targetInForce(targets, today)?.effectiveFrom === target.effectiveFrom ? "inEffect" : "superseded";
}
