import { roundUpToMultiple } from "../../quantities/decimal";

/**
 * The supply a net `need` (above zero) gets under a pair's lot rules (PRD §04, MAT-026): raised to
 * the `minimum` first, then rounded up to a whole number of `multiple`s (above zero). The order matters
 * when the minimum isn't a multiple: minimum 10, multiple 6 and need 2 give 12, which satisfies both
 * rules, where rounding first would give 10 (#278 Q1). The result is never below the need (MRP-045).
 */
export function lotQuantity(need: bigint, minimum: bigint, multiple: bigint): bigint {
  return roundUpToMultiple(need > minimum ? need : minimum, multiple);
}
