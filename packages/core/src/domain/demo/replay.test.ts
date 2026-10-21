import { describe, expect, it } from "vitest";
import { plannedStart } from "../production-orders/production-planning";
import { addDays, addWeekdays, monthLabel, monthOf, nthWeekday } from "./calendar";
import { generateTestTenantDataset } from "./generate-dataset";
import { replayTimeline } from "./replay";
import { TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";
import type { TimelineEvent } from "./timeline";

const config = TEST_TENANT_CONFIG;
const LOCATIONS = ["00000001", "00000002", "00000003", "00000004"];

/** Every day from `first` to `last`, both included. */
function days(first: string, last: string): string[] {
  const all: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) all.push(day);
  return all;
}

function changed(change: (copy: TestTenantConfig) => void): TestTenantConfig {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

type Of<K extends TimelineEvent["kind"]> = Extract<TimelineEvent, { kind: K }>;

/** The checks of spec "Today: what is open" on one day's dataset. */
function checkOpenDocuments(today: string, timeline: readonly TimelineEvent[]): void {
  const anchor = monthOf(today);
  const todays = timeline.filter(({ at }) => at.startsWith(today));
  const created = new Map(timeline.flatMap((event) => ("key" in event ? [[event.key, event] as const] : [])));
  const locationOf = (event: TimelineEvent): string => {
    if (event.kind === "goodsReceipt" || event.kind === "completion") return (created.get(event.order) as Of<"purchaseOrder" | "productionOrder">).location;
    if (event.kind === "shipment") return (created.get(event.order) as Of<"customerOrder">).location;
    return locationOf(created.get((event as Of<"goodsIssue">).shipment)!);
  };
  const perPlant = (kind: TimelineEvent["kind"], filter: (event: TimelineEvent) => boolean = () => true) =>
    LOCATIONS.map((location) => todays.filter((event) => event.kind === kind && filter(event) && locationOf(event) === location).length);

  // Every plant receives a first line every day; it ships part of its first open order with no
  // shipment yet, and opens a shipment for the second, when it has one.
  expect(perPlant("goodsReceipt")).toEqual([1, 1, 1, 1]);
  const shippedBefore = new Set(timeline.flatMap((event) => (event.kind === "shipment" && event.at < today ? [event.order] : [])));
  const unshipped = LOCATIONS.map(
    (location) =>
      timeline.filter((event) => event.kind === "customerOrder" && event.location === location && event.at < today && event.lines[0].requiredDate >= today && !shippedBefore.has(event.key))
        .length,
  );
  expect(unshipped.every((candidates) => candidates >= 1)).toBe(true);
  expect(perPlant("goodsIssue")).toEqual([1, 1, 1, 1]);
  const issued = new Set(todays.flatMap((event) => (event.kind === "goodsIssue" ? [event.shipment] : [])));
  expect(perPlant("shipment", (event) => !issued.has((event as Of<"shipment">).key))).toEqual(unshipped.map((candidates) => (candidates >= 2 ? 1 : 0)));

  // A plant with an order in progress completes part of the first one.
  const productionOrders = timeline.filter((event): event is Of<"productionOrder"> => event.kind === "productionOrder");
  const leadTime = (order: Of<"productionOrder">) => config.catalogue.production.find(({ material, location }) => material === order.output && location === order.location)!.leadTimeDays;
  for (const location of LOCATIONS) {
    const inProgress = productionOrders
      .filter((order) => order.location === location && plannedStart(order.plannedFinish, leadTime(order)) <= today && today <= order.plannedFinish)
      .sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish));
    const completions = todays.filter((event) => event.kind === "completion" && locationOf(event) === location) as Of<"completion">[];
    expect(completions.map(({ order }) => order)).toEqual(inProgress.slice(0, 1).map(({ key }) => key));
  }

  // The overdue top-ups, the open requisitions, and the converted ones once their day has passed.
  const topUps = timeline.filter((event) => event.kind === "purchaseOrder" && event.key.startsWith("purchase-order:top-up:"));
  expect(topUps.map(({ at }) => at.slice(0, 10))).toEqual(LOCATIONS.map(() => addWeekdays(today, -3)));
  const requisitions = timeline.filter((event): event is Of<"requisition"> => event.kind === "requisition");
  expect(requisitions.filter(({ key }) => key.startsWith("requisition:open:")).map(({ at }) => at.slice(0, 10))).toEqual([1, 2, 3].map(() => addWeekdays(today, -2)));
  expect(requisitions.filter(({ key }) => !key.startsWith("requisition:open:"))).toHaveLength(nthWeekday(anchor, 1) < today ? 2 : 0);
  const converting = timeline.flatMap((event) => (event.kind === "purchaseOrder" ? event.lines.filter(({ requisition }) => requisition) : []));
  expect(converting).toHaveLength(nthWeekday(anchor, 2) < today ? 2 : 0);

  // Next month's documents exist from their run's day on.
  const next = `:${monthLabel(anchor + 1)}:`;
  const count = (kind: TimelineEvent["kind"]) => timeline.filter((event) => event.kind === kind && "key" in event && event.key.includes(next)).length;
  expect(count("purchaseOrder") > 0).toBe(nthWeekday(anchor, 2) < today);
  expect(count("productionOrder") > 0).toBe(nthWeekday(anchor, 8) < today);
  expect(count("customerOrder") > 0).toBe(nthWeekday(anchor, 12) < today);
}

