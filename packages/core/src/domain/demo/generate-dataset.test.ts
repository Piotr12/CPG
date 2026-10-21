import { describe, expect, it } from "vitest";
import { monthLabel, monthOf } from "./calendar";
import { generateTestTenantDataset, type TimelineEvent } from "./generate-dataset";
import { TEST_TENANT_CONFIG } from "./test-tenant-config.schema";

const config = TEST_TENANT_CONFIG;
const today = "2026-10-21";
const dataset = generateTestTenantDataset(config, today);

/** The event without its timestamp, which moves when documents tied to today are added on its day. */
const unstamped = (event: TimelineEvent) => Object.fromEntries(Object.entries(event).filter(([field]) => field !== "at"));
/** Whether an event is created relative to today rather than planned for its calendar month. */
const isTodayRelative = (event: TimelineEvent) => "key" in event && (event.key.startsWith("purchase-order:top-up:") || event.key.startsWith("requisition:open:"));
const keysOf = (timeline: readonly TimelineEvent[]) => timeline.flatMap((event) => ("key" in event ? [event.key] : []));

describe("generateTestTenantDataset", () => {
  it("dates the dataset from today: anchor, history start and setup month", () => {
    expect([dataset.today, dataset.anchor, dataset.historyStart, dataset.setupDate]).toEqual([today, "2026-10-01", "2024-10-01", "2024-09-01"]);
  });

  it("yields the same dataset for the same configuration and day, from a fresh copy too", () => {
    expect(generateTestTenantDataset(config, today)).toEqual(dataset);
    expect(generateTestTenantDataset(structuredClone(config), today)).toEqual(dataset);
  });

  it("lists the masters of the configured business (spec 'The business', 'Materials', 'Recipes')", () => {
    const { masters } = dataset;
    expect(masters.materials).toHaveLength(26);
    expect(masters.materials[0]).toEqual({ type: "raw", description: "Steel sheet 2 mm", baseUnit: "kg", conversions: [{ unit: "t", numerator: "1000", denominator: "1" }] });
    expect([masters.locations.length, masters.customers.length, masters.suppliers.length]).toEqual([4, 10, 6]);
    expect(masters.boms).toHaveLength(16);
    expect(masters.boms.every(({ validFrom, validThrough }) => validFrom === "2024-10-01" && validThrough === null)).toBe(true);
    expect(masters.boms.filter(({ output }) => output === config.shape.alternateBoms.product).map(({ priority }) => priority)).toEqual([1, 2, 3]);
    expect(masters.boms[5].components[3]).toEqual({ material: "00000002", quantity: "2", unit: "case" });
    expect(masters.planningParameters).toHaveLength(48);
    expect(masters.planningParameters.filter(({ procurement }) => procurement === "make")).toHaveLength(15);
    expect(masters.planningParameters[0]).toEqual({ material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50", lotMultiple: "10" });
    expect(masters.safetyStockTargets).toHaveLength(50);
    expect(dataset.forecasts).toHaveLength(120);
    expect(dataset.forecasts.every(({ date }) => date > today && date.endsWith("-01"))).toBe(true);
  });

  it("counts every kind and the stock movements it posts, near the spec's volumes and under the limits", () => {
    const { summary, timeline } = dataset;
    for (const [kind, key] of [
      ["customerOrder", "customerOrders"],
      ["shipment", "shipments"],
      ["goodsIssue", "goodsIssues"],
      ["requisition", "requisitions"],
      ["purchaseOrder", "purchaseOrders"],
      ["goodsReceipt", "goodsReceipts"],
      ["productionOrder", "productionOrders"],
      ["completion", "completions"],
      ["opening", "openings"],
    ] as const) {
      expect(summary[key]).toBe(timeline.filter((event) => event.kind === kind).length);
    }
    expect(summary.openings).toBe(4);
    expect(summary.requisitions).toBe(5);
    expect(summary.customerOrders).toBeGreaterThan(560);
    expect(summary.productionOrders).toBeGreaterThan(360);
    expect(summary.movements).toBeGreaterThan(3000);
    expect(timeline.length).toBeLessThan(config.limits.documents);
    expect(summary.movements).toBeLessThan(config.limits.movements);
  });

  it("changes, from one day of a month to a later one, only what the calendar moves", () => {
    const earlier = generateTestTenantDataset(config, "2026-10-12");
    const before = (timeline: readonly TimelineEvent[]) => timeline.filter((event) => event.at < "2026-10-12" && !isTodayRelative(event)).map(unstamped);
    expect(before(dataset.timeline)).toEqual(before(earlier.timeline));
    expect(earlier.masters).toEqual(dataset.masters);
    expect(earlier.forecasts).toEqual(dataset.forecasts);
    expect(dataset.timeline.length).toBeGreaterThan(earlier.timeline.length);
  });

  it("has none of next month's documents on the 1st, and this month's orders open", () => {
    const first = generateTestTenantDataset(config, "2026-11-01");
    const keys = keysOf(first.timeline);
    expect(keys.some((key) => key.includes(`:${monthLabel(monthOf("2026-12-01"))}:`))).toBe(false);
    expect(keys.filter((key) => /^customer-order:2026-11:[^:]+:[^:]+$/.test(key))).toHaveLength(23);
    expect(first.timeline.some((event) => event.kind === "goodsIssue" && event.at.startsWith("2026-11-0") && !event.at.startsWith("2026-11-01"))).toBe(false);
  });

  it("refuses a day that isn't a calendar date", () => {
    expect(() => generateTestTenantDataset(config, "2026-02-30")).toThrow("Today must be a calendar date written YYYY-MM-DD; got 2026-02-30.");
  });
});
