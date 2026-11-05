import { firmDemand } from "./demand/firm-demand";
import { forecastDemand } from "./demand/forecast-demand";
import { safetyLevels } from "./demand/safety-levels";
import { isUsableRevision } from "../boms/bom-validity";
import { isProcurementAllowed } from "../planning-parameters/procurement";
import type { MrpBom, MrpInputs, MrpRecordKind } from "./mrp-inputs";
import type {
  MrpComponentDemand,
  MrpException,
  MrpFirmDemand,
  MrpForecastDemand,
  MrpPlan,
  MrpDemandShare,
  MrpPlannedComponentDemand,
  MrpProductionOutput,
  MrpProposal,
  MrpProvisionalAction,
  MrpProvisionalBlocker,
  MrpResult,
  MrpShortage,
  MrpSupply,
  MrpTransferMovement,
} from "./mrp-result";
import { horizonDates, MRP_HORIZON_DAYS } from "./projection/horizon";
import { compareCodes, comparePairs, pairKey } from "./projection/pairs";
import { emptyFlows, lowestDependableBalances, projectBuckets, type MrpLedger } from "./projection/project-buckets";
import { pegProposals } from "./priority/peg-proposals";
import { rankShortages } from "./priority/rank-shortages";
import { productionMovements } from "./supply/production-orders";
import { purchasingSupply } from "./supply/purchasing-supply";
import { compareExceptions } from "./exceptions/compare-exceptions";
import { bomLevels } from "./explosion/bom-levels";
import { chooseBom, type BomChoice } from "./explosion/choose-bom";
import { explodeProposal } from "./explosion/explode-proposal";
import { replenishPair, type TimedProposal } from "./sizing/replenish-pair";
import { scheduleProposal } from "./sizing/schedule-proposal";
import { planTransfers } from "./supply/transfers";
import { lateRequisitionWarnings } from "./warnings/late-requisition";
import { compareWarnings, overdueWarnings } from "./warnings/overdue";

/**
 * How an exploded proposal's needs count in its components (E17-S02 Q4, E17-S03, #369): a feasible proposal
 * `claim`s them; an infeasible one's are `real` demand its components are sized for, or `provisional` when
 * it would stay infeasible even if they were supplied. Neither of the last two counts in a feasibility test.
 */
type NeedKind = "claim" | "real" | "provisional";

