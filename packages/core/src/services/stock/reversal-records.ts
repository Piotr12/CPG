import type { StockMovement } from "@cpg/db";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { ConflictError } from "../../http/errors";

export const inconsistentReversal = () => new ConflictError("The original posting no longer matches its document.", "STOCK_REVERSAL_INCONSISTENT");

/** Validate immutable source identity before changing either stock or document progress. */
export function assertReversalSource(original: Pick<StockMovement, "quantity" | "material" | "location">, material: string, location: string, quantity: string, sign: 1n | -1n): void {
  const source = parseDecimal(quantity);
  if (source === null || source <= 0n || parseSignedQuantity(original.quantity) !== sign * source ||
    original.material.id !== material || original.location.id !== location) throw inconsistentReversal();
}

/** A source cannot undo more progress than the document has actually recorded. */
export function subtractReversedQuantity(total: string, quantity: string): string {
  const before = parseDecimal(total);
  const amount = parseDecimal(quantity);
  if (before === null || amount === null || before < amount) throw inconsistentReversal();
  return formatDecimal(before - amount, { fixed: true });
}
