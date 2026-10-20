import { formatDecimal, parseDecimal } from "../quantities/decimal";

/** A signed decimal as exact millionths; magnitude obeys the shared quantity limits (R03). */
export function parseSignedQuantity(text: string): bigint | null {
  const negative = text.startsWith("-");
  const magnitude = parseDecimal(/^[+-]/.test(text) ? text.slice(1) : text);
  return magnitude === null ? null : negative ? -magnitude : magnitude;
}

/** Keeps the sign outside the existing nonnegative decimal formatter, including fractions. */
export function formatSignedQuantity(value: bigint): string {
  return value < 0n ? `-${formatDecimal(-value, { fixed: true })}` : formatDecimal(value, { fixed: true });
}
