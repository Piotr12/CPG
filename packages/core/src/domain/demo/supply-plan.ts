import { formatSequentialId } from "../business-ids/sequential-id";
import { plannedStart, scaledRequirement } from "../production-orders/production-planning";
import { convertToBase, formatDecimal, ONE, parseDecimal } from "../quantities/decimal";
import { addWeekdays, monthLabel, monthStart, nthWeekday, type Month } from "./calendar";
import type { DemandPlan } from "./demand-plan";
import { byId, idsOf, type BuyParameters, type CatalogueMaterial, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * Supply (spec "Supply"): a stock model per material and plant, planned month by month the way the
 * slice 3 MRP will, order up to safety. Each month's purchases arrive in the receipt band (weekdays
 * 1–3), intermediates are completed in weekdays 4–6 and finished products in 7–9, before the month's
 * shipments (10–20), so every balance stays at or above its safety target. Quantities are base-unit
 * micro-units (R03).
 */

/** A month's purchase orders are created on weekday 2 of the month before: the plant's purchasing run. */
const PURCHASING_RUN_WEEKDAY = 2;
/** A month's production orders are created on weekday 8 of the month before: the plant's planning run. */
const PLANNING_RUN_WEEKDAY = 8;
/** The receipt band: weekday 1 + (supplier index mod 3). */
const RECEIPT_WEEKDAY = 1;
/** The completion bands: intermediates on weekday 4 + (pair index mod 3), finished products on 7 + (pair index mod 3). */
const INTERMEDIATE_COMPLETION_WEEKDAY = 4;
const FINISHED_COMPLETION_WEEKDAY = 7;
const BAND_WIDTH = 3;
/** The requisitions converted by next month's orders are created on weekday 1 of this month, the day before the purchasing run. */
const CONVERTED_REQUISITION_WEEKDAY = 1;
/** A raw material's safety covers its lead time, in months of 30 days. */
const DAYS_PER_MONTH = 30n;
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
  suppliers: readonly string[];
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
  month: Month;
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
  month: Month;
  supplier: string;
  location: string;
  createdOn: string;
  plannedDate: string;
  lines: PlannedPurchaseLine[];
}

/** A requisition converted in full by one of next month's purchase-order lines (BUY-003). */
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
  /** Every pair's balance at the end of every planned month, by pair key. */
  closing: Map<string, Map<Month, bigint>>;
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

/**
 * Every planned pair: the made pairs in catalogue order, then per plant every raw material its
 * recipes consume, alternates included, and the intermediates it buys (spec "Where things are made").
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
    suppliers: [],
    pairIndex,
  }));
  const bought = (material: string, location: string, buy: BuyParameters): PlanningPair => ({
    material,
    location,
    procurement: "buy",
    leadTimeDays: buy.leadTimeDays,
    minimum: parseDecimal(buy.minimumQuantity)!,
    multiple: parseDecimal(buy.lotMultiple)!,
    suppliers: buy.suppliers,
    pairIndex: -1,
  });
  const buy = idsOf(catalogue.locations).flatMap((location) => {
    const outputs = new Set(made.filter((pair) => pair.location === location).map(({ material }) => material));
    const raw = new Set(
      catalogue.boms
        .filter(({ output }) => outputs.has(output))
        .flatMap(({ components }) => components.map(({ material }) => material))
        .filter((material) => byId(catalogue.materials, material)!.type === "raw"),
    );
    return [
      ...[...raw].sort().map((material) => bought(material, location, byId(catalogue.materials, material)!.buy!)),
      ...catalogue.purchasedIntermediates.filter((pair) => pair.location === location).map((pair) => bought(pair.material, location, pair.buy)),
    ];
  });
  return [...made, ...buy];
}

/**
 * The average monthly production of each made pair and use of each pair over the history months:
 * a finished product's average orders, exploded through the priority-1 recipes at its plant.
 */
