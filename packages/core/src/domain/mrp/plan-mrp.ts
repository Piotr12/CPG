import { firmDemand } from "./demand/firm-demand";
import { forecastDemand } from "./demand/forecast-demand";
import { safetyLevels } from "./demand/safety-levels";
import type { MrpInputs } from "./mrp-inputs";
import type {
  MrpComponentDemand,
  MrpFirmDemand,
  MrpForecastDemand,
  MrpPlan,
  MrpProductionOutput,
  MrpResult,
  MrpSupply,
  MrpTransferMovement,
} from "./mrp-result";
import { horizonDates } from "./projection/horizon";
import { comparePairs, pairKey } from "./projection/pairs";
import { emptyFlows, projectBuckets, type MrpLedger } from "./projection/project-buckets";
import { productionMovements } from "./supply/production-orders";
import { purchasingSupply } from "./supply/purchasing-supply";
import { planTransfers } from "./supply/transfers";

interface PairDraft extends MrpLedger {
  material: string;
  location: string;
  firmDemand: MrpFirmDemand[];
  forecastDemand: MrpForecastDemand[];
  supply: MrpSupply[];
  productionOutput: MrpProductionOutput[];
  componentDemand: MrpComponentDemand[];
  transfersOut: MrpTransferMovement[];
  transfersIn: MrpTransferMovement[];
}

/**
 * Plans `inputs` over the 90 days from `today` (PRD §04, #273): one plan per material and location
 * the snapshot names, by material code, then location code. A pair is named by a stock row, by firm
 * demand, a forecast residual, purchasing supply, a production order's output or component need inside
 * the horizon, by a safety-stock target in force on one of its days, or by a transfer dispatch checked
 * or a transfer receipt (#275, #276, #277 Q9); without a stock row it starts from zero. The result
 * depends only on the snapshot's content, never its order, and the snapshot is never changed (R09, R10).
 *
 * Each seam adds its figures to the day it counts in. Transfers come last among them: a source's
 * feasibility needs every demand and dependable supply in place. A later seam that adds demand or
 * dependable supply runs before `planTransfers`; one that adds proposals runs after it.
 */
export function planMrp(inputs: MrpInputs, today: string): MrpResult {
  const dates = horizonDates(today);
  const dayOf = new Map(dates.map((date, day) => [date, day]));
  const pairs = new Map<string, PairDraft>();
  const pairOf = (material: string, location: string): PairDraft => {
    const key = pairKey(material, location);
    let pair = pairs.get(key);
    if (!pair) {
      const lists = { firmDemand: [], forecastDemand: [], supply: [], productionOutput: [], componentDemand: [], transfersOut: [], transfersIn: [] };
      pair = { material, location, physical: 0n, flows: dates.map(emptyFlows), ...lists };
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
  for (const item of forecastDemand(inputs.forecasts, inputs.orderLines, dates)) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!].forecastDemand += item.quantity;
    pair.forecastDemand.push(item);
  }
  for (const { material, location, levels } of safetyLevels(inputs.safetyTargets, dates)) {
    const { flows } = pairOf(material, location);
    levels.forEach((level, day) => (flows[day].safetyTarget = level));
  }
  for (const item of purchasingSupply(inputs.requisitions, inputs.purchaseOrderLines, dates)) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!][item.reliability === "tentative" ? "tentativeSupply" : "dependableSupply"] += item.quantity;
    pair.supply.push(item);
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
  const transfers = planTransfers(inputs.transfers, dates, pairOf);
  for (const item of transfers.dispatches) pairOf(item.material, item.location).transfersOut.push(item);
  for (const item of transfers.receipts) pairOf(item.material, item.location).transfersIn.push(item);
  const plans = [...pairs.values()].sort(comparePairs).map(({ flows, ...plan }): MrpPlan => ({ ...plan, buckets: projectBuckets(plan.physical, flows) }));
  return { today, dates, plans, proposals: [], exceptions: transfers.exceptions };
}
