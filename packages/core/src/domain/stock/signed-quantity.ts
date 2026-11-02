import { formatDecimal, parseDecimal } from "../quantities/decimal";

/** A signed decimal as exact millionths; magnitude obeys the shared quantity limits (R03). */
export function parseSignedQuantity(text: string): bigint | null {
  const negative = text.startsWith("-");
  const magnitude = parseDecimal(/^[+-]/.test(text) ? text.slice(1) : text);
  return magnitude === null ? null : negative ? -magnitude : magnitude;
}

/** A figure as `formatSignedQuantity` writes it: a sign when negative, any number of integer digits, six decimals. */
const STORED_FIGURE = /^(-?)(\d+)\.(\d{6})$/;

/**
 * A stored figure as exact millionths (R03), with no twelve-digit limit: an MRP balance may sum needs beyond what
 * one entry may hold, as two lines of 999,999,999,999 do (#288). A text `formatSignedQuantity` didn't write is a
 * defect, not data, so it throws naming the text.
 */
export function parseStoredFigure(text: string): bigint {
  const match = STORED_FIGURE.exec(text);
  if (!match) throw new Error(`A stored figure isn't a six-decimal quantity: ${JSON.stringify(text)}.`);
  const [, sign, whole, fraction] = match;
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction);
  return sign ? -value : value;
}

/** Keeps the sign outside the existing nonnegative decimal formatter, including fractions. */
export function formatSignedQuantity(value: bigint): string {
  return value < 0n ? `-${formatDecimal(-value, { fixed: true })}` : formatDecimal(value, { fixed: true });
}
