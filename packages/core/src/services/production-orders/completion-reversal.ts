import { StockMovement, StockReversal, type EntityManager, type ProductionCompletion, type ProductionCompletionLine, type ProductionOrder } from "@cpg/db";
import { parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError } from "../../http/errors";
import { assertReversalSource, inconsistentReversal } from "../stock/reversal-records";

/** The movement type a completion posts; `production-completion.service.ts` re-exports it. */
export const PRODUCTION_COMPLETION_MOVEMENT = "production-completion";

/** Who reversed a completion, when and why: read from its inverse movements, which carry the reason (spec Q4). */
export interface CompletionReversalView {
  /** The reversal's posting ID: every inverse movement carries it. */
  id: string;
  businessDate: string;
  occurredAt: Date;
  reason: string;
  actorUsername: string;
  channel: "ui" | "api";
}

export function completionAlreadyReversed(reversal: string | null): ConflictError {
  return new ConflictError("This completion has already been reversed.", "PRODUCTION_COMPLETION_ALREADY_REVERSED", reversal === null ? undefined : { reversal });
}

/**
 * Proves the completion's movements are exactly what it posted before anything is inverted: the output
 * in (when anything was produced), then each material used out, in line order, all at the order's
 * location. Anything else is `STOCK_REVERSAL_INCONSISTENT`, so a damaged history never posts half a reversal.
 */
export function assertCompletionHistory(
  order: ProductionOrder, completion: ProductionCompletion, lines: readonly ProductionCompletionLine[], movements: readonly StockMovement[],
): void {
  const expected: { material: string; quantity: string; sign: 1n | -1n }[] = [];
  if (parseDecimal(completion.quantity)! > 0n) expected.push({ material: order.output.id, quantity: completion.quantity, sign: 1n });
  for (const line of lines) {
    if (parseDecimal(line.actual)! > 0n) expected.push({ material: line.material.id, quantity: line.actual, sign: -1n });
  }
  if (expected.length !== movements.length) throw inconsistentReversal();
  movements.forEach((movement, position) => {
    if (movement.type !== PRODUCTION_COMPLETION_MOVEMENT) throw inconsistentReversal();
    const { material, quantity, sign } = expected[position];
    assertReversalSource(movement, material, order.location.id, quantity, sign);
  });
}

/**
 * Each listed completion's reversal, by completion ID. A completion is reversed as a whole, so the link
 * of its first movement decides: one bounded read for a page of at most `COMPLETION_PAGE_SIZE`. The
 * caller passes at least one completion.
 */
export async function completionReversals(em: EntityManager, completions: readonly ProductionCompletion[]): Promise<Map<string, CompletionReversalView>> {
  const reversals = new Map<string, CompletionReversalView>();
  const first = await em.find(StockMovement, { postingId: { $in: completions.map(({ id }) => id) }, position: 0 });
  for (const { original, inverse } of await em.find(StockReversal, { original: { $in: first } }, { populate: ["original", "inverse"] })) {
    const { postingId, businessDate, occurredAt, reason, actorUsername, channel } = inverse;
    reversals.set(original.postingId, { id: postingId, businessDate, occurredAt, reason, actorUsername, channel: channel as CompletionReversalView["channel"] });
  }
  return reversals;
}
