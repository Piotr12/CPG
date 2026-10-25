import { describe, expect, it } from "vitest";
import { plannedStart } from "../production-orders/production-planning";
import { addDays, addWeekdays, isoWeekday, monthOf, monthStart } from "./calendar";
import { generateTestTenantDataset } from "./generate-dataset";
import { replayTimeline } from "./replay";
import { TEST_DATASET_CONFIGS } from "./test-datasets";
import { TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";
import type { TimelineEvent } from "./timeline";

const config = TEST_TENANT_CONFIG;

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

/** The latest Thursday up to `today`: the planning run whose orders are the newest in its timeline, today's own on a Thursday (spec "Edge Cases"). */
function lastPlanningRun(today: string): string {
  let day = today;
  while (isoWeekday(day) !== 4) day = addDays(day, -1);
  return day;
}

/** The checks of spec "Today: what is open" on one day's dataset of a configuration. */
function checkOpenDocuments(of: TestTenantConfig, today: string, timeline: readonly TimelineEvent[]): void {
  const todays = timeline.filter(({ at }) => at.startsWith(today));
  const before = timeline.filter(({ at }) => at < today);
  const count = (kind: TimelineEvent["kind"]) => todays.filter((event) => event.kind === kind).length;

  // The plant receives the first line of its first open purchase order, whenever one is open: from Thursday's run to its receipt.
  const receivable = before.filter((event): event is Of<"purchaseOrder"> => event.kind === "purchaseOrder" && !event.key.includes(":top-up:") && event.lines[0].plannedDate >= today);
  expect(count("goodsReceipt"), today).toBe(receivable.length > 0 ? 1 : 0);
  expect(receivable.length > 0, today).toBe(![3, 4].includes(isoWeekday(today)));

  // It ships part of its first open order with no shipment yet, and opens a shipment for the second.
  const shippedBefore = new Set(before.flatMap((event) => (event.kind === "shipment" ? [event.order] : [])));
  const unshipped = before.filter((event) => event.kind === "customerOrder" && event.lines[0].requiredDate >= today && !shippedBefore.has(event.key));
  expect(unshipped.length, today).toBeGreaterThanOrEqual(2);
  expect([count("goodsIssue"), count("shipment")], today).toEqual([1, 2]);

  // With an order in progress, it completes part of the first one.
  const leadTime = (order: Of<"productionOrder">) => of.catalogue.production.find(({ material }) => material === order.output)!.leadTimeDays;
  const inProgress = before
    .filter((event): event is Of<"productionOrder"> => event.kind === "productionOrder")
    .filter((order) => plannedStart(order.plannedFinish, leadTime(order)) <= today && today <= order.plannedFinish)
    .sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish));
  expect((todays.filter((event) => event.kind === "completion") as Of<"completion">[]).map(({ order }) => order), today).toEqual(inProgress.slice(0, 1).map(({ key }) => key));

  // The overdue top-up, the open requisitions, and the converted ones of the last run before the month.
  const topUps = timeline.filter((event) => event.kind === "purchaseOrder" && event.key.startsWith("purchase-order:top-up:"));
  expect(topUps.map(({ at }) => at.slice(0, 10))).toEqual([addWeekdays(today, -3)]);
  const requisitions = timeline.filter((event): event is Of<"requisition"> => event.kind === "requisition");
  expect(requisitions.filter(({ key }) => key.startsWith("requisition:open:")).map(({ at }) => at.slice(0, 10))).toEqual([1, 2, 3].map(() => addWeekdays(today, -2)));
  const converted = requisitions.filter(({ key }) => !key.startsWith("requisition:open:"));
  expect(converted.map(({ at }) => at < monthStart(monthOf(today))), today).toEqual([true, true]);
  const converting = timeline.flatMap((event) => (event.kind === "purchaseOrder" ? event.lines.filter(({ requisition }) => requisition) : []));
  expect(converting.map(({ requisition }) => requisition), today).toEqual(converted.map(({ key }) => key));

  // The latest planning run's orders exist: one purchase order per supplier and the week's production; the online shop's next order is in.
  const run = lastPlanningRun(today);
  const created = (kind: TimelineEvent["kind"]) => timeline.filter((event) => event.kind === kind && event.at.startsWith(run) && !("key" in event && event.key.includes(":top-up:"))).length;
  expect(created("purchaseOrder"), today).toBe(2);
  expect(created("productionOrder"), today).toBeGreaterThan(8);
  const next = addWeekdays(today, 1);
  expect(before.some((event) => event.kind === "customerOrder" && event.customer === "00000003" && event.lines[0].requiredDate === next), today).toBe(true);
}

describe("replayTimeline", () => {
  // Tiny on every day of two years, and realistic on every day of two months across a month and a year end: a realistic
  // generation per day of two years takes about 25 s, which the run log of #237 records as passing on every day of 2025–2027.
  it("holds tiny on every day of two years, with each open document where the spec puts it", { timeout: 60_000 }, () => {
    const window = days("2025-01-01", "2026-12-31");
    expect(window).toHaveLength(730);
    for (const today of window) {
      const { timeline, summary } = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, today);
      expect(summary.movements).toBeLessThan(config.limits.movements);
      checkOpenDocuments(TEST_DATASET_CONFIGS.tiny, today, timeline);
    }
  });

  it("holds realistic on every day of December 2026 and January 2027, under its limits", { timeout: 60_000 }, () => {
    for (const today of days("2026-12-01", "2027-01-31")) {
      const { timeline, summary } = generateTestTenantDataset(config, today);
      expect(timeline.length - summary.openings).toBeLessThan(config.limits.documents);
      expect(summary.movements).toBeLessThan(config.limits.movements);
      checkOpenDocuments(config, today, timeline);
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
    expect(() => replayTimeline(config, noOpenings)).toThrow(/^The dataset takes material \d{8} at location \d{8} below zero \(to -[\d.]+\) with the (completion|goodsIssue) at 2024-10-\d\dT1[35]:00:\d\d\.000Z\.$/);
  });

  it("names the limit a dataset exceeds", () => {
    expect(() => generateTestTenantDataset(changed((copy) => (copy.limits.documents = 6000)), "2026-10-21")).toThrow(/^The dataset has \d+ documents; limits\.documents allows 6000\.$/);
    expect(() => generateTestTenantDataset(changed((copy) => (copy.limits.movements = 15000)), "2026-10-21")).toThrow(/^The dataset posts \d+ stock movements; limits\.movements allows 15000\.$/);
  });

  it("refuses a history longer than the limits allow, naming the limit", () => {
    expect(() => generateTestTenantDataset(changed((copy) => (copy.horizon.historyMonths = 48)), "2026-10-21")).toThrow(/limits\.documents allows 12000\./);
  });
});
