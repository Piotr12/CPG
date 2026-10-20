import { formatDecimal, parseDecimal } from "../quantities/decimal";

/** What a requisition is once purchase orders have taken some of it. */
export interface Conversion {
  /** Six-decimal base-unit text (R03). */
  converted: string;
  status: "open" | "completed";
}

/** How much of a requisition no order line has taken yet, as six-decimal text. */
export function outstandingQuantity(quantity: string, converted: string): string {
  return formatDecimal(parseDecimal(quantity)! - parseDecimal(converted)!, { fixed: true });
}

/** Whether `taken` fits in what is still outstanding (BUY-004: never convert more than was asked). */
export function fitsOutstanding(quantity: string, converted: string, taken: string): boolean {
  return parseDecimal(taken)! <= parseDecimal(quantity)! - parseDecimal(converted)!;
}

/**
 * The requisition after `taken` more of it is converted: the new total, and `completed` exactly
 * when the total equals the quantity (BUY-004, LFC-003). Callers check `fitsOutstanding` first.
 */
export function afterConversion(quantity: string, converted: string, taken: string): Conversion {
  const total = parseDecimal(converted)! + parseDecimal(taken)!;
  return { converted: formatDecimal(total, { fixed: true }), status: total === parseDecimal(quantity)! ? "completed" : "open" };
}

/** `a + b` of two six-decimal quantity texts, as six-decimal text. */
export function addQuantities(a: string, b: string): string {
  return formatDecimal(parseDecimal(a)! + parseDecimal(b)!, { fixed: true });
}
