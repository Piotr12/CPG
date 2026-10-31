import { formatDecimal, parseDecimal } from "../quantities/decimal";

/** What one posting on a transfer does to its progress (spec Q4–Q6). */
export type TransferPostingKind = "dispatch" | "receipt" | "write-off";

/** A transfer's planned quantity and what its postings have moved, six-decimal base-unit text (R03). */
export interface TransferProgress {
  quantity: string;
  dispatched: string;
  received: string;
  writtenOff: string;
}

/** A posting that fits: the progress after it, and the in-transit quantity around it. */
export interface PostingOutcome {
  progress: TransferProgress;
  transitBefore: string;
  transitAfter: string;
}

const micro = (text: string) => parseDecimal(text)!;
const text = (value: bigint) => formatDecimal(value, { fixed: true });

/** What is on the road: dispatched, and neither received nor written off (INV-009). Never negative. */
export function inTransitOf({ dispatched, received, writtenOff }: TransferProgress): string {
  return text(inTransitMicro(micro(dispatched), micro(received), micro(writtenOff)));
}

/** What the source has still to send (TRF-004: "undispatched balance"). */
export function undispatchedOf({ quantity, dispatched }: TransferProgress): string {
  return text(undispatchedMicro(micro(quantity), micro(dispatched)));
}

/** `inTransitOf` on micro-units, as MRP plans them (#277). */
export function inTransitMicro(dispatched: bigint, received: bigint, writtenOff: bigint): bigint {
  return dispatched - received - writtenOff;
}

/** `undispatchedOf` on micro-units, as MRP plans them (#277). */
export function undispatchedMicro(quantity: bigint, dispatched: bigint): bigint {
  return quantity - dispatched;
}

/**
 * The most one posting of `kind` may move: a dispatch the undispatched quantity (spec Q4), a receipt
 * and a write-off what is in transit (TRF-007, TRF-013).
 */
export function postingLimit(progress: TransferProgress, kind: TransferPostingKind): string {
  return kind === "dispatch" ? undispatchedOf(progress) : inTransitOf(progress);
}

/**
 * The progress after a posting of `kind` moving `amount`, or null when `amount` exceeds its limit
 * (`postingLimit`), in which case nothing may be written. A dispatch adds to transit; a receipt and
 * a write-off take from it.
 */
export function afterPosting(progress: TransferProgress, kind: TransferPostingKind, amount: string): PostingOutcome | null {
  const moved = micro(amount);
  if (moved > micro(postingLimit(progress, kind))) return null;
  const field = kind === "dispatch" ? "dispatched" : kind === "receipt" ? "received" : "writtenOff";
  const next = { ...progress, [field]: text(micro(progress[field]) + moved) };
  return { progress: next, transitBefore: inTransitOf(progress), transitAfter: inTransitOf(next) };
}

/**
 * Whether the whole planned quantity has been received (spec Q7): the transfer is then Completed.
 * Receipts never exceed what was dispatched, nor dispatches the plan, so this also means nothing is
 * in transit and nothing was written off.
 */
export function isFullyReceived({ quantity, received }: TransferProgress): boolean {
  return micro(received) >= micro(quantity);
}

/**
 * The progress after fully reversing a posting of `kind` that moved `amount` (E11-S03): a dispatch's
 * reversal takes it off `dispatched` (and transit), a receipt's or write-off's puts it back into transit.
 * Null when any quantity, transit included, would go negative: the history no longer matches, and
 * nothing may be written (R09).
 */
export function afterReversal(progress: TransferProgress, kind: TransferPostingKind, amount: string): PostingOutcome | null {
  const field = kind === "dispatch" ? "dispatched" : kind === "receipt" ? "received" : "writtenOff";
  const remaining = micro(progress[field]) - micro(amount);
  if (remaining < 0n) return null;
  const next = { ...progress, [field]: text(remaining) };
  if (micro(next.dispatched) - micro(next.received) - micro(next.writtenOff) < 0n) return null;
  return { progress: next, transitBefore: inTransitOf(progress), transitAfter: inTransitOf(next) };
}
