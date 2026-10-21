import { convertToBase, formatDecimal, ONE, parseDecimal } from "../quantities/decimal";
import { addWeekdays, lastWeekday, monthLabel, monthOfYear, monthStart, nthWeekday, type Month } from "./calendar";
import { keyedRandom, uniformMicro } from "./random";
import { byId, idsOf, type CatalogueMaterial, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * Demand (spec "Demand"): a month's total per finished product, split over the customers who buy it,
 * and placed as one customer order per customer, plant and month with its shipments. Quantities are
 * whole base units held as micro-units (R03).
 */

/** Months in a year, for growth per year. */
const MONTHS_PER_YEAR = 12n;
/** Customers order two to six weeks ahead: on weekday 12 + (customer index mod 5) of the month before. */
const ORDER_WEEKDAY = 12;
const ORDER_WEEKDAY_SPREAD = 5;
/** Required dates fall in the shipping band, weekdays 10–20, and move from month to month. */
const REQUIRED_WEEKDAY = 10;
const REQUIRED_WEEKDAY_SPREAD = 11;
const REQUIRED_MONTH_STEP = 3;
/** A split order's first shipment carries 60 % of each line; the rest follows three weekdays later. */
const FIRST_SHIPMENT_SHARE = 600_000n;
const SECOND_SHIPMENT_AFTER_WEEKDAYS = 3;
/** A shipment is created two weekdays before its planned date. */
const SHIPMENT_CREATED_WEEKDAYS_BEFORE = 2;
/** Forecasts are rounded to a multiple of five base units. */
const FORECAST_STEP = 5n * ONE;

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
  month: Month;
  customer: string;
  location: string;
  createdOn: string;
  requiredDate: string;
  lines: PlannedOrderLine[];
  shipments: PlannedShipment[];
}

/** Every customer order from the history start to next month, and what each finished product's orders total per month. */
export interface DemandPlan {
  orders: PlannedCustomerOrder[];
  ordered: Map<string, Map<Month, bigint>>;
}

/** Micro-units rounded half-up to whole units, still in micro-units. */
export function roundToWhole(micro: bigint): bigint {
  return ((micro + ONE / 2n) / ONE) * ONE;
}

/**
 * D(p, m): the product's monthly base × its season × linear growth since the history start × noise
 * drawn for (seed, calendar month, product), in whole base units, at least one.
 */
export function monthlyDemand(config: TestTenantConfig, product: string, month: Month, historyStart: Month): bigint {
  const { demand, randomSeed } = config;
  const entry = demand.products.find(({ material }) => material === product)!;
  const season = parseDecimal(demand.seasonality[entry.profile][monthOfYear(month)])!;
  const growth = MONTHS_PER_YEAR * ONE + parseDecimal(demand.growthPerYear)! * BigInt(month - historyStart);
  const noise = ONE + uniformMicro(keyedRandom(randomSeed, month, Number(product)), parseDecimal(demand.noise)!);
  const total = (parseDecimal(entry.monthlyBase)! * season * growth * noise) / (ONE * ONE * ONE * MONTHS_PER_YEAR);
  const whole = roundToWhole(total);
  return whole > ONE ? whole : ONE;
}

/**
 * `total` whole units split by `weights` (micro-units summing to 1) into whole units that sum to it
 * exactly: each share rounded down, then the units left over to the largest remainders, earliest first.
 */
export function splitByWeights(total: bigint, weights: readonly bigint[]): bigint[] {
  const units = total / ONE;
  const exact = weights.map((weight) => units * weight);
  const shares = exact.map((share) => share / ONE);
  let left = units - shares.reduce((sum, share) => sum + share, 0n);
  const byRemainder = exact.map((share, index) => ({ index, remainder: share % ONE })).sort((a, b) => Number(b.remainder - a.remainder) || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left === 0n) break;
    shares[index] += 1n;
    left -= 1n;
  }
  return shares.map((share) => share * ONE);
}

/** One `unit` of a material, in base micro-units. */
export function unitSize(material: CatalogueMaterial, unit: string): bigint {
  const conversion = material.conversions.find((candidate) => candidate.unit === unit);
  return conversion ? convertToBase(ONE, parseDecimal(conversion.numerator)!, parseDecimal(conversion.denominator)!) : ONE;
}

/** A customer's share as the line they enter: whole base units, or whole packs (at least one) for a customer who orders by the pack. */
function orderLine(config: TestTenantConfig, product: string, share: bigint, wholePacks: boolean): PlannedOrderLine {
  const material = byId(config.catalogue.materials, product)!;
  if (!wholePacks) return { material: product, base: share, quantity: formatDecimal(share), unit: material.baseUnit };
  const unit = config.demand.products.find((entry) => entry.material === product)!.enteredIn;
  const size = unitSize(material, unit);
  const packs = (2n * share + size) / (2n * size);
  const count = packs > 1n ? packs : 1n;
  return { material: product, base: count * size, quantity: String(count), unit };
}

/** The plant that makes a finished product: the configuration makes each at exactly one. */
export function plantOf(config: TestTenantConfig, product: string): string {
  return config.catalogue.production.find(({ material }) => material === product)!.location;
}

