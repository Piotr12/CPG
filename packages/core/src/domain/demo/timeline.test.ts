import { describe, expect, it } from "vitest";
import { formatDecimal, ONE } from "../quantities/decimal";
import { addDays, addWeekdays, monthOf, nthWeekday } from "./calendar";
import { planDemand } from "./demand-plan";
import { Ledger } from "./ledger";
import { expectedUse, planSupply, type SupplyPlan } from "./supply-plan";
import { byId, TEST_TENANT_CONFIG } from "./test-tenant-config.schema";
import { buildTimeline, notAfter, planEvents, type TimelineEvent } from "./timeline";

const config = TEST_TENANT_CONFIG;

/** The anchor month's plan for `today`, after `change` (applied to the supply plan before its events are dated). */
function planFor(today: string, change?: (supply: SupplyPlan) => void) {
  const anchor = monthOf(today);
  const demand = planDemand(config, anchor);
  const supply = planSupply(config, demand, anchor);
  change?.(supply);
  return planEvents(config, demand, supply, anchor);
}

const timelineOn = (today: string, change?: (supply: SupplyPlan) => void) => buildTimeline(config, planFor(today, change), today);
const on = (timeline: readonly TimelineEvent[], date: string) => timeline.filter(({ at }) => at.startsWith(date));
const ofKind = <K extends TimelineEvent["kind"]>(events: readonly TimelineEvent[], kind: K) => events.filter((event): event is Extract<TimelineEvent, { kind: K }> => event.kind === kind);

/** The base balance the timeline leaves a pair with, from the first event up to but not including the first one at or after `before`. */
function balanceBefore(timeline: readonly TimelineEvent[], material: string, location: string, before: string): bigint {
  const ledger = new Ledger(config);
  for (const event of timeline) {
    if (event.at >= before) break;
    ledger.apply(event);
  }
  return ledger.balance(material, location);
}

/**
 * Takes `amount` of a pair's stock out of the history before `before`: from its latest receipts and
 * completed output first, so the plan's other events stay as they are and every quantity stays valid.
 */
function lessStock(material: string, location: string, amount: bigint, before: string) {
  return (supply: SupplyPlan) => {
    let left = amount;
    const take = (available: bigint) => {
      const taken = available < left ? available : left;
      left -= taken;
      return available - taken;
    };
    const received = supply.purchaseOrders.filter((order) => order.location === location && order.plannedDate < before).flatMap(({ lines }) => lines);
    for (const line of received.filter((candidate) => candidate.material === material).reverse()) line.base = take(line.base);
    const made = supply.productionOrders.filter((order) => order.output === material && order.location === location).flatMap(({ completions }) => completions);
    for (const completion of made.filter(({ date }) => date < before).reverse()) completion.output = take(completion.output);
  };
}

const today = "2026-10-21";
const plan = planFor(today);
const timeline = buildTimeline(config, plan, today);
const todays = on(timeline, today);