describe("replayTimeline", () => {
  it("holds the committed configuration on every day of two years, with each open document where the spec puts it", { timeout: 30_000 }, () => {
    const window = days("2025-01-01", "2026-12-31");
    expect(window).toHaveLength(730);
    for (const today of window) {
      const { timeline, summary } = generateTestTenantDataset(config, today);
      expect(summary.movements).toBeLessThan(config.limits.movements);
      checkOpenDocuments(today, timeline);
    }
  });

  it("counts every kind and the movements, leaving zero quantities out", () => {
    const { timeline, summary } = generateTestTenantDataset(config, "2026-10-21");
    expect(replayTimeline(config, timeline)).toEqual(summary);
    const waste = timeline.find((event): event is Of<"completion"> => event.kind === "completion" && event.quantity === "0")!;
    const order = timeline.find((event): event is Of<"productionOrder"> => event.kind === "productionOrder" && event.key === waste.order)!;
    const opening = timeline.find((event): event is Of<"opening"> => event.kind === "opening" && event.location === order.location)!;
    expect(replayTimeline(config, [opening, order, waste])).toMatchObject({ openings: 1, productionOrders: 1, completions: 1, movements: opening.lines.length + 1 });
  });

  it("names the first pair a timeline would take below zero", () => {
    const { timeline } = generateTestTenantDataset(config, "2026-10-21");
    const noOpenings = timeline.map((event) => (event.kind === "opening" ? { ...event, lines: event.lines.map((line) => ({ ...line, quantity: "0" })) } : event));
    expect(() => replayTimeline(config, noOpenings)).toThrow(/^The dataset takes material \d{8} at location \d{8} below zero \(to -[\d.]+\) with the completion at 2024-10-\d\dT13:00:\d\d\.000Z\.$/);
  });

  it("names the limit a dataset exceeds", () => {
    expect(() => generateTestTenantDataset(changed((copy) => (copy.limits.documents = 3000)), "2026-10-21")).toThrow(/^The dataset has \d+ documents; limits\.documents allows 3000\.$/);
    expect(() => generateTestTenantDataset(changed((copy) => (copy.limits.movements = 2000)), "2026-10-21")).toThrow(/^The dataset posts \d+ stock movements; limits\.movements allows 2000\.$/);
  });

  it("refuses a history longer than the limits allow, naming the limit", () => {
    expect(() => generateTestTenantDataset(changed((copy) => (copy.horizon.historyMonths = 48)), "2026-10-21")).toThrow(/limits\.documents allows 5000\./);
  });
});
