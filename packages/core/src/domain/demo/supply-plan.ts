import { formatSequentialId } from "../business-ids/sequential-id";
import { plannedStart, scaledRequirement } from "../production-orders/production-planning";
import { convertToBase, formatDecimal, ONE, parseDecimal } from "../quantities/decimal";
import { addDays, addWeekdays, mondayOf, monthEnd, monthOf, monthStart, type Month } from "./calendar";
import type { DemandPlan } from "./demand-plan";
import { byId, idsOf, type CatalogueMaterial, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * Supply (single-site spec "Supply (weekly)"): a stock model per material and plant, planned week by
 * week, order up to safety, the way the slice 3 MRP will. At each Thursday's planning run the next
 * week's production and purchase orders are created. Within a week, purchases arrive on Monday (the
 * first supplier) or Tuesday (the second), intermediates are completed on Monday or Tuesday and
 * finished products on Wednesday or Thursday, and shipments leave every weekday. Each replenishment
 * covers what leaves its pair in the seven days from it, plus safety, less what is in stock, so every
 * balance stays at or above its safety target. Quantities are base-unit micro-units (R03).
 */

const DAYS_PER_WEEK = 7;
/** Intermediates are completed on Monday or Tuesday, finished products on Wednesday or Thursday: days after the week's Monday. */
const INTERMEDIATE_COMPLETION_OFFSET = 0;
const FINISHED_COMPLETION_OFFSET = 2;
/** Each band is two days wide: a made pair takes the band's day by its catalogue index, a supplier by its ID. */
const BAND_WIDTH = 2;
/** The weeks planned run this many days past the anchor month, so every order created in the month covers its whole window. */
const WEEKS_PAST_MONTH_DAYS = 14;
/** A raw material's safety covers its lead time in calendar days, five of every seven of which are working days. */
const WORKING_DAYS = 5n;
/** Consumption variances are measured in tenths of a kilogram or litre. */
const VARIANCE_STEP = ONE / 10n;
/** The units a variance applies to: sheet, paint, powder coat and wire. */
const VARIANCE_UNITS = new Set(["kg", "l"]);

/** One planned pair (MAT-016): what a plant makes or buys, and how. `pairIndex` is a made pair's place in the catalogue. */
export interface PlanningPair {
  material: string;
  location: string;
  procurement: "make" | "buy";
  leadTimeDays: number;
  minimum: bigint;
  multiple: bigint;
  /** The one supplier a bought material comes from (spec Q4); null for a made one. */
  supplier: string | null;
  pairIndex: number;
}

/** One component a completion used, in base units. */
export interface UsedComponent {
  material: string;
  base: bigint;
}

/** A completion of a production order: a full one, or a zero-output waste posting (PRD-018). */
export interface PlannedCompletion {
  date: string;
  output: bigint;
  components: UsedComponent[];
}

export interface PlannedProductionOrder {
  key: string;
  /** The Monday of the week the order is made in. */
  week: string;
  pairIndex: number;
  output: string;
  location: string;
  quantity: bigint;
  createdOn: string;
  plannedStart: string;
  plannedFinish: string;
  /** The priority-1 BOM's business ID; its one revision is 1. */
  bom: string;
  completions: PlannedCompletion[];
}

export interface PlannedPurchaseLine {
  material: string;
  base: bigint;
  requisition?: string;
}

export interface PlannedPurchaseOrder {
  key: string;
  /** The Monday of the week the order is received in. */
  week: string;
  supplier: string;
  location: string;
  createdOn: string;
  plannedDate: string;
  lines: PlannedPurchaseLine[];
}

/** A requisition converted in full by a purchase order of the last planning run before the anchor month (BUY-003). */
export interface PlannedRequisition {
  key: string;
  material: string;
  location: string;
  base: bigint;
  createdOn: string;
  requiredDate: string;
}

export interface SafetyTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: bigint;
}

export interface SupplyPlan {
  pairs: PlanningPair[];
  safetyTargets: SafetyTarget[];
  /** Each plant's opening balance lines, by location ID. */
  openings: Map<string, UsedComponent[]>;
  productionOrders: PlannedProductionOrder[];
  purchaseOrders: PlannedPurchaseOrder[];
  requisitions: PlannedRequisition[];
}

/** The key of a material at a location. */
export function pairKey(material: string, location: string): string {
  return `${material}@${location}`;
}

/** `quantity` rounded up to a whole number of `multiple`s. */
export function roundUpToMultiple(quantity: bigint, multiple: bigint): bigint {
  return ((quantity + multiple - 1n) / multiple) * multiple;
}

