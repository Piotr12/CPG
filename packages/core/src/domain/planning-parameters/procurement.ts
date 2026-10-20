import type { MaterialType } from "../../validators/materials/material-fields.schema";

/** How MRP supplies a material at a location: made in production, or bought from a supplier. */
export const PROCUREMENT_MODES = ["make", "buy"] as const;
export type ProcurementMode = (typeof PROCUREMENT_MODES)[number];

/**
 * The longest lead time, in whole calendar days (MAT-018). Three digits reach far past MRP's 90-day
 * horizon, so no real lead time meets the limit, while a typo like 10000 is caught.
 */
export const LEAD_TIME_DAYS_MAX = 999;

/** Whether a material of `type` may be supplied by `mode` (R02, MAT-014/015): raw is Buy-only. */
export function isProcurementAllowed(type: MaterialType, mode: ProcurementMode): boolean {
  return mode === "buy" || type !== "raw";
}