/** The finished products, in ID order. */
function finishedProducts(config: TestTenantConfig): string[] {
  return idsOf(config.catalogue.materials).filter((id) => byId(config.catalogue.materials, id)!.type === "finished");
}

/** Each customer's line per finished product in one month, keyed by customer, then product. */
function monthLines(config: TestTenantConfig, month: Month, historyStart: Month): Map<string, Map<string, PlannedOrderLine>> {
  const lines = new Map<string, Map<string, PlannedOrderLine>>(config.demand.customers.map(({ customer }) => [customer, new Map()]));
  for (const product of finishedProducts(config)) {
    const buyers = config.demand.customers.filter(({ shares }) => product in shares);
    const shares = splitByWeights(
      monthlyDemand(config, product, month, historyStart),
      buyers.map(({ shares: weights }) => parseDecimal(weights[product])!),
    );
    buyers.forEach(({ customer, wholePacks }, index) => {
      const share = shares[index] > ONE ? shares[index] : ONE;
      lines.get(customer)!.set(product, orderLine(config, product, share, wholePacks));
    });
  }
  return lines;
}

/** The order's shipments: one for everything on the required date, or a split one for every n-th order (SAL-006…009). */
export function shipmentsOf(order: Omit<PlannedCustomerOrder, "shipments" | "sequence">, isSplit: boolean): PlannedShipment[] {
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
  const later = addWeekdays(order.requiredDate, SECOND_SHIPMENT_AFTER_WEEKDAYS);
  const last = lastWeekday(order.month);
  const shipments = [shipment(1, order.requiredDate, first)];
  if (rest.length > 0) shipments.push(shipment(2, later < last ? later : last, rest));
  return shipments;
}

/**
 * Every customer order from the history start to the month after the anchor: one per customer,
 * plant and month, created in the month before, in creation sequence, with its shipments.
 */
export function planDemand(config: TestTenantConfig, anchor: Month): DemandPlan {
  const historyStart = anchor - config.horizon.historyMonths;
  const orders: PlannedCustomerOrder[] = [];
  const ordered = new Map<string, Map<Month, bigint>>(finishedProducts(config).map((product) => [product, new Map()]));
  for (let month = historyStart; month <= anchor + 1; month += 1) {
    const lines = monthLines(config, month, historyStart);
    const placed = config.demand.customers.flatMap(({ customer }, customerIndex) => {
      const byPlant = new Map<string, PlannedOrderLine[]>();
      for (const line of lines.get(customer)!.values()) {
        const plant = plantOf(config, line.material);
        byPlant.set(plant, [...(byPlant.get(plant) ?? []), line]);
        ordered.get(line.material)!.set(month, (ordered.get(line.material)!.get(month) ?? 0n) + line.base);
      }
      return [...byPlant.entries()].map(([location, plantLines]) => ({
        key: `customer-order:${monthLabel(month)}:${customer}:${location}`,
        month,
        customer,
        location,
        createdOn: nthWeekday(month - 1, ORDER_WEEKDAY + (customerIndex % ORDER_WEEKDAY_SPREAD)),
        requiredDate: nthWeekday(month, REQUIRED_WEEKDAY + ((customerIndex + REQUIRED_MONTH_STEP * month) % REQUIRED_WEEKDAY_SPREAD)),
        lines: plantLines,
      }));
    });
    placed.sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    for (const order of placed) {
      const sequence = orders.length + 1;
      orders.push({ ...order, sequence, shipments: shipmentsOf(order, sequence % config.supply.partialShipmentEvery === 0) });
    }
  }
  return { orders, ordered };
}

/**
 * The forecast for each finished product at its plant for the months after the anchor (spec
 * "Forecasts"): the mean of its last twelve history months' orders (all of them, in a shorter
 * history) × the month's season × (1 + growth per year), rounded half-up to a multiple of five, dated
 * the month's first day (Q11).
 */
export function planForecasts(config: TestTenantConfig, plan: DemandPlan, anchor: Month): { material: string; location: string; date: string; quantity: string }[] {
  const { demand, horizon } = config;
  const window = Math.min(Number(MONTHS_PER_YEAR), horizon.historyMonths);
  return [...plan.ordered.entries()].flatMap(([product, byMonth]) => {
    let total = 0n;
    for (let month = anchor - window; month < anchor; month += 1) total += byMonth.get(month)!;
    const mean = total / BigInt(window);
    const profile = demand.seasonality[demand.products.find(({ material }) => material === product)!.profile];
    const growth = ONE + parseDecimal(demand.growthPerYear)!;
    return Array.from({ length: horizon.forecastMonths }, (_, index) => {
      const month = anchor + 1 + index;
      const quantity = (mean * parseDecimal(profile[monthOfYear(month)])! * growth) / (ONE * ONE);
      const rounded = ((quantity + FORECAST_STEP / 2n) / FORECAST_STEP) * FORECAST_STEP;
      return { material: product, location: plantOf(config, product), date: monthStart(month), quantity: formatDecimal(rounded) };
    });
  });
}
