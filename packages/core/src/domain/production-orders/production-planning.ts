import { ValidationError } from "../../http/errors";
import { PLANNED_START_YEAR_MESSAGE, REQUIREMENT_OVERFLOW_MESSAGE } from "../../validators/production-orders/production-order.schema";
import { formatDecimal, MAX_QUANTITY, ONE, parseDecimal } from "../quantities/decimal";

/** Calendar days at UTC midnight, independent of daylight saving and working-day calendars. */
export function plannedStart(finish: string, leadTimeDays: number): string {
  const date = new Date(`${finish}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - leadTimeDays);
  if (date.getUTCFullYear() < 0) throw new ValidationError({ plannedFinish: [PLANNED_START_YEAR_MESSAGE] });
  return date.toISOString().slice(0, 10);
}

/**
 * A component's direct need for `output` base units of the output: its per-output base quantity scaled
 * and rounded upward once to six decimals (PRD §02/§04, BOM-007). An order's requirement and a
 * completion's expected consumption both use it, so the two always agree.
 */
export function scaledRequirement(perOutput: string, output: string): bigint {
  const required = scaledMicro(parseDecimal(perOutput)!, parseDecimal(output)!);
  if (required > MAX_QUANTITY) throw new ValidationError({ quantity: [REQUIREMENT_OVERFLOW_MESSAGE] });
  return required;
}

/**
 * `scaledRequirement`'s arithmetic on micro-units, without its storage bound: `perOutput × output`,
 * rounded upward once to six decimals. MRP sums these needs as `bigint`s, which can't overflow (#277).
 */
export function scaledMicro(perOutput: bigint, output: bigint): bigint {
  return (perOutput * output + ONE - 1n) / ONE;
}

/** Direct component need rounded upward once, then compared with physical stock at this site only. */
export function componentRequirement(perOutput: string, target: string, available: string) {
  const required = scaledRequirement(perOutput, target);
  const missing = required - parseDecimal(available)!;
  return { required: formatDecimal(required, { fixed: true }), available, shortage: formatDecimal(missing > 0n ? missing : 0n, { fixed: true }) };
}
