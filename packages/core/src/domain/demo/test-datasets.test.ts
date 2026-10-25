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

  it("gives every finished product of both datasets an SU factor, 1 SU = 30 kg of finished steel product (#239)", () => {
    for (const dataset of TEST_DATASETS) {
      const finished = generateTestTenantDataset(TEST_DATASET_CONFIGS[dataset], "2026-10-21").masters.materials.filter(({ type }) => type === "finished");
      // 1 SU = 1 / (SU per each) each.
      const factors = finished.map(({ description, conversions }) => [description, conversions.filter(({ unit }) => unit === "SU").map(({ numerator, denominator }) => `${numerator}/${denominator}`)]);
      expect(Object.fromEntries(factors)).toEqual({
        "Cabinet, red": ["1/1"],
        "Office cabinet, grey, 2 doors": ["1/1.2"],
        "Locker, 2 compartments": ["1/0.8"],
        "Locker, 4 compartments": ["1/1.4"],
        "Workshop cabinet, 4 shelves": ["1/1.5"],
        "Steel shelf unit, 5 shelves": ["1/0.9"],
        "Letterbox, galvanised": ["1/0.15"],
        "Tool tray, powder-coated": ["1/0.1"],
        "Document box, A4": ["1/0.05"],
        "Key cabinet, wall-mounted": ["1/0.2"],
      });
    }
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
  // of the tiny dataset the server generated for its day, whatever day the run falls on (#200). Asserted here: such a
  // shipment exists, its lines are positive, and every seeded goods issue takes its shipment's lines in full. Inferred
  // from the planner (`shipmentsOf` splits each order line between an order's shipments, never twice): a shipment that
  // no goods issue names is therefore Open with everything left to issue.
  it("leaves tiny a shipment that no goods issue names, with positive lines, on every day of 2025 to 2027, and issues a shipment in full or not at all", { timeout: 30_000 }, () => {
    for (let today = "2025-01-01"; today <= "2027-12-31"; today = addDays(today, 1)) {
      const { timeline } = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, today);
      const shipments = new Map(timeline.flatMap((event) => (event.kind === "shipment" ? [[event.key, event] as const] : [])));
      const issues = timeline.filter((event): event is Extract<TimelineEvent, { kind: "goodsIssue" }> => event.kind === "goodsIssue");
      for (const issue of issues) {
        expect(issue.lines, `${today} ${issue.shipment}`).toEqual(shipments.get(issue.shipment)?.lines.map(({ quantity, unit }, index) => ({ line: index + 1, quantity, unit })));
      }
      const issued = new Set(issues.map(({ shipment }) => shipment));
      const unissued = [...shipments.values()].filter(({ key }) => !issued.has(key));
      expect(unissued.length, today).toBeGreaterThan(0);
      expect(unissued.every(({ lines }) => lines.every(({ quantity }) => (parseDecimal(quantity) ?? 0n) > 0n)), today).toBe(true);
    }
  });
});
