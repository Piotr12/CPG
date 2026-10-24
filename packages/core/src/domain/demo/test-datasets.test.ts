import { describe, expect, it } from "vitest";
import { parseDecimal } from "../quantities/decimal";
import { addDays } from "./calendar";
import { generateTestTenantDataset, type TimelineEvent } from "./generate-dataset";
import { DEFAULT_TEST_DATASET, TEST_DATASET_CONFIGS, TEST_DATASETS, TINY_HISTORY_MONTHS } from "./test-datasets";
import { TEST_TENANT_CONFIG, testTenantConfigSchema } from "./test-tenant-config.schema";

describe("Test datasets", () => {
  it("offers tiny first, and tiny is the default", () => {
    expect(TEST_DATASETS).toEqual(["tiny", "realistic"]);
    expect(DEFAULT_TEST_DATASET).toBe("tiny");
  });

  it("makes realistic the committed configuration and tiny the same one over two history months", () => {
    expect(TEST_DATASET_CONFIGS.realistic).toBe(TEST_TENANT_CONFIG);
    expect(TINY_HISTORY_MONTHS).toBe(2);
    expect(TEST_DATASET_CONFIGS.tiny).toEqual({ ...TEST_TENANT_CONFIG, horizon: { historyMonths: 2, forecastMonths: TEST_TENANT_CONFIG.horizon.forecastMonths } });
    expect(testTenantConfigSchema.safeParse(TEST_DATASET_CONFIGS.tiny).success).toBe(true);
  });

  it("gives tiny the same records and IDs, dated from its shorter history, and a fraction of the documents and movements", () => {
    const tiny = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21");
    const realistic = generateTestTenantDataset(TEST_DATASET_CONFIGS.realistic, "2026-10-21");
    const { boms, safetyStockTargets, ...masters } = tiny.masters;
    const { boms: realisticBoms, safetyStockTargets: realisticTargets, ...realisticMasters } = realistic.masters;
    expect(masters).toEqual(realisticMasters);
    // The same forecast buckets; their quantities average whatever history there is (spec #126).
    const buckets = (forecasts: typeof tiny.forecasts) => forecasts.map(({ material, location, date }) => `${material}@${location} ${date}`);
    expect(buckets(tiny.forecasts)).toEqual(buckets(realistic.forecasts));
    // Only what starts with the history moves: a BOM's validity, and the safety-stock series' first entries.
    const recipe = ({ output, priority, validThrough, components }: (typeof boms)[number]) => ({ output, priority, validThrough, components });
    expect(boms.map(recipe)).toEqual(realisticBoms.map(recipe));
    expect(new Set(boms.map(({ validFrom }) => validFrom))).toEqual(new Set(["2026-08-01"]));
    expect(safetyStockTargets.map(({ material, location }) => `${material}@${location}`)).toEqual(expect.arrayContaining(realisticTargets.map(({ material, location }) => `${material}@${location}`)));
    expect(tiny.summary.movements).toBeLessThan(realistic.summary.movements / 5);
    expect(tiny.summary.customerOrders).toBeLessThan(100);
    expect(realistic.summary.customerOrders).toBeGreaterThan(100);
  });

  // E2E-020 (`tests/integration/test-reset-api.test.ts`) posts a G1 goods issue for what is left on an Open demo shipment
  // of the tiny dataset the server generated for its day, whatever day the run falls on (#200). The seed issues a
  // shipment in full or not at all, and an order's shipments partition its lines, so a shipment that no goods issue
  // names is Open with each positive line left to issue: those two facts of the timeline are what is asserted.
  it("leaves tiny a shipment that no goods issue names, with positive quantities, on every day of 2025 to 2027", { timeout: 30_000 }, () => {
    for (let today = "2025-01-01"; today <= "2027-12-31"; today = addDays(today, 1)) {
      const { timeline } = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, today);
      const issued = new Set(timeline.flatMap((event) => (event.kind === "goodsIssue" ? [event.shipment] : [])));
      const unissued = timeline.filter((event): event is Extract<TimelineEvent, { kind: "shipment" }> => event.kind === "shipment" && !issued.has(event.key));
      expect(unissued.length, today).toBeGreaterThan(0);
      expect(unissued.every(({ lines }) => lines.every(({ quantity }) => (parseDecimal(quantity) ?? 0n) > 0n)), today).toBe(true);
    }
  });
});