/** The larger of two quantities. */
export function largerOf(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** The smaller of two quantities. */
export function smallerOf(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** The lot that covers `need`: nothing when nothing is needed, else the need rounded up to the multiple and at least the minimum. */
export function lotFor(need: bigint, minimum: bigint, multiple: bigint): bigint {
  if (need <= 0n) return 0n;
  const rounded = roundUpToMultiple(need, multiple);
  return rounded > minimum ? rounded : minimum;
}

/** An entered quantity of a material in its base unit, converted as the services convert it (MAT-019). */
export function toBase(material: CatalogueMaterial, quantity: bigint, unit: string): bigint {
  const conversion = material.conversions.find((candidate) => candidate.unit === unit);
  return conversion ? convertToBase(quantity, parseDecimal(conversion.numerator)!, parseDecimal(conversion.denominator)!) : quantity;
}

/** The priority-1 recipe of a made material: its BOM's business ID and each component per one output, in base units. */
export function recipeOf(config: TestTenantConfig, output: string): { bom: string; components: { material: string; perOutput: bigint }[] } {
  const { boms, materials } = config.catalogue;
  const index = boms.findIndex((bom) => bom.output === output && bom.priority === 1);
  return {
    bom: formatSequentialId(index + 1),
    components: boms[index].components.map(({ material, quantity, unit }) => ({
      material,
      perOutput: toBase(byId(materials, material)!, parseDecimal(quantity)!, unit),
    })),
  };
}

/** What `output` base units of a recipe's output need of a component: rounded up once, as the services expect it (BOM-007). */
function requirement(perOutput: bigint, output: bigint): bigint {
  return scaledRequirement(formatDecimal(perOutput), formatDecimal(output));
}

/** What a completion of `quantity` of `output` is expected to use of each priority-1 recipe component (PRD-010). */
export function expectedUse(config: TestTenantConfig, output: string, quantity: bigint): UsedComponent[] {
  return recipeOf(config, output).components.map(({ material, perOutput }) => ({ material, base: requirement(perOutput, quantity) }));
}

/** Whether a material is raw: bought, never made. */
function isRaw(config: TestTenantConfig, material: string): boolean {
  return byId(config.catalogue.materials, material)!.type === "raw";
}

/**
 * Every planned pair: the made pairs in catalogue order, then per plant every raw material its
 * recipes consume, alternates included, bought from its one supplier (spec "Supply").
 */
export function planningPairs(config: TestTenantConfig): PlanningPair[] {
  const { catalogue } = config;
  const made = catalogue.production.map((pair, pairIndex): PlanningPair => ({
    material: pair.material,
    location: pair.location,
    procurement: "make",
    leadTimeDays: pair.leadTimeDays,
    minimum: parseDecimal(pair.minimumQuantity)!,
    multiple: parseDecimal(pair.lotMultiple)!,
    supplier: null,
    pairIndex,
  }));
  const bought = idsOf(catalogue.locations).flatMap((location) => {
    const outputs = new Set(made.filter((pair) => pair.location === location).map(({ material }) => material));
    const raw = new Set(
      catalogue.boms
        .filter(({ output }) => outputs.has(output))
        .flatMap(({ components }) => components.map(({ material }) => material))
        .filter((material) => isRaw(config, material)),
    );
    return [...raw].sort().map((material): PlanningPair => {
      const buy = byId(catalogue.materials, material)!.buy!;
      return {
        material,
        location,
        procurement: "buy",
        leadTimeDays: buy.leadTimeDays,
        minimum: parseDecimal(buy.minimumQuantity)!,
        multiple: parseDecimal(buy.lotMultiple)!,
        supplier: buy.supplier,
        pairIndex: -1,
      };
    });
  });
  return [...made, ...bought];
}

/**
 * The average use of each pair per weekday of the history: a finished product's average daily demand,
 * exploded through the priority-1 recipes at its plant.
 */
function averageUse(config: TestTenantConfig, demand: DemandPlan, pairs: readonly PlanningPair[], anchorStart: string): Map<string, bigint> {
  const history = demand.days.filter((day) => day < anchorStart).length;
  const use = new Map<string, bigint>();
  const usedAt = (material: string, location: string): bigint => {
    const key = pairKey(material, location);
    const known = use.get(key);
    if (known !== undefined) return known;
    const daily = demand.demand.get(material);
    let total = 0n;
    if (daily) {
      total = (BigInt(daily.slice(0, history).reduce((sum, units) => sum + units, 0)) * ONE) / BigInt(history);
    } else {
      for (const pair of pairs.filter((candidate) => candidate.procurement === "make" && candidate.location === location)) {
        const component = recipeOf(config, pair.material).components.find((line) => line.material === material);
        if (component) total += (usedAt(pair.material, location) * component.perOutput) / ONE;
      }
    }
    use.set(key, total);
    return total;
  };
  for (const { material, location } of pairs) usedAt(material, location);
  return use;
}

/**
 * Each pair's safety-stock target from the history start (DEM-015): finished products cover
 * `finishedDays` weekdays of average demand, intermediates `intermediateDays` of average use, and raw
 * materials their lead time's use × the factor; each rounded up to the lot multiple and at least one.
 * Then the configured later increases (DEM-016).
 */
export function safetyTargets(config: TestTenantConfig, demand: DemandPlan, pairs: readonly PlanningPair[], anchor: Month): SafetyTarget[] {
  const { finishedDays, intermediateDays, rawLeadTimeFactor, laterIncreases } = config.supply.safetyStock;
  const use = averageUse(config, demand, pairs, monthStart(anchor));
  const base = pairs.map(({ material, location, leadTimeDays, multiple }): SafetyTarget => {
    const average = use.get(pairKey(material, location))!;
    const type = byId(config.catalogue.materials, material)!.type;
    let cover: bigint;
    if (type === "raw") cover = (average * BigInt(leadTimeDays) * parseDecimal(rawLeadTimeFactor)! * WORKING_DAYS) / (BigInt(DAYS_PER_WEEK) * ONE);
    else cover = average * BigInt(type === "finished" ? finishedDays : intermediateDays);
    return { material, location, effectiveFrom: demand.historyStart, quantity: largerOf(roundUpToMultiple(cover, multiple), multiple) };
  });
  const later = laterIncreases.map(({ material, location, monthsAfterAnchor, factor }): SafetyTarget => {
    const pair = pairs.find((candidate) => candidate.material === material && candidate.location === location)!;
    const from = base.find((target) => target.material === material && target.location === location)!;
    return {
      material,
      location,
      effectiveFrom: monthStart(anchor + monthsAfterAnchor),
      quantity: roundUpToMultiple((from.quantity * parseDecimal(factor)!) / ONE, pair.multiple),
    };
  });
  return [...base, ...later];
}

/** The target of a pair in force on `date`, on or after the history start: the latest that has started. */
function safetyOn(targets: readonly SafetyTarget[], key: string, date: string): bigint {
  let inForce: SafetyTarget | undefined;
  for (const target of targets) {
    if (pairKey(target.material, target.location) === key && target.effectiveFrom <= date && (!inForce || target.effectiveFrom > inForce.effectiveFrom)) inForce = target;
  }
  return inForce!.quantity;
}

/** How far down the recipes a material sits: finished products 0, their components below them. */
function depthOf(config: TestTenantConfig, material: string): number {
  const users = config.catalogue.boms.filter(({ components }) => components.some((line) => line.material === material));
  return users.length === 0 ? 0 : 1 + Math.max(...users.map(({ output }) => depthOf(config, output)));
}

/**
 * A completion's component use: what the recipe expects, with the plant's n-th eligible completion
 * using more (every `varianceEvery`-th) or less (every `underConsumptionEvery`-th, which wins) of its
 * first raw component measured in kg or l, by a share rounded up to a tenth (PRD-013, PRD-014).
 */
export function varied(config: TestTenantConfig, expected: readonly UsedComponent[], sequence: number): UsedComponent[] {
  const { varianceEvery, underConsumptionEvery, overConsumption, underConsumption } = config.supply;
  const isUnder = sequence % underConsumptionEvery === 0;
  if (!isUnder && sequence % varianceEvery !== 0) return [...expected];
  const index = expected.findIndex(({ material }) => isVariable(config, material));
  const { material, base } = expected[index];
  const share = (base * parseDecimal(isUnder ? underConsumption : overConsumption)!) / ONE;
  const delta = roundUpToMultiple(share, VARIANCE_STEP);
  const actual = isUnder ? base - delta : base + delta;
  return expected.map((line, at) => (at === index ? { material, base: actual > 0n ? actual : 0n } : line));
}

/** Whether a variance can apply to a material: a raw material measured in kg or l. */
function isVariable(config: TestTenantConfig, material: string): boolean {
  return isRaw(config, material) && VARIANCE_UNITS.has(byId(config.catalogue.materials, material)!.baseUnit);
}

/** What leaves a pair before a date, from its dated outflows: a lookup over running totals. */
function leavingBefore(outflows: ReadonlyMap<string, bigint>): (date: string) => bigint {
  const dated = [...outflows].sort(([a], [b]) => a.localeCompare(b));
  const totals: bigint[] = [];
  let total = 0n;
  for (const [, quantity] of dated) totals.push((total += quantity));
  return (date) => {
    let low = 0;
    let high = dated.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (dated[middle][0] < date) low = middle + 1;
      else high = middle;
    }
    return low === 0 ? 0n : totals[low - 1];
  };
}

/**
 * A pair's replenishments at `events` (one date a week), order up to safety: each covers what leaves
 * in the seven days from its date, plus the target then in force, less the balance just before it,
 * in a lot (at least `atLeast(index)`). The opening balance is the first target plus a minimum lot
 * plus whatever leaves before the first replenishment, so no balance starts short.
 */
function replenish(
  pair: PlanningPair,
  targets: readonly SafetyTarget[],
  historyStart: string,
  events: readonly string[],
  outflows: ReadonlyMap<string, bigint>,
  atLeast: (index: number) => bigint,
): { opening: bigint; quantities: bigint[] } {
  const key = pairKey(pair.material, pair.location);
  const leaving = leavingBefore(outflows);
  const opening = safetyOn(targets, key, historyStart) + pair.minimum + leaving(events[0]);
  let supplied = 0n;
  const quantities = events.map((date, index) => {
    const balance = opening + supplied - leaving(date);
    const need = leaving(addDays(date, DAYS_PER_WEEK)) - leaving(date) + safetyOn(targets, key, date) - balance;
    const quantity = largerOf(lotFor(need, pair.minimum, pair.multiple), atLeast(index));
    supplied += quantity;
    return quantity;
  });
  return { opening, quantities };
}

/**
 * The supply side of the dataset as of `anchor` (the month of today): targets, opening balances, and
 * every week's production and purchase orders from the first week of the history to two weeks past
 * the anchor month, planned order-up-to-safety on the stock model, with completions, variances, the
 * waste posting and the requisitions the last purchasing run before the anchor month converts, so
 * they exist on every day of the month.
 */
export function planSupply(config: TestTenantConfig, demand: DemandPlan, anchor: Month): SupplyPlan {
  const { historyStart } = demand;
  const pairs = planningPairs(config);
  const targets = safetyTargets(config, demand, pairs, anchor);
  const firstMonday = mondayOf(historyStart) < historyStart ? addDays(mondayOf(historyStart), DAYS_PER_WEEK) : historyStart;
  const weeks: string[] = [];
  for (let monday = firstMonday; monday <= addDays(monthEnd(anchor), WEEKS_PAST_MONTH_DAYS); monday = addDays(monday, DAYS_PER_WEEK)) weeks.push(monday);
  const planningRun = (monday: string) => addDays(monday, config.supply.planningWeekday - 1 - DAYS_PER_WEEK);

  const outflows = new Map(pairs.map(({ material, location }) => [pairKey(material, location), new Map<string, bigint>()]));
  const leave = (material: string, location: string, date: string, quantity: bigint) => {
    const dated = outflows.get(pairKey(material, location))!;
    dated.set(date, (dated.get(date) ?? 0n) + quantity);
  };
  for (const order of demand.orders) {
    for (const shipment of order.shipments) for (const { orderLine, base } of shipment.lines) leave(order.lines[orderLine].material, order.location, shipment.plannedDate, base);
  }
  const openings = new Map(idsOf(config.catalogue.locations).map((location) => [location, [] as UsedComponent[]]));
  const opened = new Map<string, bigint>();

  // Production, top of the recipes first, so each intermediate covers what its users' completions take.
  const made = pairs.filter(({ procurement }) => procurement === "make").sort((a, b) => depthOf(config, a.material) - depthOf(config, b.material) || a.pairIndex - b.pairIndex);
  const productionOrders: PlannedProductionOrder[] = [];
  for (const pair of made) {
    const offset = (byId(config.catalogue.materials, pair.material)!.type === "finished" ? FINISHED_COMPLETION_OFFSET : INTERMEDIATE_COMPLETION_OFFSET) + (pair.pairIndex % BAND_WIDTH);
    const finishes = weeks.map((monday) => addDays(monday, offset));
    const { opening, quantities } = replenish(pair, targets, historyStart, finishes, outflows.get(pairKey(pair.material, pair.location))!, () => 0n);
    opened.set(pairKey(pair.material, pair.location), opening);
    const recipe = recipeOf(config, pair.material);
    quantities.forEach((quantity, index) => {
      if (quantity === 0n) return;
      const finish = finishes[index];
      for (const { material, perOutput } of recipe.components) if (!isRaw(config, material)) leave(material, pair.location, finish, requirement(perOutput, quantity));
      productionOrders.push({
        key: `production-order:${weeks[index]}:${pair.material}:${pair.location}`,
        week: weeks[index],
        pairIndex: pair.pairIndex,
        output: pair.material,
        location: pair.location,
        quantity,
        createdOn: planningRun(weeks[index]),
        plannedStart: plannedStart(finish, pair.leadTimeDays),
        plannedFinish: finish,
        bom: recipe.bom,
        completions: [],
      });
    });
  }

  // Completions in time order per plant, numbered for the variance rules, then the waste posting.
  productionOrders.sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish) || a.pairIndex - b.pairIndex);
  const eligible = new Map<string, number>();
  for (const order of productionOrders) {
    const expected = expectedUse(config, order.output, order.quantity);
    let components = expected;
    if (expected.some(({ material }) => isVariable(config, material))) {
      const sequence = (eligible.get(order.location) ?? 0) + 1;
      eligible.set(order.location, sequence);
      components = varied(config, expected, sequence);
    }
    order.completions.push({ date: order.plannedFinish, output: order.quantity, components });
  }
  const wasteMonth = anchor - config.supply.waste.monthsBeforeAnchor;
  for (const { location, output, sheet } of config.supply.waste.orders) {
    const order = productionOrders.find((candidate) => candidate.output === output && candidate.location === location && monthOf(candidate.plannedFinish) === wasteMonth);
    if (!order) continue; // A history too short to reach the waste month (tiny's) has no waste posting.
    const lot = pairs.find((pair) => pair.material === sheet && pair.location === location)!.multiple;
    const components = recipeOf(config, output).components.map(({ material }) => ({ material, base: material === sheet ? lot : 0n }));
    order.completions.unshift({ date: addWeekdays(order.plannedFinish, -1), output: 0n, components });
  }
  for (const order of productionOrders) {
    for (const { date, components } of order.completions) for (const { material, base } of components) if (isRaw(config, material)) leave(material, order.location, date, base);
  }

  // Purchases: what the week's completions use, plus safety, less stock; one order per supplier, plant and week.
  const converting = weeks.findLastIndex((monday) => planningRun(monday) < monthStart(anchor));
  const requisitions: PlannedRequisition[] = [];
  const lines = new Map<string, PlannedPurchaseLine[]>();
  for (const pair of pairs.filter(({ procurement }) => procurement === "buy")) {
    const supplier = pair.supplier!;
    const receipts = weeks.map((monday) => addDays(monday, (Number(supplier) - 1) % BAND_WIDTH));
    const converts = config.supply.requisitions.converted.some((request) => request.material === pair.material && request.location === pair.location);
    const { opening, quantities } = replenish(pair, targets, historyStart, receipts, outflows.get(pairKey(pair.material, pair.location))!, (index) =>
      converts && index === converting ? pair.multiple : 0n,
    );
    opened.set(pairKey(pair.material, pair.location), opening);
    quantities.forEach((base, index) => {
      if (base === 0n) return;
      const line: PlannedPurchaseLine = { material: pair.material, base };
      if (converts && index === converting) {
        line.requisition = `requisition:${weeks[index]}:${pair.material}:${pair.location}`;
        requisitions.push({
          key: line.requisition,
          material: pair.material,
          location: pair.location,
          base,
          createdOn: addWeekdays(planningRun(weeks[index]), -1),
          requiredDate: receipts[index],
        });
      }
      const orderKey = `${weeks[index]}@${supplier}@${pair.location}`;
      lines.set(orderKey, [...(lines.get(orderKey) ?? []), line]);
    });
  }
  const purchaseOrders = [...lines.entries()]
    .map(([orderKey, orderLines]): PlannedPurchaseOrder => {
      const [week, supplier, location] = orderKey.split("@");
      return {
        key: `purchase-order:${week}:${supplier}:${location}`,
        week,
        supplier,
        location,
        createdOn: planningRun(week),
        plannedDate: addDays(week, (Number(supplier) - 1) % BAND_WIDTH),
        lines: orderLines.sort((a, b) => a.material.localeCompare(b.material)),
      };
    })
    .sort((a, b) => a.week.localeCompare(b.week) || a.location.localeCompare(b.location) || a.supplier.localeCompare(b.supplier));

  for (const { material, location } of pairs) openings.get(location)!.push({ material, base: opened.get(pairKey(material, location))! });
  return { pairs, safetyTargets: targets, openings, productionOrders, purchaseOrders, requisitions };
}