describe("buildTimeline", () => {
  it("orders events by a unique, increasing timestamp at the spec's time of day for each kind", () => {
    expect(timeline.slice(1).every((event, index) => event.at > timeline[index].at)).toBe(true);
    const hours = { opening: "08:30", customerOrder: "08", shipment: "08", purchaseOrder: "08", productionOrder: "08", requisition: "08", goodsReceipt: "09", completion: "13", goodsIssue: "15" };
    for (const event of timeline) expect(event.at.slice(11)).toMatch(new RegExp(`^${hours[event.kind]}`));
    expect([timeline[0].at, timeline[0].kind]).toEqual(["2024-09-01T08:30:00.000Z", "opening"]);
    expect(timeline.filter(({ kind }) => kind === "opening")).toHaveLength(1);
  });

  it("holds everything dated before today and, on today, only the partial documents", () => {
    expect(timeline.every(({ at }) => at.slice(0, 10) <= today)).toBe(true);
    expect(todays.every((event) => ["shipment", "goodsIssue", "goodsReceipt", "completion"].includes(event.kind))).toBe(true);
    const keys = new Set<string>();
    for (const event of timeline) {
      if ("key" in event) keys.add(event.key);
      const references = event.kind === "goodsIssue" ? [event.shipment] : event.kind === "shipment" || event.kind === "goodsReceipt" || event.kind === "completion" ? [event.order] : [];
      if (event.kind === "purchaseOrder") references.push(...event.lines.flatMap(({ requisition }) => (requisition ? [requisition] : [])));
      for (const reference of references) expect(keys.has(reference)).toBe(true);
    }
  });

  it("receives the first line of the plant's first open purchase order today, when one is open", () => {
    // Thursday's run orders for next Monday and Tuesday, so on a Wednesday every order is in.
    expect(ofKind(todays, "goodsReceipt")).toEqual([]);
    const day = "2026-10-19";
    const dayPlan = planFor(day);
    const receipts = ofKind(on(buildTimeline(config, dayPlan, day), day), "goodsReceipt");
    expect(receipts).toHaveLength(1);
    const order = dayPlan.supply.purchaseOrders.find(({ key }) => key === receipts[0].order)!;
    const open = dayPlan.supply.purchaseOrders.filter((candidate) => candidate.createdOn < day && candidate.plannedDate >= day);
    expect(open.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0]).toBe(order);
    expect(receipts[0].lines).toEqual([{ line: 1, quantity: formatDecimal(order.lines[0].base), unit: byId(config.catalogue.materials, order.lines[0].material)!.baseUnit }]);
  });

  it("ships half of the plant's first unshipped open order today and opens a shipment for the whole second", () => {
    const shipments = ofKind(todays, "shipment");
    const issues = ofKind(todays, "goodsIssue");
    expect(issues).toHaveLength(1);
    {
      const unshipped = plan.demand.orders
        .filter((order) => order.createdOn < today && order.requiredDate >= today && order.shipments.every(({ createdOn }) => createdOn >= today))
        .sort((a, b) => a.requiredDate.localeCompare(b.requiredDate));
      const [partial, open] = unshipped.map((order) => shipments.find((shipment) => shipment.order === order.key)!);
      expect(partial.lines).toEqual(unshipped[0].lines.map(({ base }, orderLine) => ({ orderLine, quantity: String(base / ONE / 2n > 1n ? base / ONE / 2n : 1n), unit: "each" })));
      expect(issues.find(({ shipment }) => shipment === partial.key)!.lines).toEqual(partial.lines.map(({ quantity, unit }, index) => ({ line: index + 1, quantity, unit })));
      expect(open.lines).toEqual(unshipped[1].lines.map(({ base }, orderLine) => ({ orderLine, quantity: String(base / ONE), unit: "each" })));
      expect(open.plannedDate).toBe(unshipped[1].requiredDate);
      expect(issues.some(({ shipment }) => shipment === open.key)).toBe(false);
    }
  });

  it("creates the overdue top-up order three weekdays ago, never received", () => {
    const topUps = ofKind(timeline, "purchaseOrder").filter(({ key }) => key.startsWith("purchase-order:top-up:"));
    expect(topUps.map(({ location, supplier, lines }) => [location, supplier, lines[0].material, lines[0].quantity])).toEqual([["00000001", "00000001", "00000001", "100"]]);
    for (const order of topUps) {
      expect(order.at.slice(0, 10)).toBe(addWeekdays(today, -3));
      expect(order.lines[0].plannedDate).toBe(addWeekdays(today, -3));
      expect(timeline.some((event) => event.kind === "goodsReceipt" && event.order === order.key)).toBe(false);
    }
  });

  it("has three open requisitions from two weekdays ago, required a week after next month's first weekday, and two converted ones", () => {
    const requisitions = ofKind(timeline, "requisition");
    const open = requisitions.filter(({ key }) => key.startsWith("requisition:open:"));
    expect(open.map(({ material, location, quantity, unit }) => [material, location, quantity, unit])).toEqual([
      ["00000007", "00000001", "1000", "kg"],
      ["00000013", "00000001", "40", "l"],
      ["00000014", "00000001", "30", "kg"],
    ]);
    for (const requisition of open) {
      expect(requisition.at.slice(0, 10)).toBe(addWeekdays(today, -2));
      expect(requisition.requiredDate).toBe(addDays(nthWeekday(monthOf(today) + 1, 1), 7));
    }
    const converted = requisitions.filter(({ key }) => !key.startsWith("requisition:open:"));
    expect(converted).toHaveLength(2);
    for (const requisition of converted) {
      const line = ofKind(timeline, "purchaseOrder").flatMap(({ lines }) => lines).find((candidate) => candidate.requisition === requisition.key)!;
      expect([line.material, line.quantity, line.plannedDate]).toEqual([requisition.material, requisition.quantity, requisition.requiredDate]);
    }
  });

  it("completes half of the plant's first order in progress today, in lot multiples, as far as its components allow", () => {
    for (const day of ["2026-10-05", "2026-10-07", "2026-10-10"]) {
      const dayPlan = planFor(day);
      const completions = ofKind(on(buildTimeline(config, dayPlan, day), day), "completion");
      expect(completions.length).toBeGreaterThan(0);
      for (const completion of completions) {
        const order = dayPlan.supply.productionOrders.find(({ key }) => key === completion.order)!;
        const inProgress = dayPlan.supply.productionOrders
          .filter((candidate) => candidate.location === order.location && candidate.createdOn < day && candidate.plannedStart <= day && day <= candidate.plannedFinish)
          .sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish));
        expect(inProgress[0]).toBe(order);
        const lot = dayPlan.supply.pairs.find(({ procurement, pairIndex }) => procurement === "make" && pairIndex === order.pairIndex)!.multiple;
        const quantity = BigInt(completion.quantity) * ONE;
        expect(quantity % lot).toBe(0n);
        expect(quantity).toBeLessThanOrEqual(order.quantity / 2n > lot ? order.quantity / 2n : lot);
        expect(completion.components.map(({ material, quantity: used }) => [material, used])).toEqual(
          expectedUse(config, order.output, quantity).map(({ material, base }) => [material, String(Number(base) / Number(ONE))]),
        );
      }
    }
  });

  it("cuts today's partial completion to the lots its components cover", () => {
    const day = "2026-10-07";
    const dayTimeline = timelineOn(day);
    const completion = ofKind(on(dayTimeline, day), "completion")[0];
    const order = planFor(day).supply.productionOrders.find(({ key }) => key === completion.order)!;
    const lot = planFor(day).supply.pairs.find(({ procurement, pairIndex }) => procurement === "make" && pairIndex === order.pairIndex)!.multiple;
    expect(BigInt(completion.quantity) * ONE).toBeGreaterThan(lot);
    // Leave exactly one lot's worth of the first component.
    const [first] = expectedUse(config, order.output, lot);
    const before = balanceBefore(dayTimeline, first.material, order.location, `${day}T13`);
    const cut = timelineOn(day, lessStock(first.material, order.location, before - first.base, day));
    expect(ofKind(on(cut, day), "completion").find(({ order: key }) => key === order.key)!.quantity).toBe(formatDecimal(lot));
  });

  it("caps today's partial issue at the stock on hand, dropping lines with none and the shipment when nothing is left", () => {
    const location = "00000001";
    const partial = ofKind(todays, "shipment").find(({ order }) => order.endsWith(`:${location}`))!;
    const order = plan.demand.orders.find(({ key }) => key === partial.order)!;
    const [first, ...others] = order.lines.map(({ material }) => material);
    expect(others.length).toBeGreaterThan(0);
    const leaving = (material: string, keep: bigint) => lessStock(material, location, balanceBefore(timeline, material, location, `${today}T15`) - keep, today);
    const capped = timelineOn(today, (supply) => {
      leaving(first, 3n * ONE)(supply);
      for (const other of others) leaving(other, 0n)(supply);
    });
    const shipment = ofKind(on(capped, today), "shipment").find(({ order: key }) => key === order.key)!;
    expect(shipment.lines).toEqual([{ orderLine: 0, quantity: "3", unit: "each" }]);
    expect(ofKind(on(capped, today), "goodsIssue").find(({ shipment: key }) => key === shipment.key)!.lines).toEqual([{ line: 1, quantity: "3", unit: "each" }]);

    const empty = timelineOn(today, (supply) => {
      for (const material of [first, ...others]) leaving(material, 0n)(supply);
    });
    expect(ofKind(on(empty, today), "shipment").some(({ order: key }) => key === order.key)).toBe(false);
    expect(ofKind(on(empty, today), "goodsIssue")).toHaveLength(0);
  });

  it("leaves out today's partial completion when its components can't cover one lot", () => {
    const day = "2026-10-07";
    const dayTimeline = timelineOn(day);
    const completion = ofKind(on(dayTimeline, day), "completion")[0];
    const order = planFor(day).supply.productionOrders.find(({ key }) => key === completion.order)!;
    const sheet = completion.components[0].material;
    const starved = timelineOn(day, lessStock(sheet, order.location, balanceBefore(dayTimeline, sheet, order.location, `${day}T13`), day));
    expect(ofKind(on(starved, day), "completion").some(({ order: key }) => key === order.key)).toBe(false);
  });
});

