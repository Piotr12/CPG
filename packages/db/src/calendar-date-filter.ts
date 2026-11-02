import { raw } from "@mikro-orm/core";
import { plainColumn } from "./sql-column";

/**
 * A filter term matching the rows whose `column` doesn't hold a real calendar day written `YYYY-MM-DD`
 * (#321): SQLite's `date()` gives back such a day unchanged, and anything else changed or `NULL`. It is
 * `isCalendarDate`'s rule in SQL, so a read can find the corrupt dates a date range would skip wherever
 * they sort. Spread it into a `where`, beside the other conditions; the tenant filter applies unchanged.
 * Nothing can seek it: the read walks whatever rows its other conditions leave, in SQLite.
 */
export function notCalendarDate(column: string): Record<symbol, 0> {
  const name = plainColumn(column);
  // A fragment becomes a symbol when used as a computed key, as in `decimalLengthKey`.
  return { [raw<symbol>((alias: string) => `(date(${alias}.${name}) is ${alias}.${name})`)]: 0 };
}
