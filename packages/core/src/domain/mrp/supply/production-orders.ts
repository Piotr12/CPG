import { outstandingMicro } from "../../document-lifecycle/lifecycle";
import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpProductionOrder } from "../mrp-inputs";
import type { MrpComponentDemand, MrpProductionOutput } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/**
 * What the open production orders add over the horizon: dependable output where they finish, at-risk output
 * where an at-risk order finishes (E17-S03), and component needs where they start.
 */
export interface ProductionMovements {
  output: MrpProductionOutput[];
  atRisk: MrpProductionOutput[];
  components: MrpComponentDemand[];
}

/**
 * The movements of `orders` over the horizon `dates` (PRD §04 "Component timing and execution", #277).
 * Only open orders count, each with its unproduced balance, `quantity − produced − abandoned`, never
 * below zero (MRP-011, PRD-030). That balance is dependable output on the planned finish day, and each
 * pinned line's need for it, rounded upward once (R03), is demand on the planned start day, at the
 * producing site. Nothing is reserved and physical stock never changes (MRP-019, N04). An overdue day
 * moves to today and is kept on the item (MRP-016, MRP-022); a day after the horizon is in no bucket.
 *
 * An order whose pinned revision has an inactive component is at risk (E17-S03, MRP-051, spec Q3): its
 * balance is `atRisk`, never `output`, and only its active lines are demand, so an inactive material gets
 * no need from it (Q1). The order itself is kept as it is (R10).
 */
export function productionMovements(orders: readonly MrpProductionOrder[], dates: readonly string[]): ProductionMovements {
  const today = dates[0];
  const last = dates.at(-1)!;
  const output: MrpProductionOutput[] = [];
  const atRisk: MrpProductionOutput[] = [];
  const components: MrpComponentDemand[] = [];
  for (const order of orders) {
    if (order.status !== "open") continue;
    const remainder = outstandingMicro(order.quantity, order.produced, order.abandoned);
    if (remainder === 0n) continue;
    const { order: code, location, plannedFinish, plannedStart } = order;
    const finish = plannedFinish < today ? today : plannedFinish;
    const inactive = order.inactiveComponents;
    if (finish <= last) {
      (inactive.length > 0 ? atRisk : output).push({ order: code, material: order.material, location, plannedFinish, date: finish, quantity: remainder, overdue: plannedFinish < today });
    }
    const start = plannedStart < today ? today : plannedStart;
    if (start > last) continue;
    for (const { material, perOutput } of order.components) {
      if (inactive.includes(material)) continue;
      components.push({ order: code, material, location, plannedStart, date: start, quantity: scaledMicro(perOutput, remainder), overdue: plannedStart < today });
    }
  }
  return { output: output.sort(byDateOrderMaterial), atRisk: atRisk.sort(byDateOrderMaterial), components: components.sort(byDateOrderMaterial) };
}

/** Items by day, then order code, then material code, whatever the input order. */
function byDateOrderMaterial(a: { date: string; order: string; material: string }, b: typeof a): number {
  return compareCodes(a.date, b.date) || compareCodes(a.order, b.order) || compareCodes(a.material, b.material);
}