describe("notAfter", () => {
  const increasing = (events: readonly TimelineEvent[]) => events.every(({ at }, index) => index === 0 || events[index - 1].at < at);

  it("moves today's events to no later than the seed's clock, keeping their order and earlier days as they are", () => {
    expect(todays.length).toBeGreaterThan(1);
    const early = new Date(`${today}T06:00:00.000Z`);

    const moved = notAfter(timeline, early);

    expect(moved.filter(({ at }) => at < today)).toEqual(timeline.filter(({ at }) => at < today));
    const movedToday = on(moved, today);
    expect(movedToday.map(({ kind }) => kind)).toEqual(todays.map(({ kind }) => kind));
    expect(movedToday.every(({ at }) => Date.parse(at) <= early.getTime())).toBe(true);
    expect(movedToday.at(-1)!.at).toBe(early.toISOString());
    expect(increasing(moved)).toBe(true);
  });

  it("leaves today's slots alone once the clock is past them", () => {
    expect(notAfter(timeline, new Date(`${today}T23:00:00.000Z`))).toEqual(timeline);
  });

  it("never moves an event before midnight, even a millisecond after it", () => {
    const moved = on(notAfter(timeline, new Date(`${today}T00:00:00.001Z`)), today);

    expect(moved.map(({ at }) => at)).toEqual(todays.map((_, index) => new Date(Date.parse(`${today}T00:00:00.000Z`) + index).toISOString()));
  });
});
