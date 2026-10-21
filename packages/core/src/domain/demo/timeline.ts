import { formatDecimal, ONE } from "../quantities/decimal";
import { addDays, addWeekdays, monthOf, monthStart, nthWeekday, type Month } from "./calendar";
import type { DemandPlan, PlannedCustomerOrder } from "./demand-plan";
import { Ledger } from "./ledger";
import { expectedUse, largerOf, smallerOf, type PlannedProductionOrder, type PlannedPurchaseOrder, type SupplyPlan } from "./supply-plan";
import { byId, idsOf, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * The dataset's timeline (spec "The dataset", "Today: what is open"): every document created and
 * every posting made, dated, in the order the seeder writes them. Materials, locations, customers,
 * suppliers and BOMs are referenced by business ID; documents by the generator's `key`, which the
 * seeder maps to the IDs the services assign. Quantities are decimal strings (R03), and `at` is an
 * ISO-8601 UTC timestamp at the spec's time of day for its kind.
 */

type Line = { material: string; quantity: string; unit: string };

export type TimelineEvent =
  | { kind: "opening"; at: string; location: string; lines: Line[] }
  | { kind: "customerOrder"; at: string; key: string; customer: string; location: string; lines: (Line & { requiredDate: string })[] }
  | { kind: "shipment"; at: string; key: string; order: string; plannedDate: string; lines: { orderLine: number; quantity: string; unit: string }[] }
  | { kind: "goodsIssue"; at: string; shipment: string; lines: { line: number; quantity: string; unit: string }[] }
  | { kind: "requisition"; at: string; key: string; material: string; location: string; quantity: string; unit: string; requiredDate: string }
  | { kind: "purchaseOrder"; at: string; key: string; supplier: string; location: string; lines: (Line & { plannedDate: string; requisition?: string })[] }
  | { kind: "goodsReceipt"; at: string; order: string; lines: { line: number; quantity: string; unit: string }[] }
  | { kind: "productionOrder"; at: string; key: string; output: string; location: string; quantity: string; unit: string; plannedFinish: string; bom: string; revision: number }
  | { kind: "completion"; at: string; order: string; quantity: string; unit: string; components: Line[] };

/** An event before its time of day is set. */
export type Unstamped = TimelineEvent extends infer E ? (E extends TimelineEvent ? Omit<E, "at"> : never) : never;

/**
 * The time slots of a day, in seconds after midnight UTC (spec "Times of day"): creations at 08:00,
 * opening balances at 08:30, receipts at 09:00, completions at 13:00 and goods issues at 15:00. Each
 * event adds its index within its slot in seconds, so timestamps are unique and increase.
 */
const SLOT = { creation: 8 * 3600, opening: 8 * 3600 + 1800, receipt: 9 * 3600, completion: 13 * 3600, issue: 15 * 3600 } as const;
type Slot = keyof typeof SLOT;

/** The order of creations within a day: what is referenced first, and the documents tied to today last. */
const CREATION_RANK = { requisition: 0, purchaseOrder: 1, productionOrder: 2, customerOrder: 3, shipment: 4, topUp: 5, openRequisition: 6 } as const;

/** An event placed on a day, with what orders it within the day. */
export interface DatedEvent {
  date: string;
  slot: Slot;
  rank: number;
  order: number;
  event: Unstamped;
}

/** Everything the plans for one anchor month put on the calendar, in timeline order: the same for every day of that month. */
export interface AnchorPlan {
  anchor: Month;
  demand: DemandPlan;
  supply: SupplyPlan;
  events: DatedEvent[];
}

/** The purchase-order line's 1-based position the partial receipt takes: the first (spec "Today"). */
const PARTIAL_RECEIPT_LINE = 1;
/** Open requisitions were created two weekdays ago; top-up orders three weekdays ago (spec "Today"). */
const OPEN_REQUISITION_WEEKDAYS_AGO = 2;
const TOP_UP_WEEKDAYS_AGO = 3;
/** Open requisitions are required a week after the first weekday of next month. */
const OPEN_REQUISITION_DAYS_AFTER = 7;

function byDayOrder(a: DatedEvent, b: DatedEvent): number {
  return a.date.localeCompare(b.date) || SLOT[a.slot] - SLOT[b.slot] || a.rank - b.rank || a.order - b.order;
}

const baseUnitOf = (config: TestTenantConfig, material: string) => byId(config.catalogue.materials, material)!.baseUnit;

function customerOrderEvent(order: PlannedCustomerOrder): Unstamped {
  return {
    kind: "customerOrder",
    key: order.key,
    customer: order.customer,
    location: order.location,
    lines: order.lines.map(({ material, quantity, unit }) => ({ material, quantity, unit, requiredDate: order.requiredDate })),
  };
}

function shipmentEvent(config: TestTenantConfig, order: PlannedCustomerOrder, key: string, plannedDate: string, lines: { orderLine: number; base: bigint }[]): Unstamped {
  return {
    kind: "shipment",
    key,
    order: order.key,
    plannedDate,
    lines: lines.map(({ orderLine, base }) => ({ orderLine, quantity: formatDecimal(base), unit: baseUnitOf(config, order.lines[orderLine].material) })),
  };
}

function issueEvent(config: TestTenantConfig, order: PlannedCustomerOrder, shipment: string, lines: { orderLine: number; base: bigint }[]): Unstamped {
  return {
    kind: "goodsIssue",
    shipment,
    lines: lines.map(({ orderLine, base }, index) => ({ line: index + 1, quantity: formatDecimal(base), unit: baseUnitOf(config, order.lines[orderLine].material) })),
  };
}

function purchaseOrderEvent(config: TestTenantConfig, order: PlannedPurchaseOrder): Unstamped {
  return {
    kind: "purchaseOrder",
    key: order.key,
    supplier: order.supplier,
    location: order.location,
    lines: order.lines.map(({ material, base, requisition }) => ({
      material,
      quantity: formatDecimal(base),
      unit: baseUnitOf(config, material),
      plannedDate: order.plannedDate,
      ...(requisition ? { requisition } : {}),
    })),
  };
}

function receiptEvent(config: TestTenantConfig, order: PlannedPurchaseOrder, lines: number[]): Unstamped {
  return {
    kind: "goodsReceipt",
    order: order.key,
    lines: lines.map((line) => ({ line, quantity: formatDecimal(order.lines[line - 1].base), unit: baseUnitOf(config, order.lines[line - 1].material) })),
  };
}

function completionEvent(config: TestTenantConfig, order: PlannedProductionOrder, output: bigint, components: { material: string; base: bigint }[]): Unstamped {
  return {
    kind: "completion",
    order: order.key,
    quantity: formatDecimal(output),
    unit: baseUnitOf(config, order.output),
    components: components.map(({ material, base }) => ({ material, quantity: formatDecimal(base), unit: baseUnitOf(config, material) })),
  };
}

/**
 * Every creation and posting the plans for `anchor` put on the calendar, from the setup month's
 * opening balances to next month's orders, in timeline order. Nothing here depends on the day within
 * the anchor month; `buildTimeline` cuts it at today.
 */
export function planEvents(config: TestTenantConfig, demand: DemandPlan, supply: SupplyPlan, anchor: Month): AnchorPlan {
  const events: DatedEvent[] = [];
  const add = (date: string, slot: Slot, rank: number, event: Unstamped) => events.push({ date, slot, rank, order: events.length, event });
  const setupDate = monthStart(anchor - config.horizon.historyMonths - 1);
  for (const location of idsOf(config.catalogue.locations)) {
    const lines = supply.openings.get(location)!.map(({ material, base }) => ({ material, quantity: formatDecimal(base), unit: baseUnitOf(config, material) }));
    add(setupDate, "opening", 0, { kind: "opening", location, lines });
  }
  for (const requisition of supply.requisitions) {
    add(requisition.createdOn, "creation", CREATION_RANK.requisition, {
      kind: "requisition",
      key: requisition.key,
      material: requisition.material,
      location: requisition.location,
      quantity: formatDecimal(requisition.base),
      unit: baseUnitOf(config, requisition.material),
      requiredDate: requisition.requiredDate,
    });
  }
  for (const order of supply.purchaseOrders) {
    add(order.createdOn, "creation", CREATION_RANK.purchaseOrder, purchaseOrderEvent(config, order));
    add(order.plannedDate, "receipt", 0, receiptEvent(config, order, order.lines.map((_, index) => index + 1)));
  }
  for (const order of supply.productionOrders) {
    add(order.createdOn, "creation", CREATION_RANK.productionOrder, {
      kind: "productionOrder",
      key: order.key,
      output: order.output,
      location: order.location,
      quantity: formatDecimal(order.quantity),
      unit: baseUnitOf(config, order.output),
      plannedFinish: order.plannedFinish,
      bom: order.bom,
      revision: 1,
    });
    for (const completion of order.completions) add(completion.date, "completion", 0, completionEvent(config, order, completion.output, completion.components));
  }
  for (const order of demand.orders) {
    add(order.createdOn, "creation", CREATION_RANK.customerOrder, customerOrderEvent(order));
    for (const shipment of order.shipments) {
      add(shipment.createdOn, "creation", CREATION_RANK.shipment, shipmentEvent(config, order, shipment.key, shipment.plannedDate, shipment.lines));
      add(shipment.plannedDate, "issue", 0, issueEvent(config, order, shipment.key, shipment.lines));
    }
  }
  return { anchor, demand, supply, events: events.sort(byDayOrder) };
}

/** The documents created relative to today (spec "Today"): one overdue top-up order per plant, and the open requisitions. */
function todayRelativeCreations(config: TestTenantConfig, plan: AnchorPlan, today: string): DatedEvent[] {
  const topUpDate = addWeekdays(today, -TOP_UP_WEEKDAYS_AGO);
  const topUps = config.supply.topUps.map(({ location, material }, order): DatedEvent => {
    const pair = plan.supply.pairs.find((candidate) => candidate.procurement === "buy" && candidate.material === material && candidate.location === location)!;
    return {
      date: topUpDate,
      slot: "creation",
      rank: CREATION_RANK.topUp,
      order,
      event: {
        kind: "purchaseOrder",
        key: `purchase-order:top-up:${location}`,
        supplier: pair.suppliers[monthOf(topUpDate) % pair.suppliers.length],
        location,
        lines: [{ material, quantity: formatDecimal(pair.multiple), unit: baseUnitOf(config, material), plannedDate: topUpDate }],
      },
    };
  });
  const requiredDate = addDays(nthWeekday(monthOf(today) + 1, 1), OPEN_REQUISITION_DAYS_AFTER);
  const requisitions = config.supply.requisitions.open.map(({ material, location, quantity, unit }, order): DatedEvent => ({
    date: addWeekdays(today, -OPEN_REQUISITION_WEEKDAYS_AGO),
    slot: "creation",
    rank: CREATION_RANK.openRequisition,
    order,
    event: { kind: "requisition", key: `requisition:open:${material}:${location}`, material, location, quantity, unit, requiredDate },
  }));
  return [...topUps, ...requisitions];
}

/** Per location, the candidates in the order given: the first `count` of each plant. */
function firstPerLocation<T extends { location: string }>(candidates: readonly T[], count: number): T[][] {
  const byLocation = new Map<string, T[]>();
  for (const candidate of candidates) byLocation.set(candidate.location, [...(byLocation.get(candidate.location) ?? []), candidate]);
  return [...byLocation.values()].map((list) => list.slice(0, count));
}

/**
 * Today's partial documents (spec "Today: what is open"), each capped by the stock `ledger` holds at
 * its moment: per plant, the first open purchase order receives its first line; the first order in
 * progress completes half its quantity (in lot multiples, as much as its components allow); the first
 * open customer order with no shipment yet ships half of every line (as much as is in stock), and the
 * second gets a shipment for everything, created today and not issued.
 */
function todaysDocuments(config: TestTenantConfig, plan: AnchorPlan, today: string, ledger: Ledger): DatedEvent[] {
  const events: DatedEvent[] = [];
  const add = (slot: Slot, event: Unstamped) => {
    events.push({ date: today, slot, rank: CREATION_RANK.shipment, order: events.length, event });
    ledger.apply(event);
  };

  const receivable = plan.supply.purchaseOrders.filter((order) => order.createdOn < today && order.plannedDate >= today);
  receivable.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  for (const [order] of firstPerLocation(receivable, 1)) add("receipt", receiptEvent(config, order, [PARTIAL_RECEIPT_LINE]));

  const inProgress = plan.supply.productionOrders.filter((order) => order.createdOn < today && order.plannedStart <= today && today <= order.plannedFinish);
  inProgress.sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish));
  for (const [order] of firstPerLocation(inProgress, 1)) {
    const lot = plan.supply.pairs.find((pair) => pair.procurement === "make" && pair.pairIndex === order.pairIndex)!.multiple;
    let quantity = largerOf((order.quantity / 2n / lot) * lot, lot);
    while (quantity > 0n && expectedUse(config, order.output, quantity).some(({ material, base }) => ledger.balance(material, order.location) < base)) quantity -= lot;
    if (quantity > 0n) add("completion", completionEvent(config, order, quantity, expectedUse(config, order.output, quantity)));
  }

  const unshipped = plan.demand.orders.filter(
    (order) => order.createdOn < today && order.requiredDate >= today && order.shipments.every(({ createdOn }) => createdOn >= today),
  );
  unshipped.sort((a, b) => a.requiredDate.localeCompare(b.requiredDate));
  const partialShipment = (order: PlannedCustomerOrder) => {
    const lines = order.lines
      .map(({ material, base }, orderLine) => {
        const available = (ledger.balance(material, order.location) / ONE) * ONE;
        return { orderLine, base: smallerOf(largerOf((base / ONE / 2n) * ONE, ONE), available) };
      })
      .filter(({ base }) => base > 0n);
    if (lines.length === 0) return;
    add("creation", shipmentEvent(config, order, `${order.key}:shipment-today`, order.requiredDate, lines));
    add("issue", issueEvent(config, order, `${order.key}:shipment-today`, lines));
  };
  const openShipment = (order: PlannedCustomerOrder) =>
    add("creation", shipmentEvent(config, order, `${order.key}:shipment-today`, order.requiredDate, order.lines.map(({ base }, orderLine) => ({ orderLine, base }))));
  for (const orders of firstPerLocation(unshipped, 2)) orders.forEach((order, index) => (index === 0 ? partialShipment(order) : openShipment(order)));
  return events;
}

