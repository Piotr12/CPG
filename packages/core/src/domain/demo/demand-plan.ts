import { convertToBase, formatDecimal, ONE, parseDecimal } from "../quantities/decimal";
import { addDays, addMonths, addWeekdays, dayNumber, daysInMonth, isoWeekday, isWeekday, mondayOf, monthEnd, monthOf, monthStart, weekdaysFrom, type Month } from "./calendar";
import { sharesOf } from "./customer-shares";
import { keyedUniform } from "./random";
import { byId, DEMAND_WEEKDAYS_PAST_MONTH, finishedProducts, MONTHS_PER_YEAR, type CatalogueMaterial, type DemandCustomer, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * Demand (single-site spec "Demand"): a daily series D(sku, day) on every weekday, split into each
 * buyer's stream, and cut into customer orders on the buyers' delivery days, with a few projects on
 * top. The model works in floating point and rounds once, to whole base units; quantities handed on
 * are micro-units (R03).
 */

/** The days in a year, on average: the trend and the customers' shares move with fractional years. */
const DAYS_PER_YEAR = 365.25;
const QUARTERS_PER_YEAR = 4;
const DAYS_PER_WEEK = 7;
/** The key families of the random draws, so a drift draw and a noise draw never share a key. */
const DRIFT_DRAW = 1;
const NOISE_DRAW = 2;
/** A split order's first shipment carries 60 % of each line; the rest follows three weekdays later. */
const FIRST_SHIPMENT_SHARE = 600_000n;
const SECOND_SHIPMENT_AFTER_WEEKDAYS = 3;
/** A shipment is created two weekdays before its planned date. */
const SHIPMENT_CREATED_WEEKDAYS_BEFORE = 2;

/** One customer-order line: its base quantity, and the quantity and unit as the customer entered it. */
export interface PlannedOrderLine {
  material: string;
  base: bigint;
  quantity: string;
  unit: string;
}

/** One shipment of an order: lines by 0-based order-line index, in base units. */
export interface PlannedShipment {
  key: string;
  createdOn: string;
  plannedDate: string;
  lines: { orderLine: number; base: bigint }[];
}

/** One customer order, with its place in the creation sequence (1-based) and its shipments. */
export interface PlannedCustomerOrder {
  key: string;
  sequence: number;
  customer: string;
  location: string;
  createdOn: string;
  requiredDate: string;
  lines: PlannedOrderLine[];
  shipments: PlannedShipment[];
}

/** An order before it has its place in the creation sequence and its shipments. */
type UnsequencedOrder = Omit<PlannedCustomerOrder, "sequence" | "shipments">;

/** The daily demand from the history start to some weeks past the anchor month, its customers' streams, and the orders cut from them. */
export interface DemandPlan {
  historyStart: string;
  /** The weekdays demand is generated for, in order. */
  days: string[];
  /** D(sku, day) in whole units, aligned with `days`. */
  demand: Map<string, number[]>;
  /** Each customer's stream of each SKU it buys, in whole units, aligned with `days`: a SKU's streams sum to its D every day. */
  streams: Map<string, Map<string, number[]>>;
  /** Every customer order, projects included, in creation sequence. */
  orders: PlannedCustomerOrder[];
}

/** One SKU's demand parameters, parsed once per configuration. */
interface ProductModel {
  /** Units per weekday at the history start: its type's base × its colour mix. */
  base: number;
  typeIndex: number;
  profile: number[];
}

interface DemandModel {
  products: Map<string, ProductModel>;
  weekday: number[];
  growth: number;
  noise: number;
  drift: { weeks: number; decay: number; amplitude: number };
}

const MODELS = new WeakMap<TestTenantConfig, DemandModel>();

/** The configuration's demand parameters as numbers, worked out once per configuration object. */
function modelOf(config: TestTenantConfig): DemandModel {
  const known = MODELS.get(config);
  if (known) return known;
  const { demand } = config;
  const products = new Map(
    demand.products.map(({ material, type, mix }): [string, ProductModel] => {
      const typeIndex = demand.types.findIndex(({ name }) => name === type);
      const { baseDaily, profile } = demand.types[typeIndex];
      return [material, { base: Number(baseDaily) * Number(mix), typeIndex, profile: demand.seasonality[profile].map(Number) }];
    }),
  );
  const model: DemandModel = {
    products,
    weekday: demand.weekday.map(Number),
    growth: Number(demand.growthPerYear),
    noise: Number(demand.noise),
    drift: { weeks: demand.drift.weeks, decay: Number(demand.drift.decay), amplitude: Number(demand.drift.amplitude) },
  };
  MODELS.set(config, model);
  return model;
}

/** The years from the history start to `date`, as a fraction: the trend's exponent. */
export function yearsSince(historyStart: string, date: string): number {
  return (dayNumber(date) - dayNumber(historyStart)) / DAYS_PER_YEAR;
}

/** The middle of a month, in days since 1970-01-01. */
function midpoint(month: Month): number {
  return dayNumber(monthStart(month)) + daysInMonth(month) / 2;
}

/**
 * A monthly profile on `date`: each month's value holds at its mid-point, and a day between two
 * mid-points is interpolated linearly, so a month boundary has no step.
 */
export function seasonOn(profile: readonly number[], date: string): number {
  const middayOf = dayNumber(date) + 0.5;
  const month = monthOf(date);
  const from = middayOf < midpoint(month) ? month - 1 : month;
  const weight = (middayOf - midpoint(from)) / (midpoint(from + 1) - midpoint(from));
  return profile[from % MONTHS_PER_YEAR] * (1 - weight) + profile[(from + 1) % MONTHS_PER_YEAR] * weight;
}

/**
 * The expected demand for every finished product on a weekday, before rounding: base × mix × season ×
 * weekday × (1 + growth per year)^years since the history start. No drift, noise or project: the
 * forecast. The day's factors are worked out once for all products.
 */
export function expectedDemandOn(config: TestTenantConfig, date: string, historyStart: string): Map<string, number> {
  const model = modelOf(config);
  const day = model.weekday[isoWeekday(date) - 1] * (1 + model.growth) ** yearsSince(historyStart, date);
  const seasons = new Map<number, number>();
  const expected = new Map<string, number>();
  for (const [product, { base, typeIndex, profile }] of model.products) {
    if (!seasons.has(typeIndex)) seasons.set(typeIndex, seasonOn(profile, date));
    expected.set(product, base * seasons.get(typeIndex)! * day);
  }
  return expected;
}

/**
 * A furniture type's slow drift in the week of `date`: 1 + a decaying moving average of keyed weekly
 * shocks, each uniform in ±amplitude. It is an average, not a recursion, so a week's value doesn't
 * depend on where the history starts, and it stays within ±amplitude.
 */
export function driftOf(config: TestTenantConfig, typeIndex: number, date: string): number {
  const { weeks, decay, amplitude } = modelOf(config).drift;
  const monday = dayNumber(mondayOf(date));
  let sum = 0;
  let norm = 0;
  for (let back = 0; back < weeks; back += 1) {
    const weight = decay ** back;
    sum += weight * keyedUniform(config.randomSeed, [DRIFT_DRAW, monday - DAYS_PER_WEEK * back, typeIndex], amplitude);
    norm += weight;
  }
  return 1 + sum / norm;
}

/**
 * D(sku, day) for every finished product: the expected demand × its type's drift × (1 + noise drawn
 * for the day and SKU), rounded half-up to whole units.
 */
export function dailyDemandOn(config: TestTenantConfig, date: string, historyStart: string): Map<string, number> {
  const model = modelOf(config);
  const drifts = new Map<number, number>();
  const demand = new Map<string, number>();
  for (const [product, expected] of expectedDemandOn(config, date, historyStart)) {
    const { typeIndex } = model.products.get(product)!;
    if (!drifts.has(typeIndex)) drifts.set(typeIndex, driftOf(config, typeIndex, date));
    const noise = keyedUniform(config.randomSeed, [NOISE_DRAW, dayNumber(date), Number(product)], model.noise);
    demand.set(product, Math.round(expected * drifts.get(typeIndex)! * (1 + noise)));
  }
  return demand;
}

/**
 * Each day's total split over the buyers in whole units that sum to it exactly: every buyer is owed
 * its exact share, and each unit goes to the buyer owed the most, earliest first. A buyer's running
 * total so stays within a unit of its exact running share, even on a SKU that sells one a day.
 */
export function splitIntoStreams(totals: readonly number[], sharesOn: (day: number) => readonly number[]): number[][] {
  const buyers = sharesOn(0).length;
  const streams = Array.from({ length: buyers }, () => new Array<number>(totals.length).fill(0));
  const owed = new Array<number>(buyers).fill(0);
  totals.forEach((total, day) => {
    sharesOn(day).forEach((share, buyer) => (owed[buyer] += total * share));
    for (let unit = 0; unit < total; unit += 1) {
      let pick = 0;
      for (let buyer = 1; buyer < buyers; buyer += 1) if (owed[buyer] > owed[pick]) pick = buyer;
      streams[pick][day] += 1;
      owed[pick] -= 1;
    }
  });
  return streams;
}

/** One `unit` of a material, in base micro-units. */
export function unitSize(material: CatalogueMaterial, unit: string): bigint {
  const conversion = material.conversions.find((candidate) => candidate.unit === unit);
  return conversion ? convertToBase(ONE, parseDecimal(conversion.numerator)!, parseDecimal(conversion.denominator)!) : ONE;
}

/** The plant that makes a finished product: the configuration makes each at exactly one. */
export function plantOf(config: TestTenantConfig, product: string): string {
  return config.catalogue.production.find(({ material }) => material === product)!.location;
}

/** The whole packs a customer orders against `owed` base micro-units, rounded half-up: none when less than half a pack is owed. */
function packsFor(owed: bigint, size: bigint): bigint {
  return (2n * owed + size) / (2n * size);
}

/** A line of `base` micro-units entered in the material's base unit. */
function baseLine(config: TestTenantConfig, material: string, base: bigint): PlannedOrderLine {
  return { material, base, quantity: formatDecimal(base), unit: byId(config.catalogue.materials, material)!.baseUnit };
}

/** A line of whole packs in the unit the product is entered in. */
function packLine(config: TestTenantConfig, material: string, packs: bigint): PlannedOrderLine {
  const unit = config.demand.products.find((entry) => entry.material === material)!.enteredIn;
  return { material, base: packs * unitSize(byId(config.catalogue.materials, material)!, unit), quantity: String(packs), unit };
}

/** The pack size a product is entered in, in base micro-units. */
function packSize(config: TestTenantConfig, material: string): bigint {
  return unitSize(byId(config.catalogue.materials, material)!, config.demand.products.find((entry) => entry.material === material)!.enteredIn);
}

/** Orders for `lines` on one delivery day, one per plant that makes them. */
function ordersFor(config: TestTenantConfig, key: string, customer: string, requiredDate: string, createdOn: string, lines: PlannedOrderLine[]): UnsequencedOrder[] {
  const byPlant = new Map<string, PlannedOrderLine[]>();
  for (const line of lines) {
    const plant = plantOf(config, line.material);
    byPlant.set(plant, [...(byPlant.get(plant) ?? []), line]);
  }
  return [...byPlant].map(([location, plantLines]) => ({ key: `${key}:${location}`, customer, location, createdOn, requiredDate, lines: plantLines }));
}

/**
 * A customer's orders: one per delivery day, holding its streams from that day up to its next
 * delivery day, required on the day and created its lead time earlier. A whole-pack customer orders
 * whole packs, carrying what rounding leaves into its next order, so its running total stays within
 * half a pack of its streams. A delivery with nothing to order is skipped, and so is the last one,
 * whose period the demand doesn't cover.
 */
function streamOrders(config: TestTenantConfig, plan: Pick<DemandPlan, "days" | "streams">, entry: DemandCustomer): UnsequencedOrder[] {
  const { customer, deliveryDays, leadWorkingDays, wholePacks } = entry;
  const streams = plan.streams.get(customer)!;
  const products = finishedProducts(config).filter((sku) => streams.has(sku));
  const owed = new Map(products.map((sku) => [sku, 0n]));
  const deliveries = plan.days.flatMap((day, index) => (deliveryDays.includes(isoWeekday(day)) ? [index] : []));
  return deliveries.slice(0, -1).flatMap((from, at) => {
    const to = deliveries[at + 1];
    const lines = products.flatMap((sku): PlannedOrderLine[] => {
      const units = streams.get(sku)!.slice(from, to).reduce((sum, value) => sum + value, 0);
      if (!wholePacks) return units > 0 ? [baseLine(config, sku, BigInt(units) * ONE)] : [];
      const due = owed.get(sku)! + BigInt(units) * ONE;
      const packs = packsFor(due, packSize(config, sku));
      const line = packs > 0n ? packLine(config, sku, packs) : undefined;
      owed.set(sku, due - (line?.base ?? 0n));
      return line ? [line] : [];
    });
    const day = plan.days[from];
    return lines.length === 0 ? [] : ordersFor(config, `customer-order:${day}:${customer}`, customer, day, addWeekdays(day, -leadWorkingDays), lines);
  });
}

/** The first weekday on or after `date`. */
function weekdayOnOrAfter(date: string): string {
  return isWeekday(date) ? date : weekdayOnOrAfter(addDays(date, 1));
}

/**
 * The projects (spec "Customer orders"): each configured one once a year, delivered on the first
 * weekday on or after its day of the year, holding `days` weekdays of its SKU's demand from there,
 * in whole packs (at least one) for a whole-pack customer. Only projects whose days the demand covers.
 */
function projectOrders(config: TestTenantConfig, plan: Pick<DemandPlan, "days" | "demand">): UnsequencedOrder[] {
  const first = Number(plan.days[0].slice(0, 4));
  const last = Number(plan.days.at(-1)!.slice(0, 4));
  return config.demand.projects.flatMap(({ customer, material, date, days }, project) => {
    const entry = config.demand.customers.find((candidate) => candidate.customer === customer)!;
    return Array.from({ length: last - first + 1 }, (_, offset) => weekdayOnOrAfter(`${first + offset}-${date}`)).flatMap((day) => {
      const start = plan.days.indexOf(day);
      if (start < 0 || start + days > plan.days.length) return [];
      const units = BigInt(plan.demand.get(material)!.slice(start, start + days).reduce((sum, value) => sum + value, 0)) * ONE;
      const packs = packsFor(units, packSize(config, material));
      const line = entry.wholePacks ? packLine(config, material, packs > 1n ? packs : 1n) : baseLine(config, material, units);
      return ordersFor(config, `customer-order:project:${project + 1}:${day}:${customer}:${material}`, customer, day, addWeekdays(day, -entry.leadWorkingDays), [line]);
    });
  });
}

/** The order's shipments: one for everything on the required date, or a split one for every n-th order (SAL-006…009). */
export function shipmentsOf(order: UnsequencedOrder, isSplit: boolean): PlannedShipment[] {
  const shipment = (index: number, plannedDate: string, lines: PlannedShipment["lines"]): PlannedShipment => ({
    key: `${order.key}:shipment-${index}`,
    createdOn: addWeekdays(plannedDate, -SHIPMENT_CREATED_WEEKDAYS_BEFORE),
    plannedDate,
    lines,
  });
  if (!isSplit) return [shipment(1, order.requiredDate, order.lines.map(({ base }, orderLine) => ({ orderLine, base })))];
  const first = order.lines.map(({ base }, orderLine) => {
    const part = ((base / ONE) * FIRST_SHIPMENT_SHARE) / ONE;
    return { orderLine, base: (part > 1n ? part : 1n) * ONE };
  });
  const rest = first.map(({ orderLine, base }) => ({ orderLine, base: order.lines[orderLine].base - base })).filter(({ base }) => base > 0n);
  const shipments = [shipment(1, order.requiredDate, first)];
  if (rest.length > 0) shipments.push(shipment(2, addWeekdays(order.requiredDate, SECOND_SHIPMENT_AFTER_WEEKDAYS), rest));
  return shipments;
}

/**
 * The demand as of `anchor` (the month of today): D for every weekday from the history start to some
 * weeks past the month, split into the customers' streams by their shares on the day, and the
 * customer orders cut from the streams plus the projects, in creation sequence with their shipments.
 */
export function planDemand(config: TestTenantConfig, anchor: Month): DemandPlan {
  const historyStart = monthStart(anchor - config.horizon.historyMonths);
  const days = weekdaysFrom(historyStart, addWeekdays(monthEnd(anchor), DEMAND_WEEKDAYS_PAST_MONTH));
  const quarters = days.map((day) => yearsSince(historyStart, day) * QUARTERS_PER_YEAR);
  const daily = days.map((day) => dailyDemandOn(config, day, historyStart));
  const demand = new Map(finishedProducts(config).map((sku) => [sku, daily.map((onDay) => onDay.get(sku)!)]));
  const streams = new Map(config.demand.customers.map(({ customer }) => [customer, new Map<string, number[]>()]));
  for (const [sku, totals] of demand) {
    const buyers = sharesOf(config.demand, sku, 0).map(({ customer }) => customer);
    const split = splitIntoStreams(totals, (day) => sharesOf(config.demand, sku, quarters[day]).map(({ share }) => share));
    buyers.forEach((customer, index) => streams.get(customer)!.set(sku, split[index]));
  }
  const plan = { historyStart, days, demand, streams };
  const unsequenced = [...config.demand.customers.flatMap((entry) => streamOrders(config, plan, entry)), ...projectOrders(config, plan)];
  unsequenced.sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.requiredDate.localeCompare(b.requiredDate) || a.key.localeCompare(b.key));
  const orders = unsequenced.map((order, index) => {
    const sequence = index + 1;
    return { ...order, sequence, shipments: shipmentsOf(order, sequence % config.supply.partialShipmentEvery === 0) };
  });
  return { ...plan, orders };
}

/** The forecast's days as of `today` (spec "Forecasts"): from the day after it through the same date `forecastMonths` on. */
export function forecastWindow(config: TestTenantConfig, today: string): { first: string; last: string } {
  return { first: addDays(today, 1), last: addMonths(today, config.horizon.forecastMonths) };
}

/**
 * The forecast (spec "Forecasts"): for each finished product at its plant, one row per weekday from
 * `first` through `last`, holding the expected demand rounded half-up to whole units; days that round
 * to nothing are left out. A perfect forecast of the model's mean, so the history's noise shows as
 * forecast error once those days have passed. Rows are by product, then date.
 */
export function planForecasts(config: TestTenantConfig, first: string, last: string, historyStart: string): { material: string; location: string; date: string; quantity: string }[] {
  const expected = weekdaysFrom(first, last).map((date) => ({ date, demand: expectedDemandOn(config, date, historyStart) }));
  return finishedProducts(config).flatMap((material) => {
    const location = plantOf(config, material);
    return expected.flatMap(({ date, demand }) => {
      const quantity = Math.round(demand.get(material)!);
      return quantity > 0 ? [{ material, location, date, quantity: String(quantity) }] : [];
    });
  });
}
