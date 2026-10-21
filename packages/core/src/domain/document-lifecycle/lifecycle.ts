import type { DocumentState } from "@cpg/db";
import { ConflictError } from "../../http/errors";
import { formatDecimal, parseDecimal } from "../quantities/decimal";

export type LifecycleAction = "cancel" | "close-early";
export type { DocumentState };

/** Normalized progress; services map their own fulfilled/received/converted/produced fields. */
export interface LifecycleLine {
  quantity: string;
  processed: string;
  abandoned: string;
  status: DocumentState;
}

/** A retained aggregate's state, excluding removed historical lines. */
export function documentState(states: readonly DocumentState[]): DocumentState {
  if (states.length === 0) throw new Error("A document must have at least one line.");
  if (states.includes("open")) return "open";
  if (states.every((state) => state === "completed")) return "completed";
  if (states.every((state) => state === "cancelled")) return "cancelled";
  return "closed-early";
}

/** Exact unresolved quantity, clamped after allowed overreceipt/overproduction. */
export function outstandingQuantity(quantity: string, processed: string, abandoned: string): string {
  const remaining = parseDecimal(quantity)! - parseDecimal(processed)! - parseDecimal(abandoned)!;
  return formatDecimal(remaining > 0n ? remaining : 0n, { fixed: true });
}

/**
 * Resolve the target's Open remainders without changing its processed history. Whole-document
 * callers include all lines; selected-line callers validate their selection first. Production
 * passes `hasProcessing` to include zero-output waste, which quantities alone cannot detect.
 */
export function resolveLines(
  action: LifecycleAction,
  lines: readonly LifecycleLine[],
  { hasProcessing = lines.some(({ processed }) => parseDecimal(processed)! > 0n) }: { hasProcessing?: boolean } = {},
): LifecycleLine[] {
  if (!lines.some(({ status }) => status === "open")) {
    throw new ConflictError("This document or line is no longer open.", "DOCUMENT_NOT_OPEN");
  }
  if (action === "cancel" && hasProcessing) {
    throw new ConflictError("Work has already been recorded. Use Close Early to abandon the remainder.", "DOCUMENT_PROCESSED");
  }
  if (action === "close-early" && !hasProcessing) {
    throw new ConflictError("No work has been recorded. Use Cancel instead.", "DOCUMENT_UNPROCESSED");
  }
  return lines.map((line) => line.status === "open" ? {
    ...line,
    abandoned: outstandingQuantity(line.quantity, line.processed, "0.000000"),
    status: action === "cancel" ? "cancelled" : "closed-early",
  } : { ...line });
}
