import { firmDemand } from "./demand/firm-demand";
import type { MrpInputs } from "./mrp-inputs";
import type { MrpComponentDemand, MrpFirmDemand, MrpPlan, MrpProductionOutput, MrpResult } from "./mrp-result";
import { horizonDates } from "./projection/horizon";
import { comparePairs, pairKey } from "./projection/pairs";
import { emptyFlows, projectBuckets, type MrpFlows } from "./projection/project-buckets";
import { productionMovements } from "./supply/production-orders";

interface PairDraft {
  material: string;
  location: string;
  physical: bigint;
  flows: MrpFlows[];
  firmDemand: MrpFirmDemand[];
  productionOutput: MrpProductionOutput[];
  componentDemand: MrpComponentDemand[];
}

/**
 * Plans `inputs` over the 90 days from `today` (PRD §04, #273): one plan per material and location
 * the snapshot names, with a stock row, firm demand, or a production order's output or component need
 * inside the horizon (#277), by material code, then location code. A pair without a stock row starts
 * from zero. The result depends only on the snapshot's content, never its order, and the snapshot is
 * never changed (R09, R10).
 */
export function planMrp(inputs: MrpInputs, today: string): MrpResult {
  const dates = horizonDates(today);
  const dayOf = new Map(dates.map((date, day) => [date, day]));
  const pairs = new Map<string, PairDraft>();
  const pairOf = (material: string, location: string): PairDraft => {
    const key = pairKey(material, location);
    let pair = pairs.get(key);
    if (!pair) {
      pair = { material, location, physical: 0n, flows: dates.map(emptyFlows), firmDemand: [], productionOutput: [], componentDemand: [] };
      pairs.set(key, pair);
    }
    return pair;
  };
  for (const row of inputs.stock) pairOf(row.material, row.location).physical += row.physical;
  for (const item of firmDemand(inputs.orderLines, dates)) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!].firmDemand += item.quantity;
    pair.firmDemand.push(item);
  }
  const production = productionMovements(inputs.productionOrders, dates);
  for (const item of production.output) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!].dependableSupply += item.quantity;
    pair.productionOutput.push(item);
  }
  for (const item of production.components) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!].dependentDemand += item.quantity;
    pair.componentDemand.push(item);
  }
  const plans = [...pairs.values()].sort(comparePairs).map(
    ({ flows, ...plan }): MrpPlan => ({ ...plan, buckets: projectBuckets(plan.physical, flows) }),
  );
  return { today, dates, plans, proposals: [] };
}
