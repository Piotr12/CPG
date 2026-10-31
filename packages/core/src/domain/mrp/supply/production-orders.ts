import { outstandingMicro } from "../../document-lifecycle/lifecycle";
import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpProductionOrder } from "../mrp-inputs";
import type { MrpComponentDemand, MrpProductionOutput } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** What the open production orders add over the horizon: output where they finish, component needs where they start. */
export interface ProductionMovements {
  output: MrpProductionOutput[];
  components: MrpComponentDemand[];
}

/**
 * The movements of `orders` over the horizon `dates` (PRD §04 "Component timing and execution", #277).
 * Only open orders count, each with its unproduced balance, `quantity − produced − abandoned`, never
 * below zero (MRP-011, PRD-030). That balance is dependable output on the planned finish day, and each
 * pinned line's need for it, rounded upward once (R03), is demand on the planned start day, at the
 * producing site. Nothing is reserved and physical stock never changes (MRP-019, N04). An overdue day
 * moves to today and is kept on the item (MRP-016, MRP-022); a day after the horizon is in no bucket.
 */
export function productionMovements(orders: readonly MrpProductionOrder[], dates: readonly string[]): ProductionMovements {
  const today = dates[0];
  const last = dates.at(-1)!;
  const output: MrpProductionOutput[] = [];
  const components: MrpComponentDemand[] = [];
  for (const order of orders) {
    if (order.status !== "open") continue;
    const remainder = outstandingMicro(order.quantity, order.produced, order.abandoned);
    if (remainder === 0n) continue;
    const { order: code, location, plannedFinish, plannedStart } = order;
    const finish = plannedFinish < today ? today : plannedFinish;
    if (finish <= last) {
      output.push({ order: code, material: order.material, location, plannedFinish, date: finish, quantity: remainder, overdue: plannedFinish < today });
    }
    const start = plannedStart < today ? today : plannedStart;
    if (start > last) continue;
    for (const { material, perOutput } of order.components) {
      components.push({ order: code, material, location, plannedStart, date: start, quantity: scaledMicro(perOutput, remainder), overdue: plannedStart < today });
    }
  }
  return { output: output.sort(byDateOrderMaterial), components: components.sort(byDateOrderMaterial) };
}

/** Items by day, then order code, then material code, whatever the input order. */
function byDateOrderMaterial(a: { date: string; order: string; material: string }, b: typeof a): number {
  return compareCodes(a.date, b.date) || compareCodes(a.order, b.order) || compareCodes(a.material, b.material);
}
