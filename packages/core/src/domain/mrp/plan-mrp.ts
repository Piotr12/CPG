import { firmDemand } from "./demand/firm-demand";
import type { MrpInputs } from "./mrp-inputs";
import type { MrpFirmDemand, MrpPlan, MrpResult, MrpSupply } from "./mrp-result";
import { horizonDates } from "./projection/horizon";
import { comparePairs, pairKey } from "./projection/pairs";
import { emptyFlows, projectBuckets, type MrpFlows } from "./projection/project-buckets";
import { purchasingSupply } from "./supply/purchasing-supply";

interface PairDraft {
  material: string;
  location: string;
  physical: bigint;
  flows: MrpFlows[];
  firmDemand: MrpFirmDemand[];
  supply: MrpSupply[];
}

/**
 * Plans `inputs` over the 90 days from `today` (PRD §04, #273): one plan per material and location
 * the snapshot names, with a stock row, firm demand or supply inside the horizon, by material code, then
 * location code. A pair without a stock row starts from zero. The result depends only on the
 * snapshot's content, never its order, and the snapshot is never changed (R09, R10).
 */
export function planMrp(inputs: MrpInputs, today: string): MrpResult {
  const dates = horizonDates(today);
  const dayOf = new Map(dates.map((date, day) => [date, day]));
  const pairs = new Map<string, PairDraft>();
  const pairOf = (material: string, location: string): PairDraft => {
    const key = pairKey(material, location);
    let pair = pairs.get(key);
    if (!pair) {
      pair = { material, location, physical: 0n, flows: dates.map(emptyFlows), firmDemand: [], supply: [] };
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
  for (const item of purchasingSupply(inputs.requisitions, inputs.purchaseOrderLines, dates)) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!][item.reliability === "tentative" ? "tentativeSupply" : "dependableSupply"] += item.quantity;
    pair.supply.push(item);
  }
  const plans = [...pairs.values()].sort(comparePairs).map(
    ({ material, location, physical, flows, firmDemand: items, supply }): MrpPlan => ({
      material,
      location,
      physical,
      buckets: projectBuckets(physical, flows),
      firmDemand: items,
      supply,
    }),
  );
  return { today, dates, plans, proposals: [] };
}
