import type { MrpUnreadableRow } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import { isCalendarDate } from "../../../validators/dates/calendar-date.schema";

/** Where the seams report the rows they couldn't read (E16-S03): one entry per pair a row would feed. */
export type UnreadableRows = MrpUnreadableRow[];

/** What one stored row holds that MRP reads: base-quantity texts, the factor behind them, and dates. */
export interface StoredRow<K extends string> {
  quantities: Record<K, string>;
  /** The entered unit's factor the base quantities were converted with, where the row stores one. */
  factor?: { numerator: string; denominator: string };
  dates?: readonly string[];
}

/**
 * A stored row's quantities as micro-units, or `null` when the row can't be read (E16-S03, spec Q2):
 * a quantity that isn't a six-decimal number of zero or more (`parseDecimal`), a factor whose numerator
 * or denominator isn't one above zero, or a date that isn't a real `YYYY-MM-DD` day. Nothing is guessed
 * in its place: no 1:1 factor, no zero quantity, no nearest date (MAT-023, MRP-036). Rows are written
 * through the services, which refuse all three, so only legacy data or a hand edit can fail here.
 */
export function readRow<K extends string>({ quantities, factor, dates = [] }: StoredRow<K>): Record<K, bigint> | null {
  const read = {} as Record<K, bigint>;
  for (const key of Object.keys(quantities) as K[]) {
    const micro = parseDecimal(quantities[key]);
    if (micro === null) return null;
    read[key] = micro;
  }
  if (factor && !(positive(factor.numerator) && positive(factor.denominator))) return null;
  return dates.every(isCalendarDate) ? read : null;
}

const positive = (text: string) => (parseDecimal(text) ?? 0n) > 0n;
