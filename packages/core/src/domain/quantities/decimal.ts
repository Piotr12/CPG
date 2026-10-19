/**
 * Exact decimal quantities (R03): authoritative quantities have six decimal places and are never
 * binary floating point. A quantity is held as a `bigint` count of millionths ("micro-units"), so
 * `0.333333` is `333333n` and nothing is ever rounded by the representation itself.
 */

/** Decimal places of every stored quantity and factor (PRD §02: six BUoM decimals). */
export const QUANTITY_DECIMALS = 6;
/** Integer digits a quantity or factor may have: room for 999 999 999 999 with six decimals. */
export const QUANTITY_INTEGER_DIGITS = 12;

const MICRO = 10n ** BigInt(QUANTITY_DECIMALS);
/** One unit, in micro-units. */
export const ONE = MICRO;
/** The largest quantity CPG stores: twelve nines, then six. */
export const MAX_QUANTITY = 10n ** BigInt(QUANTITY_INTEGER_DIGITS + QUANTITY_DECIMALS) - 1n;

const DECIMAL = new RegExp(`^(\\d{1,${QUANTITY_INTEGER_DIGITS}})(?:\\.(\\d{1,${QUANTITY_DECIMALS}}))?$`);

/**
 * A non-negative decimal string (`"12"`, `"0.5"`, `"0.123456"`) as micro-units, or null when it isn't
 * one: a sign, an exponent, more than twelve integer or six fractional digits, or anything else.
 */
export function parseDecimal(text: string): bigint | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(QUANTITY_DECIMALS, "0"));
}

/**
 * Micro-units as a decimal string. `fixed` always shows six decimals (`"24.000000"`), as stored
 * quantities are shown; otherwise trailing zeros go (`"12"`, `"0.5"`), as factors are shown.
 */
export function formatDecimal(micro: bigint, { fixed = false }: { fixed?: boolean } = {}): string {
  const whole = micro / MICRO;
  const fraction = (micro % MICRO).toString().padStart(QUANTITY_DECIMALS, "0");
  const shown = fixed ? fraction : fraction.replace(/0+$/, "");
  return shown ? `${whole}.${shown}` : `${whole}`;
}

/**
 * `entered × numerator ÷ denominator`, computed exactly and rounded half-up once to six decimals
 * (PRD §02: alternate-unit input converts once, half-up). All three are micro-units; the result is
 * too. Callers check the result's range and a positive input rounding to zero (MAT-032).
 */
export function convertToBase(entered: bigint, numerator: bigint, denominator: bigint): bigint {
  // In micro-units, a×n÷d is (a·1e6)(n·1e6)÷(d·1e6) = (a·n÷d)·1e6: already at the right scale.
  const dividend = entered * numerator;
  return (2n * dividend + denominator) / (2n * denominator);
}

/** `denominator ÷ numerator`, half-up to six decimals: the indicative inverse a screen shows (MAT-021). */
export function inverseFactor(numerator: bigint, denominator: bigint): bigint {
  return convertToBase(ONE, denominator, numerator);
}
