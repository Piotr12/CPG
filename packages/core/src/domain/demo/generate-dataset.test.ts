import { describe, expect, it } from "vitest";
import { addMonths, isWeekday, weekdaysFrom } from "./calendar";
import { generateTestTenantDataset, type TimelineEvent } from "./generate-dataset";
import { TEST_TENANT_CONFIG } from "./test-tenant-config.schema";

const config = TEST_TENANT_CONFIG;
const today = "2026-10-21";
const dataset = generateTestTenantDataset(config, today);

/** The event without its timestamp, which moves when documents tied to today are added on its day. */
const unstamped = (event: TimelineEvent) => Object.fromEntries(Object.entries(event).filter(([field]) => field !== "at"));
/** Whether an event is created relative to today rather than planned for its calendar month. */
const isTodayRelative = (event: TimelineEvent) => "key" in event && (event.key.startsWith("purchase-order:top-up:") || event.key.startsWith("requisition:open:"));

describe("generateTestTenantDataset", () => {
  it("dates the dataset from today: anchor, history start and setup month", () => {
    expect([dataset.today, dataset.anchor, dataset.historyStart, dataset.setupDate]).toEqual([today, "2026-10-01", "2024-10-01", "2024-09-01"]);
  });

  it("yields the same dataset for the same configuration and day, from a fresh copy too", () => {
    expect(generateTestTenantDataset(config, today)).toEqual(dataset);
    expect(generateTestTenantDataset(structuredClone(config), today)).toEqual(dataset);
  });

  it("lists the masters of the configured business (spec 'The business', 'Materials', 'BOMs')", () => {
    const { masters } = dataset;
    expect(masters.materials).toHaveLength(30);
    expect(masters.materials.filter(({ type }) => type === "finished")).toHaveLength(12);
    expect(masters.materials.filter(({ description }) => description.startsWith("Paint"))).toHaveLength(5);
    expect(masters.materials[0]).toEqual({ type: "raw", description: "Steel sheet 2 mm", baseUnit: "kg", conversions: [{ unit: "t", numerator: "1000", denominator: "1" }] });
    expect([masters.locations, masters.customers.length, masters.suppliers.length]).toEqual([["Main plant, Wrocław"], 4, 2]);
    expect(masters.boms).toHaveLength(18);
    expect(masters.boms.every(({ validFrom, validThrough }) => validFrom === "2024-10-01" && validThrough === null)).toBe(true);
    expect(masters.boms.filter(({ output }) => output === "00000018").map(({ priority }) => priority)).toEqual([1, 2, 3]);
    expect(masters.boms[5].components[3]).toEqual({ material: "00000002", quantity: "2", unit: "case" });
    expect(masters.planningParameters).toHaveLength(30);
    expect(masters.planningParameters.filter(({ procurement }) => procurement === "make")).toHaveLength(16);
    expect(masters.planningParameters[0]).toEqual({ material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50", lotMultiple: "10" });
    expect(masters.safetyStockTargets).toHaveLength(32);
  });

  it("forecasts every SKU for each weekday from tomorrow through the same date a year on, daily (spec 'Forecasts')", () => {
    const weekdays = weekdaysFrom("2026-10-22", addMonths(today, 12));
    expect(dataset.forecasts).toHaveLength(12 * weekdays.length);
    expect(dataset.forecasts.length).toBeGreaterThan(3000);
    expect(dataset.forecasts.every(({ date, location }) => date > today && date <= "2027-10-21" && isWeekday(date) && location === "00000001")).toBe(true);
    expect(dataset.forecasts.filter(({ material }) => material === "00000005").map(({ date }) => date)).toEqual(weekdays);
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
    expect(summary.openings).toBe(1);
    expect(summary.requisitions).toBe(5);
    expect(summary.customerOrders).toBeGreaterThan(900);
    expect(summary.purchaseOrders).toBeGreaterThan(200);
    expect(summary.productionOrders).toBeGreaterThan(1200);
    expect(summary.movements).toBeGreaterThan(15000);
    expect(timeline.length).toBeLessThan(config.limits.documents);
    expect(summary.movements).toBeLessThan(config.limits.movements);
  });

  it("changes, from one day of a month to a later one, only what the calendar moves", () => {
    const earlier = generateTestTenantDataset(config, "2026-10-12");
    const before = (timeline: readonly TimelineEvent[]) => timeline.filter((event) => event.at < "2026-10-12" && !isTodayRelative(event)).map(unstamped);
    expect(before(dataset.timeline)).toEqual(before(earlier.timeline));
    expect(earlier.masters).toEqual(dataset.masters);
    // Each day forecasts its own year ahead from the same model: where the windows overlap, the rows are the same.
    const overlap = ({ date }: { date: string }) => date > today && date <= "2027-10-12";
    expect(earlier.forecasts.filter(overlap)).toEqual(dataset.forecasts.filter(overlap));
    expect(dataset.timeline.length).toBeGreaterThan(earlier.timeline.length);
  });

  it("starts a new month's history on the 1st, with nothing dated today but its partial documents and open orders ahead", () => {
    const first = generateTestTenantDataset(config, "2026-11-01");
    expect(first.historyStart).toBe("2024-11-01");
    const orders = first.timeline.filter((event): event is Extract<TimelineEvent, { kind: "customerOrder" }> => event.kind === "customerOrder");
    expect(orders.every(({ lines }) => lines[0].requiredDate >= "2024-11-01")).toBe(true);
    expect(orders.some(({ lines }) => lines[0].requiredDate > "2026-11-01")).toBe(true);
    expect(first.timeline.filter(({ at }) => at >= "2026-11-01").every(({ kind }) => ["shipment", "goodsIssue", "goodsReceipt", "completion"].includes(kind))).toBe(true);
  });

  it("refuses a day that isn't a calendar date", () => {
    expect(() => generateTestTenantDataset(config, "2026-02-30")).toThrow("Today must be a calendar date written YYYY-MM-DD; got 2026-02-30.");
  });
});
