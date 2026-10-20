import { formatDecimal, MAX_QUANTITY, parseDecimal } from "../quantities/decimal";

/** A purchase-order line after a receipt (spec Q5, Q6). Quantities are six-decimal base-unit text (R03). */
export interface LineReceipt {
  received: string;
  /** The part of this receipt beyond what was still outstanding before it; zero when none (BUY-015). */
  excess: string;
  /** Whether the line has now received at least its quantity (BUY-016, LFC-003). */
  completed: boolean;
}

/** What a line still awaits: never negative, even after an excess (BUY-015). */
export function outstandingOf(quantity: string, received: string): string {
  const left = parseDecimal(quantity)! - parseDecimal(received)!;
  return formatDecimal(left > 0n ? left : 0n, { fixed: true });
}

/** Whether a line has received at least its quantity. */
export function isLineReceived(quantity: string, received: string): boolean {
  return parseDecimal(received)! >= parseDecimal(quantity)!;
}

/**
 * The line of `quantity`, having received `received`, after `taken` more arrives; null when the new
 * total would not fit a stored quantity (twelve integer digits).
 */
export function afterReceipt(quantity: string, received: string, taken: string): LineReceipt | null {
  const ordered = parseDecimal(quantity)!;
  const before = parseDecimal(received)!;
  const total = before + parseDecimal(taken)!;
  if (total > MAX_QUANTITY) return null;
  const beyond = total - (before > ordered ? before : ordered);
  return {
    received: formatDecimal(total, { fixed: true }),
    excess: formatDecimal(beyond > 0n ? beyond : 0n, { fixed: true }),
    completed: total >= ordered,
  };
}
