import { outstandingMicro } from "../../document-lifecycle/lifecycle";
import type { MrpPurchaseOrderLine, MrpRequisition } from "../mrp-inputs";
import type { MrpSupply } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/**
 * The incoming purchasing supply of `requisitions` and `purchaseOrderLines` over the horizon `dates`
 * (PRD §04 "Supply pipeline and overdue", E15-S02). Only open documents count, each with its own
 * remainder, never below zero: a requisition's `quantity − converted − abandoned` as tentative supply,
 * a purchase-order line's `quantity − received − abandoned` as dependable supply. A conversion moves
 * quantity from the requisition into the order line, and a receipt from the line into physical stock,
 * so each quantity counts once (MRP-010, MRP-012, BUY-026). Supply whose date has passed counts today,
 * keeps its date and is marked overdue (MRP-015); supply placed after the last date is in no bucket.
 */
export function purchasingSupply(
  requisitions: readonly MrpRequisition[],
  purchaseOrderLines: readonly MrpPurchaseOrderLine[],
  dates: readonly string[],
): MrpSupply[] {
  const today = dates[0];
  const last = dates.at(-1)!;
  const items: MrpSupply[] = [];
  const add = (item: Omit<MrpSupply, "date" | "overdue">) => {
    const overdue = item.plannedDate < today;
    const date = overdue ? today : item.plannedDate;
    if (item.quantity === 0n || date > last) return;
    items.push({ ...item, date, overdue });
  };
  for (const { status, code, material, location, requiredDate, quantity, converted, abandoned } of requisitions) {
    if (status !== "open") continue;
    add({
      kind: "requisition",
      reliability: "tentative",
      document: code,
      position: null,
      material,
      location,
      plannedDate: requiredDate,
      quantity: outstandingMicro(quantity, converted, abandoned),
    });
  }
  for (const { status, order, position, material, location, plannedDate, quantity, received, abandoned } of purchaseOrderLines) {
    if (status !== "open") continue;
    add({
      kind: "purchase-order",
      reliability: "dependable",
      document: order,
      position,
      material,
      location,
      plannedDate,
      quantity: outstandingMicro(quantity, received, abandoned),
    });
  }
  return items.sort(compareSupply);
}

/** Supply by bucket date, own date, kind, document and position, so a result never depends on input order. */
export function compareSupply(a: MrpSupply, b: MrpSupply): number {
  return (
    compareCodes(a.date, b.date) ||
    compareCodes(a.plannedDate, b.plannedDate) ||
    compareCodes(a.kind, b.kind) ||
    compareCodes(a.document, b.document) ||
    (a.position ?? 0) - (b.position ?? 0)
  );
}
