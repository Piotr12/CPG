import { outstandingMicro } from "../../document-lifecycle/lifecycle";
import type { MrpOrderLine } from "../mrp-inputs";
import type { MrpFirmDemand } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/**
 * The firm demand of `orderLines` over the horizon `dates`. Only open, non-removed lines count, each
 * with `quantity − fulfilled − abandoned`, never below zero (SAL-004's location is the order's). An
 * overdue line counts today and keeps its required date (SAL-017); one due after the last date is in
 * no bucket (MRP-004). Items come by date, required date, order and position, whatever the input order.
 */
export function firmDemand(orderLines: readonly MrpOrderLine[], dates: readonly string[]): MrpFirmDemand[] {
  const today = dates[0];
  const last = dates.at(-1)!;
  const items: MrpFirmDemand[] = [];
  for (const line of orderLines) {
    if (line.removed || line.status !== "open") continue;
    const quantity = outstandingMicro(line.quantity, line.fulfilled, line.abandoned);
    const date = line.requiredDate < today ? today : line.requiredDate;
    if (quantity === 0n || date > last) continue;
    const { order, position, material, location, requiredDate } = line;
    items.push({ order, position, material, location, requiredDate, date, quantity });
  }
  return items.sort(
    (a, b) =>
      compareCodes(a.date, b.date) || compareCodes(a.requiredDate, b.requiredDate) || compareCodes(a.order, b.order) || a.position - b.position,
  );
}