interface PairDraft extends MrpLedger {
  material: string;
  location: string;
  firmDemand: MrpFirmDemand[];
  forecastDemand: MrpForecastDemand[];
  supply: MrpSupply[];
  productionOutput: MrpProductionOutput[];
  atRiskOutput: MrpProductionOutput[];
  componentDemand: MrpComponentDemand[];
  plannedComponentDemand: MrpPlannedComponentDemand[];
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
 * ranked on its balance after proposals (`rankShortages`), on the first read of its `shortages`, and every
 * overdue supply item of a readable material becomes a warning (E18-S02), which stops nothing.
 *
 * Pairs are sized level by level (E17-S01, PRD §04 "Multilevel explosion"): by their material's low-level
 * code (`bomLevels`), then material and location. Each production-order proposal is exploded through its
 * BOM (`explodeProposal`) into its components' dependent demand on its planned start, at its location,
 * before any component is sized, so a component nets the needs of every parent and open production order
 * once, in its one projection (MRP-020, MRP-029). It comes after `planTransfers`, so a proposal never cuts
 * an open transfer (#277's later-seams rule). A material on a cycle of BOMs gets BOM Cycle on its Make
 * pairs and never explodes, so the levels terminate (MRP-028). Plans and proposals keep their order.
 *
 * Each production-order proposal plans through `chooseBom`'s BOM (E17-S02, PRD §04 "BOM choice and
 * explanation"): the highest-priority usable BOM whose every component can give the lot-rounded need from
 * the proposal's start, by `lowestDependableBalances`. That counts stock and dependable supply only, net of
 * open documents' and earlier choices' needs (spec Q1). Within a level every pair is sized first, then the
 * level's proposals choose in E16-S02's order for planned components, earliest start first, each claiming
 * its components before the next (Q5); a higher level always claims first (Q12). A proposal no usable BOM
 * can supply raises No Feasible BOM and is kept, exploded through its highest-priority usable BOM, so its
 * components still plan (BOM-011); its needs count in their projections but in no later feasibility test
 * (Q4).
 *
 * Such a proposal is a provisional action (E17-S03, PRD §04 "Multilevel explosion"), in `provisional`, never
 * in `proposals`: its receipt is never booked, so its shortage stays visible after proposals. Its needs are
 * real demand when MRP can supply every component it is short of (`canSupply`, #369): making them is what
 * lets it run, so a Make component gets executable proposals for them once its own inputs are there.
 * Otherwise they are provisional, as are all needs of an action sized for provisional demand. A Make pair is
 * sized again for the provisional demand its parents left it (`replenishPair`), and those proposals are
 * provisional too, chosen after every claim of the level and never claiming, so the mark carries down the
 * chain to the purchased level, whose requisitions stay executable. An open production order pinning an
 * inactive component is at risk: its output is at-risk supply, which no balance counts, raised as
 * At-Risk Production, and sizing adds it back so no proposal replaces it (MRP-051).
 *
 * Before a level's proposals claim, each Make pair's proposals are traced to the requirements they serve
 * (`pegProposals`, #327): the order lines, forecasts, open documents' needs and target of the pair, or the
 * root requirements a parent's share carries down. Each component need is split into those shares, so a short
 * component ranks each share as its root requirement, through every level (PRD §04, MRP-044).
 */
export function planMrp(inputs: MrpInputs, today: string): MrpResult {
  const dates = horizonDates(today);
  const dayOf = new Map(dates.map((date, day) => [date, day]));
  const { levelOf, cycles } = bomLevels(inputs.boms);
  let lastLevel = 0;
  for (const level of levelOf.values()) if (level > lastLevel) lastLevel = level;
  /** Every pair, under its material's level, as `pairOf` creates it: a material without BOM edges is level 0. */
  const byLevel: PairDraft[][] = Array.from({ length: lastLevel + 1 }, () => []);
  const pairs = new Map<string, PairDraft>();
  const pairOf = (material: string, location: string): PairDraft => {
    const key = pairKey(material, location);
    let pair = pairs.get(key);
    if (!pair) {
      const lists = { firmDemand: [], forecastDemand: [], supply: [], productionOutput: [], atRiskOutput: [], componentDemand: [], plannedComponentDemand: [], transfersOut: [], transfersIn: [] };
      pair = { material, location, physical: 0n, flows: dates.map(emptyFlows), ...lists };
      pairs.set(key, pair);
      byLevel[levelOf.get(material) ?? 0].push(pair);
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
  for (const item of production.atRisk) {
    const pair = pairOf(item.material, item.location);
    pair.flows[dayOf.get(item.date)!].atRiskSupply += item.quantity;
    pair.atRiskOutput.push(item);
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
  // At-Risk Existing Production (E17-S03 spec Q4): one per at-risk order counted inside the horizon, like a transfer's.
  const inactiveOf = new Map(inputs.productionOrders.map((order) => [order.order, order.inactiveComponents]));
  for (const { order, material, location, plannedFinish: date, quantity } of production.atRisk) {
    if (!unreadable.has(material)) exceptions.push({ code: "AT_RISK_PRODUCTION", material, location, date, order, quantity, inactiveComponents: inactiveOf.get(order)! });
  }
  const provisional: MrpProvisionalAction[] = [];
  const plans: MrpPlan[] = [];
  /** Each pair's dependent demand from infeasible proposals by day (E17-S02 spec Q4): in its projection, never in a feasibility test. */
  const excludedOf = new Map<string, bigint[]>();
  /** The provisional part of it (E17-S03), which the pair's executable proposals never cover (#369). */
  const provisionalOf = new Map<string, bigint[]>();
  const noneExcluded: readonly bigint[] = dates.map(() => 0n);
  /**
   * Each tested component's `lowestDependableBalances`, computed once and dropped when a feasible choice
   * claims from it. An excluded need is added to its demand and its exclusion alike, so it changes nothing.
   */
  const lowestOf = new Map<string, bigint[]>();
  /**
   * What a component at `location` can still give a proposal starting on `day` (spec Q1): nothing when an
   * unreadable row left its balances incomplete (Q9), or when nothing names its pair. It never creates one.
   */
  const availableOf = (material: string, location: string, day: number): bigint => {
    const key = pairKey(material, location);
    const pair = pairs.get(key);
    if (!pair || unreadable.has(material)) return 0n;
    let lowest = lowestOf.get(key);
    if (!lowest) lowestOf.set(key, (lowest = lowestDependableBalances(pair, excludedOf.get(key) ?? noneExcluded)));
    return lowest[day];
  };
  /**
   * Whether MRP can give `material` at `location` executable supply for a need on `date` (#369): its rows are
   * readable, and its pair has a usable planning parameter set, Buy, or Make off any BOM cycle with a usable BOM
   * valid on the planned finish of a proposal for that need, the day `replenishPair` checks. Each of
   * `replenishPair`'s exceptions stops all of that pair's proposals, so a parent short of it can't run.
   */
  const canSupply = (material: string, location: string, date: string): boolean => {
    const key = pairKey(material, location);
    const parameters = parametersOf.get(key);
    if (!parameters || unreadable.has(material) || invalidSets.has(key) || !isProcurementAllowed(parameters.materialType, parameters.procurement)) return false;
    if (parameters.procurement === "buy") return true;
    const { plannedFinish } = scheduleProposal(date, parameters.leadTimeDays, today, MRP_HORIZON_DAYS);
    return !cycles.has(material) && (bomsOf.get(material) ?? []).some((bom) => isUsableRevision(bom, bom.inactiveComponents.length === 0, plannedFinish));
  };
  const add = (byDay: Map<string, bigint[]>, key: string, day: number, quantity: bigint) => {
    (byDay.get(key) ?? byDay.set(key, dates.map(() => 0n)).get(key)!)[day] += quantity;
  };
  // A component's level is above every parent's, so a level's explosions only add to later levels, and its
  // pairs can all be sized before any of its proposals claims a component.
  for (const level of byLevel) {
    const sized = level.sort(comparePairs).map((draft) => {
      const key = pairKey(draft.material, draft.location);
      const buckets = projectBuckets(draft.physical, draft.flows);
      const replenished = replenishPair(
        { ...draft, buckets },
        {
          unreadable: unreadable.get(draft.material),
          parameters: parametersOf.get(key),
          invalidSet: invalidSets.has(key),
          boms: bomsOf.get(draft.material) ?? [],
          today,
          cycle: cycles.get(draft.material),
          provisional: provisionalOf.get(key) ?? null,
        },
      );
      return { draft, buckets, replenished };
    });
    // Every pair of the level is complete: only a lower level explodes into it. Traced before any claim, on the
    // sized quantities and need dates, so feasibility changes no share (#327).
    const sharesOf = new Map<TimedProposal, readonly MrpDemandShare[]>();
    for (const { draft, buckets, replenished } of sized) {
      const makes = replenished.proposals.filter(({ kind }) => kind === "production-order");
      if (makes.length === 0 && replenished.provisional.length === 0) continue;
      const pegged = pegProposals({ ...draft, buckets }, makes, replenished.provisional);
      makes.forEach((proposal, index) => sharesOf.set(proposal, pegged.proposals[index]));
      replenished.provisional.forEach((proposal, index) => sharesOf.set(proposal, pegged.provisional[index]));
    }
    const book = (proposal: TimedProposal) => {
      if (!proposal.beyondHorizon) pairs.get(pairKey(proposal.material, proposal.location))!.flows[dayOf.get(proposal.plannedFinish)!].proposedReceipts += proposal.quantity;
    };
    const makes: TimedProposal[] = [];
    const provisionalMakes: TimedProposal[] = [];
    for (const { replenished } of sized) {
      for (const proposal of replenished.proposals) {
        if (proposal.kind === "production-order") makes.push(proposal);
        else {
          book(proposal);
          proposals.push({ ...proposal, bom: null, bomRevision: null, feasible: null, rejectedBoms: [] });
        }
      }
      provisionalMakes.push(...replenished.provisional);
    }
    /**
     * Explodes `proposal` through `bom` into its components' dependent demand, counted as `need` says. A
     * feasible one's claim drops the components' cached balances; an infeasible one's needs go into their
     * `excludedOf`, so no feasibility test counts them, and a provisional one's into `provisionalOf` too.
     */
    const explode = (proposal: TimedProposal, bom: MrpBom, need: NeedKind) => {
      const items = explodeProposal(proposal, bom, need === "provisional", sharesOf.get(proposal)!);
      for (const item of items) {
        const key = pairKey(item.material, item.location);
        const component = pairOf(item.material, item.location);
        const day = dayOf.get(item.date)!;
        component.flows[day].dependentDemand += item.quantity;
        component.plannedComponentDemand.push(item);
        if (need === "claim") {
          lowestOf.delete(key);
          continue;
        }
        add(excludedOf, key, day, item.quantity);
        if (need === "provisional") add(provisionalOf, key, day, item.quantity);
      }
      return items.map(({ material, quantity }) => ({ material, quantity })).sort((x, y) => compareCodes(x.material, y.material));
    };
    /** A Make proposal that can't execute, as a provisional action (E17-S03): never booked, never claiming. */
    const keep = (proposal: TimedProposal, choice: BomChoice, blockers: MrpProvisionalBlocker[], need: Exclude<NeedKind, "claim">) => {
      const { material, location, needDate, quantity, leadTimeDays, plannedStart, plannedFinish, lateDays, beyondHorizon } = proposal;
      const components = explode(proposal, choice.bom, need);
      provisional.push({
        kind: "production-order", material, location, needDate, quantity, leadTimeDays, plannedStart, plannedFinish, lateDays, beyondHorizon,
        bom: choice.bom.bom, bomRevision: choice.bom.revision, components, blockers, rejectedBoms: choice.rejected,
      });
    };
    const choose = (proposal: TimedProposal) => {
      const start = dayOf.get(proposal.plannedStart)!;
      return chooseBom(proposal, bomsOf.get(proposal.material)!, (component) => availableOf(component, proposal.location, start));
    };
    // E16-S02's order for planned components (#281 Q9): the earlier start claims first (spec Q5).
    const claimOrder = (a: TimedProposal, b: TimedProposal) => compareCodes(a.plannedStart, b.plannedStart) || comparePairs(a, b) || compareCodes(a.needDate, b.needDate);
    for (const proposal of makes.sort(claimOrder)) {
      const choice = choose(proposal);
      if (choice.feasible) {
        book(proposal);
        explode(proposal, choice.bom, "claim");
        proposals.push({ ...proposal, bom: choice.bom.bom, bomRevision: choice.bom.revision, feasible: true, rejectedBoms: choice.rejected });
        continue;
      }
      // Real demand for its components when MRP can supply all it is short of, so making them is what lets it run (#369).
      const { material, location, needDate: date, plannedStart } = proposal;
      keep(proposal, choice, ["no-feasible-bom"], choice.shortages.every((short) => canSupply(short.material, location, plannedStart)) ? "real" : "provisional");
      exceptions.push({ code: "NO_FEASIBLE_BOM", material, location, date, rejections: choice.rejected });
    }
    // What only provisional needs drive, after every claim of the level, in the same order: chosen, never claiming (E17-S03 Q7).
    for (const proposal of provisionalMakes.sort(claimOrder)) {
      const choice = choose(proposal);
      keep(proposal, choice, choice.feasible ? ["provisional-demand"] : ["no-feasible-bom", "provisional-demand"], "provisional");
    }
    for (const { draft, replenished } of sized) {
      const { flows, ...plan } = draft;
      if (replenished.exception) exceptions.push(replenished.exception);
      const buckets = projectBuckets(plan.physical, flows);
      // Like its warnings, no ranked shortage from balances an unreadable row left incomplete (#316, #380 spec Q11).
      plans.push(withShortages({ ...plan, buckets }, unreadable.has(plan.material)));
    }
  }
  plans.sort(comparePairs);
  proposals.sort((a, b) => comparePairs(a, b) || compareCodes(a.needDate, b.needDate));
  // A total order on content: on one pair and day, the action sized for real demand comes first. Insertion order
  // already gives it, since a level's infeasible proposals are kept before its provisional ones; this states it.
  const drivenByParent = (action: MrpProvisionalAction) => (action.blockers.includes("provisional-demand") ? 1 : 0);
  provisional.sort((a, b) => comparePairs(a, b) || compareCodes(a.needDate, b.needDate) || drivenByParent(a) - drivenByParent(b));
  // Like Insufficient Transfer Stock, no warning for a material whose balances an unreadable row left incomplete (#316).
  const warnings = plans
    .filter(({ material }) => !unreadable.has(material))
    .flatMap((plan) => [...overdueWarnings(plan), ...lateRequisitionWarnings(plan, parametersOf.get(pairKey(plan.material, plan.location)), today)])
    .sort(compareWarnings);
  return { today, dates, plans, proposals, provisional, exceptions: exceptions.sort(compareExceptions), warnings };
}

/**
 * `plan` with its `shortages` ranked on first read, then kept (#327): the run ranks them while it writes them (#380),
 * pair by pair, so it can yield in between, and ranking every pair's root shares is a large part of a run. The value
 * never depends on when it is read. An unreadable material's plans have none (spec Q11).
 */
function withShortages(plan: Omit<MrpPlan, "shortages">, unreadable: boolean): MrpPlan {
  let shortages: MrpShortage[] | undefined;
  return Object.defineProperty({ ...plan } as MrpPlan, "shortages", { enumerable: true, get: () => (shortages ??= unreadable ? [] : rankShortages(plan)) });
}
