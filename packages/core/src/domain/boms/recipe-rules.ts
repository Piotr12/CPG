import type { MaterialType } from "../../validators/materials/material-fields.schema";

/**
 * The lowest-ranked priority a BOM may have; 1 is the highest (spec Q4). 999 alternatives for one
 * output is far more than anyone keeps, and the bound keeps the field a small whole number.
 */
export const BOM_PRIORITY_MAX = 999;

/**
 * The most component lines one revision may have (spec Q5). No demo or acceptance recipe has more
 * than five; the bound only caps what one request can carry.
 */
export const BOM_COMPONENTS_MAX = 100;

/** Whether a material of `type` may be a BOM's output: intermediate or finished, never raw (R02, BOM-001…003). */
export function canBeBomOutput(type: MaterialType): boolean {
  return type !== "raw";
}

/** Whether a material of `type` may be a BOM component: raw or intermediate, never finished (R02, BOM-004, BOM-005). */
export function canBeBomComponent(type: MaterialType): boolean {
  return type !== "finished";
}
