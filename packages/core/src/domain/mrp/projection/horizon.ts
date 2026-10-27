import { addDays } from "../../demand/demand-buckets";

/** MRP plans 90 daily buckets, today included (PRD §04, MRP-003); nothing after day 89 is in a bucket (MRP-004). */
export const MRP_HORIZON_DAYS = 90;

/** The horizon's dates, `today` through `today + 89`, counted in UTC days. */
export function horizonDates(today: string): string[] {
  return Array.from({ length: MRP_HORIZON_DAYS }, (_, day) => addDays(today, day));
}
