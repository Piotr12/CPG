import { ValidationError } from "../../http/errors";
import { formatDecimal, MAX_QUANTITY, ONE, parseDecimal } from "../quantities/decimal";

/** Calendar days at UTC midnight, independent of daylight saving and working-day calendars. */
export function plannedStart(finish: string, leadTimeDays: number): string {
  const date = new Date(`${finish}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - leadTimeDays);
  if (date.getUTCFullYear() < 0) throw new ValidationError({ plannedFinish: ["The planned start must fit a four-digit calendar year."] });
  return date.toISOString().slice(0, 10);
}

/** Direct component need rounded upward once, then compared with physical stock at this site only. */
export function componentRequirement(perOutput: string, target: string, available: string) {
  const required = (parseDecimal(perOutput)! * parseDecimal(target)! + ONE - 1n) / ONE;
  if (required > MAX_QUANTITY) throw new ValidationError({ quantity: ["The component requirement is too large to store."] });
  const missing = required - parseDecimal(available)!;
  return { required: formatDecimal(required, { fixed: true }), available, shortage: formatDecimal(missing > 0n ? missing : 0n, { fixed: true }) };
}
