import { firmDemand } from "./demand/firm-demand";
import { forecastDemand } from "./demand/forecast-demand";
import { safetyLevels } from "./demand/safety-levels";
import type { MrpInputs } from "./mrp-inputs";
import type { MrpFirmDemand, MrpForecastDemand, MrpPlan, MrpResult, MrpSupply } from "./mrp-result";
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
  forecastDemand: MrpForecastDemand[];
  supply: MrpSupply[];
}

/**
 * Plans `inputs` over the 90 days from `today` (PRD §04, #273): one plan per material and location
 * the snapshot names, by material code, then location code. A pair is named by a stock row, by firm
 * demand, a forecast residual or supply inside the horizon, or by a safety-stock target in force on one
 * of its days (#275, #276); without a stock row it starts from zero. The result depends only on the
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
      pair = { material, location, physical: 0n, flows: dates.map(emptyFlows), firmDemand: [], forecastDemand: [], supply: [] };
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
  const plans = [...pairs.values()].sort(comparePairs).map(
    ({ material, location, physical, flows, firmDemand: firm, forecastDemand: forecast, supply }): MrpPlan => ({
      material,
      location,
      physical,
      buckets: projectBuckets(physical, flows),
      firmDemand: firm,
      forecastDemand: forecast,
      supply,
    }),
  );
  return { today, dates, plans, proposals: [] };
}