function averageUse(config: TestTenantConfig, demand: DemandPlan, pairs: readonly PlanningPair[], historyStart: Month, anchor: Month): Map<string, bigint> {
  const months = BigInt(anchor - historyStart);
  const use = new Map<string, bigint>();
  const usedAt = (material: string, location: string): bigint => {
    const key = pairKey(material, location);
    const known = use.get(key);
    if (known !== undefined) return known;
    const ordered = demand.ordered.get(material);
    let total = 0n;
    if (ordered) {
      for (let month = historyStart; month < anchor; month += 1) total += ordered.get(month)!;
      total /= months;
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

/** Each pair's safety-stock target from the history start, and the configured later increases (DEM-015, DEM-016). */
export function safetyTargets(config: TestTenantConfig, demand: DemandPlan, pairs: readonly PlanningPair[], anchor: Month): SafetyTarget[] {
  const historyStart = anchor - config.horizon.historyMonths;
  const { finishedMonths, intermediateMonths, rawLeadTimeFactor, laterIncreases } = config.supply.safetyStock;
  const use = averageUse(config, demand, pairs, historyStart, anchor);
  const base = pairs.map(({ material, location, leadTimeDays, multiple }): SafetyTarget => {
    const average = use.get(pairKey(material, location))!;
    const type = byId(config.catalogue.materials, material)!.type;
    let quantity: bigint;
    if (type === "raw") {
      const cover = (average * BigInt(leadTimeDays) * parseDecimal(rawLeadTimeFactor)!) / (DAYS_PER_MONTH * ONE);
      const rounded = roundUpToMultiple(cover, multiple);
      quantity = rounded > multiple ? rounded : multiple;
    } else {
      const months = parseDecimal(type === "finished" ? finishedMonths : intermediateMonths)!;
      quantity = roundUpToMultiple((average * months) / ONE, multiple);
    }
    return { material, location, effectiveFrom: monthStart(historyStart), quantity };
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
  const { type, baseUnit } = byId(config.catalogue.materials, material)!;
  return type === "raw" && VARIANCE_UNITS.has(baseUnit);
}

/** The supplier a pair buys from in a month: two suppliers alternate by month. */
function supplierIn(pair: PlanningPair, month: Month): string {
  return pair.suppliers[month % pair.suppliers.length];
}

/**
 * The supply side of the dataset as of `anchor` (the first month not fully in the past): targets,
 * opening balances, and every month's production and purchase orders from the history start to the
 * month after the anchor, planned order-up-to-safety on the stock model, with completions, variances,
 * the waste postings and the requisitions next month's orders convert.
 */
export function planSupply(config: TestTenantConfig, demand: DemandPlan, anchor: Month): SupplyPlan {
  const historyStart = anchor - config.horizon.historyMonths;
  const pairs = planningPairs(config);
  const targets = safetyTargets(config, demand, pairs, anchor);
  const made = pairs.filter(({ procurement }) => procurement === "make").sort((a, b) => depthOf(config, a.material) - depthOf(config, b.material) || a.pairIndex - b.pairIndex);
  const bought = pairs.filter(({ procurement }) => procurement === "buy");
  const stock = new Map(pairs.map(({ material, location, minimum }) => [pairKey(material, location), safetyOn(targets, pairKey(material, location), monthStart(historyStart)) + minimum]));
  const openings = new Map(idsOf(config.catalogue.locations).map((location) => [location, [] as UsedComponent[]]));
  for (const { material, location } of pairs) openings.get(location)!.push({ material, base: stock.get(pairKey(material, location))! });
  const closing = new Map(pairs.map(({ material, location }) => [pairKey(material, location), new Map<Month, bigint>()]));
  const productionOrders: PlannedProductionOrder[] = [];
  const purchaseOrders: PlannedPurchaseOrder[] = [];
  const requisitions: PlannedRequisition[] = [];
  const eligibleCompletions = new Map<string, number>();

  for (let month = historyStart; month <= anchor + 1; month += 1) {
    const monthStartDate = monthStart(month);
    const change = new Map<string, bigint>();
    const move = (key: string, quantity: bigint) => change.set(key, (change.get(key) ?? 0n) + quantity);
    const needOf = (pair: PlanningPair, use: bigint) => {
      const key = pairKey(pair.material, pair.location);
      return use + safetyOn(targets, key, monthStartDate) - stock.get(key)!;
    };

    // Production, top of the recipes first, so each intermediate covers what its users will consume.
    const consumption = new Map<string, bigint>();
    const monthOrders: PlannedProductionOrder[] = [];
    for (const pair of made) {
      const key = pairKey(pair.material, pair.location);
      // A finished product leaves in its orders' shipments; an intermediate in its users' completions.
      const outflow = demand.ordered.get(pair.material)?.get(month) ?? consumption.get(key) ?? 0n;
      const quantity = lotFor(needOf(pair, outflow), pair.minimum, pair.multiple);
      move(key, -outflow);
      if (quantity === 0n) continue;
      const recipe = recipeOf(config, pair.material);
      for (const { material, perOutput } of recipe.components) {
        const componentKey = pairKey(material, pair.location);
        consumption.set(componentKey, (consumption.get(componentKey) ?? 0n) + requirement(perOutput, quantity));
      }
      const isFinished = byId(config.catalogue.materials, pair.material)!.type === "finished";
      const finish = nthWeekday(month, (isFinished ? FINISHED_COMPLETION_WEEKDAY : INTERMEDIATE_COMPLETION_WEEKDAY) + (pair.pairIndex % BAND_WIDTH));
      monthOrders.push({
        key: `production-order:${monthLabel(month)}:${pair.material}:${pair.location}`,
        month,
        pairIndex: pair.pairIndex,
        output: pair.material,
        location: pair.location,
        quantity,
        createdOn: nthWeekday(month - 1, PLANNING_RUN_WEEKDAY),
        plannedStart: plannedStart(finish, pair.leadTimeDays),
        plannedFinish: finish,
        bom: recipe.bom,
        completions: [],
      });
      move(key, quantity);
    }

    // Completions in time order per plant, numbered for the variance rules, then the month's waste.
    monthOrders.sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish) || a.pairIndex - b.pairIndex);
    const used = new Map<string, bigint>();
    const consume = (location: string, components: readonly UsedComponent[]) => {
      for (const { material, base } of components) used.set(pairKey(material, location), (used.get(pairKey(material, location)) ?? 0n) + base);
    };
    for (const order of monthOrders) {
      const expected = expectedUse(config, order.output, order.quantity);
      let components = expected;
      if (expected.some(({ material }) => isVariable(config, material))) {
        const sequence = (eligibleCompletions.get(order.location) ?? 0) + 1;
        eligibleCompletions.set(order.location, sequence);
        components = varied(config, expected, sequence);
      }
      order.completions.push({ date: order.plannedFinish, output: order.quantity, components });
      consume(order.location, components);
    }
    if (month === anchor - config.supply.waste.monthsBeforeAnchor) {
      for (const { location, output, sheet } of config.supply.waste.orders) {
        const order = monthOrders.find((candidate) => candidate.output === output && candidate.location === location)!;
        const lot = bought.find((pair) => pair.material === sheet && pair.location === location)!.multiple;
        const components = recipeOf(config, output).components.map(({ material }) => ({ material, base: material === sheet ? lot : 0n }));
        order.completions.unshift({ date: addWeekdays(order.plannedFinish, -1), output: 0n, components });
        consume(location, components);
      }
    }
    productionOrders.push(...monthOrders);

    // Purchases: what the month's completions use, plus safety, less stock; grouped per supplier and plant.
    const lines = new Map<string, PlannedPurchaseLine[]>();
    for (const pair of bought) {
      const key = pairKey(pair.material, pair.location);
      const consumed = used.get(key) ?? 0n;
      move(key, -consumed);
      let quantity = lotFor(needOf(pair, consumed), pair.minimum, pair.multiple);
      const converts = month === anchor + 1 && config.supply.requisitions.converted.some((request) => request.material === pair.material && request.location === pair.location);
      if (converts && quantity < pair.multiple) quantity = pair.multiple;
      if (quantity === 0n) continue;
      move(key, quantity);
      const supplier = supplierIn(pair, month);
      const line: PlannedPurchaseLine = { material: pair.material, base: quantity };
      if (converts) {
        line.requisition = `requisition:${monthLabel(anchor)}:${pair.material}:${pair.location}`;
        requisitions.push({
          key: line.requisition,
          material: pair.material,
          location: pair.location,
          base: quantity,
          createdOn: nthWeekday(anchor, CONVERTED_REQUISITION_WEEKDAY),
          requiredDate: receiptDate(supplier, month),
        });
      }
      const orderKey = pairKey(supplier, pair.location);
      lines.set(orderKey, [...(lines.get(orderKey) ?? []), line]);
    }
    const monthPurchases = [...lines.entries()].map(([orderKey, orderLines]): PlannedPurchaseOrder => {
      const [supplier, location] = orderKey.split("@");
      return {
        key: `purchase-order:${monthLabel(month)}:${supplier}:${location}`,
        month,
        supplier,
        location,
        createdOn: nthWeekday(month - 1, PURCHASING_RUN_WEEKDAY),
        plannedDate: receiptDate(supplier, month),
        lines: orderLines.sort((a, b) => a.material.localeCompare(b.material)),
      };
    });
    purchaseOrders.push(...monthPurchases.sort((a, b) => a.location.localeCompare(b.location) || a.supplier.localeCompare(b.supplier)));

    for (const [key, quantity] of change) stock.set(key, stock.get(key)! + quantity);
    for (const [key, balance] of stock) closing.get(key)!.set(month, balance);
  }
  return { pairs, safetyTargets: targets, openings, productionOrders, purchaseOrders, requisitions, closing };
}

/** A supplier's receipt date in a month: the receipt band, weekday 1 + (supplier index mod 3). */
function receiptDate(supplier: string, month: Month): string {
  return nthWeekday(month, RECEIPT_WEEKDAY + ((Number(supplier) - 1) % BAND_WIDTH));
}
