import { firmDemand } from "./demand/firm-demand";
import { forecastDemand } from "./demand/forecast-demand";
import { safetyLevels } from "./demand/safety-levels";
import type { MrpBom, MrpInputs, MrpRecordKind } from "./mrp-inputs";
import type {
  MrpComponentDemand,
  MrpException,
  MrpFirmDemand,
  MrpForecastDemand,
  MrpPlan,
  MrpProductionOutput,
  MrpProposal,
  MrpResult,
  MrpSupply,
  MrpTransferMovement,
} from "./mrp-result";
import { horizonDates } from "./projection/horizon";
import { compareCodes, comparePairs, pairKey } from "./projection/pairs";
import { emptyFlows, projectBuckets, type MrpLedger } from "./projection/project-buckets";
import { rankShortages } from "./priority/rank-shortages";
import { productionMovements } from "./supply/production-orders";
import { purchasingSupply } from "./supply/purchasing-supply";
import { compareExceptions } from "./exceptions/compare-exceptions";
import { replenishPair } from "./sizing/replenish-pair";
import { planTransfers } from "./supply/transfers";
import { compareWarnings, overdueWarnings } from "./warnings/overdue";

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
 *
 * Sizing runs last (E16-S01): `replenishPair` gives each pair its proposals from its balances before
 * proposals, which never count them, or the one exception that stops them (E16-S03), and the pair is
 * then projected again with each proposal in its day's `proposedReceipts`, so `projectedAfter` keeps
 * its one definition in `projectBuckets`. Parameters name no pairs. An unreadable row names its pairs
 * like a stock row, and makes every planned pair of its material Invalid UoM Conversion (spec Q4): no
 * figure of one material depends on another's, so every other material plans as if it were absent.
 * `replenishPair` also times each proposal (E16-S02): its receipt counts on its planned finish, which is later than
 * its need when the lead time makes it late, and a Beyond Horizon proposal counts in no bucket, so the
 * days before its stock arrives keep their shortage. Last, every pair's uncovered requirements are
 * ranked on its balance after proposals (`rankShortages`), and every overdue supply item of a readable
 * material becomes a warning (E18-S02), which stops nothing.
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
  const unreadable = new Map<string, { record: MrpRecordKind; document?: string }>();
  const invalidSets = new Set<string>();
  // The first unreadable row of each material, by record kind, then business ID (spec Q8).
  for (const row of [...inputs.unreadable].sort((a, b) => compareCodes(a.record, b.record) || compareCodes(a.document ?? "", b.document ?? ""))) {
    const { material, location, record, document } = row;
    if (record === "planning-parameter-set") {
      invalidSets.add(pairKey(material, location));
      continue;
    }
    pairOf(material, location);
    if (!unreadable.has(material)) unreadable.set(material, { record, ...(document !== undefined && { document }) });
  }
  const transfers = planTransfers(inputs.transfers, dates, pairOf);
  for (const item of transfers.dispatches) pairOf(item.material, item.location).transfersOut.push(item);
  for (const item of transfers.receipts) pairOf(item.material, item.location).transfersIn.push(item);
  const parametersOf = new Map(inputs.planningParameters.map((set) => [pairKey(set.material, set.location), set]));
  const bomsOf = new Map<string, MrpBom[]>();
  for (const bom of inputs.boms) bomsOf.set(bom.output, [...(bomsOf.get(bom.output) ?? []), bom]);
  const proposals: MrpProposal[] = [];
  // A transfer's shortfall is measured on balances an unreadable row left incomplete, so for such a
  // material only Invalid UoM Conversion is reported: no figure from the incomplete data (#316 review).
  const exceptions: MrpException[] = transfers.exceptions.filter(({ material }) => !unreadable.has(material));
  const plans = [...pairs.values()].sort(comparePairs).map(({ flows, ...plan }): MrpPlan => {
    const key = pairKey(plan.material, plan.location);
    const replenished = replenishPair(
      { ...plan, buckets: projectBuckets(plan.physical, flows) },
      { unreadable: unreadable.get(plan.material), parameters: parametersOf.get(key), invalidSet: invalidSets.has(key), boms: bomsOf.get(plan.material) ?? [], today },
    );
    for (const proposal of replenished.proposals) {
      if (!proposal.beyondHorizon) flows[dayOf.get(proposal.plannedFinish)!].proposedReceipts += proposal.quantity;
    }
    proposals.push(...replenished.proposals);
    if (replenished.exception) exceptions.push(replenished.exception);
    const buckets = projectBuckets(plan.physical, flows);
    return { ...plan, buckets, shortages: rankShortages({ ...plan, buckets }) };
  });
  // Like Insufficient Transfer Stock, no warning for a material whose balances an unreadable row left incomplete (#316).
  const warnings = plans.filter(({ material }) => !unreadable.has(material)).flatMap(overdueWarnings).sort(compareWarnings);
  return { today, dates, plans, proposals, exceptions: exceptions.sort(compareExceptions), warnings };
}
