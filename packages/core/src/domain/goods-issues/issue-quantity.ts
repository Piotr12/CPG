import { outstandingQuantity, type DocumentState } from "../document-lifecycle/lifecycle";
import { formatDecimal, parseDecimal } from "../quantities/decimal";

/*
 * The arithmetic of shipping and issuing against a customer order (shipments spec Q3, Q5, Q8).
 * Quantities are six-decimal base-unit text (R03); nothing here reads the database.
 */

/** The part of `quantity` above `taken`, never negative. */
function remainder(quantity: string, taken: string): bigint {
  const left = parseDecimal(quantity)! - parseDecimal(taken)!;
  return left > 0n ? left : 0n;
}

/** What an order line still awaits: its quantity less what was fulfilled and abandoned, never negative. */
export function outstandingOf(line: { quantity: string; fulfilled: string; abandoned: string; status?: DocumentState }): string {
  return outstandingQuantity(line.quantity, line.fulfilled, line.abandoned, line.status);
}

/**
 * What a shipment line may still issue (SAL-012, SAL-018): the smaller of what it still plans and what
 * its order line still has outstanding.
 */
export function toIssueOf(planned: string, issued: string, outstanding: string): string {
  const plan = remainder(planned, issued);
  const open = parseDecimal(outstanding)!;
  return formatDecimal(plan < open ? plan : open, { fixed: true });
}

/** Whether `quantity` is more than `limit`. */
export function exceeds(quantity: string, limit: string): boolean {
  return parseDecimal(quantity)! > parseDecimal(limit)!;
}

/** The sum of two quantities, six decimals. */
export function addQuantities(a: string, b: string): string {
  return formatDecimal(parseDecimal(a)! + parseDecimal(b)!, { fixed: true });
}

/** Whether nothing is left: a zero quantity. */
export function isNothing(quantity: string): boolean {
  return parseDecimal(quantity) === 0n;
}

/** Whether an order line has been delivered in full (SAL-013, LFC-003): fulfilled at least its quantity. */
export function isLineFulfilled(line: { quantity: string; fulfilled: string }): boolean {
  return parseDecimal(line.fulfilled)! >= parseDecimal(line.quantity)!;
}