/** A date and a number of seconds after its midnight, as an ISO-8601 UTC timestamp. */
function timestamp(date: string, seconds: number): string {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date}T${part(Math.floor(seconds / 3600))}:${part(Math.floor(seconds / 60) % 60)}:${part(seconds % 60)}.000Z`;
}

/** The events with their timestamps: their slot's time plus their index within the slot, in seconds. */
function stamped(events: readonly DatedEvent[]): TimelineEvent[] {
  let group = "";
  let index = 0;
  return events.map(({ date, slot, event }) => {
    const current = `${date} ${slot}`;
    index = current === group ? index + 1 : 0;
    group = current;
    return { ...event, at: timestamp(date, SLOT[slot] + index) } as TimelineEvent;
  });
}

/**
 * The timeline as of `today` (spec "Today: what is open"): everything the anchor month's plan dates
 * before today, the documents created relative to today, then today's partial documents.
 */
export function buildTimeline(config: TestTenantConfig, plan: AnchorPlan, today: string): TimelineEvent[] {
  const past = [...plan.events.filter(({ date }) => date < today), ...todayRelativeCreations(config, plan, today)].sort(byDayOrder);
  const ledger = new Ledger(config);
  for (const { event } of past) ledger.apply(event);
  const todays = todaysDocuments(config, plan, today, ledger).sort(byDayOrder);
  return stamped([...past, ...todays]);
}
