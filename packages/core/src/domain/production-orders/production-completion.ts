import { AppError } from "../../http/errors";
import { formatDecimal, MAX_QUANTITY, parseDecimal } from "../quantities/decimal";
import { formatSignedQuantity } from "../stock/signed-quantity";
import { scaledRequirement } from "./production-planning";

/** What a component is expected to use for a completion of `output` base units (PRD-010): zero output expects nothing. */
export function expectedConsumption(perOutput: string, output: string): string {
  return formatDecimal(scaledRequirement(perOutput, output), { fixed: true });
}

/** How far the actual use was from the expectation, signed: actual − expected (PRD-013 −2, PRD-014 +3). */
export function consumptionVariance(expected: string, actual: string): string {
  return formatSignedQuantity(parseDecimal(actual)! - parseDecimal(expected)!);
}

/** An order's produced quantity after a completion of `output`; refused when it would no longer fit a stored quantity. */
export function producedAfter(produced: string, output: string): string {
  const after = parseDecimal(produced)! + parseDecimal(output)!;
  if (after > MAX_QUANTITY) throw new AppError("QUANTITY_OUT_OF_RANGE", "That quantity is too large to store in the base unit.");
  return formatDecimal(after, { fixed: true });
}

/** Whether `produced` is more than the order's `target`: a completion that gets there needs the user's acceptance (PRD-019). */
export function exceedsTarget(produced: string, target: string): boolean {
  return parseDecimal(produced)! > parseDecimal(target)!;
}

/**
 * The one rule for an order's state (spec Q8): Completed once it has produced its target (LFC-003,
 * PRD-019, PRD-030), Open while anything is outstanding. Completions and target edits both apply it.
 */
export function productionStatus(produced: string, target: string): "open" | "completed" {
  return parseDecimal(produced)! >= parseDecimal(target)! ? "completed" : "open";
}

/** What an order has still to produce, never below zero once it is overproduced. */
export function productionOutstanding(target: string, produced: string): string {
  const left = parseDecimal(target)! - parseDecimal(produced)!;
  return formatDecimal(left > 0n ? left : 0n, { fixed: true });
}
