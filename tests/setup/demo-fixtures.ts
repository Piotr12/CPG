import type { DemoBom, DemoForecast, DemoMaterial, DemoPlanningParameters, DemoSafetyStockTarget } from "../../packages/core/src/domain/demo/generate-dataset";

/*
 * A small, fixed set of master and document rows for unit tests: a red cabinet and what it's made of,
 * at three locations. The services' `seedDemo(rows)` take them as the generated dataset's rows; the
 * Test tenant itself is seeded with the generated dataset (spec `2026-10-21--0718UTC-test-tenant-dataset`).
 * Materials, locations, customers and suppliers get IDs 00000001… in this order.
 */

/** Every material type once, with the acceptance catalogue's conversions (case = 12 each, tonne = 1000 kg). */
export const FIXTURE_MATERIALS: readonly DemoMaterial[] = [
  { type: "raw", description: "Steel sheet 2 mm", baseUnit: "kg", conversions: [{ unit: "t", numerator: "1000", denominator: "1" }] },
  {
    type: "raw",
    description: "Bolt M8",
    baseUnit: "each",
    conversions: [
      { unit: "case", numerator: "12", denominator: "1" },
      { unit: "box", numerator: "100", denominator: "1" },
    ],
  },
  { type: "raw", description: "Paint, red", baseUnit: "l", conversions: [{ unit: "ml", numerator: "1", denominator: "1000" }] },
  { type: "intermediate", description: "Painted side panel", baseUnit: "each", conversions: [] },
  { type: "finished", description: "Cabinet, red", baseUnit: "each", conversions: [{ unit: "pallet", numerator: "20", denominator: "1" }] },
  { type: "raw", description: "Cardboard box", baseUnit: "each", conversions: [{ unit: "bundle", numerator: "25", denominator: "1" }] },
];

export const FIXTURE_LOCATIONS: readonly string[] = ["Main plant, Wrocław", "Finished goods warehouse, Poznań", "Contract packer, Łódź"];

export const FIXTURE_CUSTOMERS: readonly string[] = [
  "Hardware Store Chain Sp. z o.o.",
  "Office Interiors S.A.",
  "Online shop (direct sales)",
  "Export distributor (DE)",
];

export const FIXTURE_SUPPLIERS: readonly string[] = ["Steel Service Centre Sp. z o.o.", "Fasteners Wholesale", "Packaging Supplies Ltd."];

/** The painted side panel, and two alternatives for the red cabinet; the second enters its bolts as 2 cases (24 each) and ends in 2026. */
export const FIXTURE_BOMS: readonly DemoBom[] = [
  {
    output: "00000004",
    priority: 1,
    validFrom: "2026-01-01",
    validThrough: null,
    components: [
      { material: "00000001", quantity: "4.5", unit: "kg" },
      { material: "00000003", quantity: "250", unit: "ml" },
    ],
  },
  {
    output: "00000005",
    priority: 1,
    validFrom: "2026-01-01",
    validThrough: null,
    components: [
      { material: "00000004", quantity: "4", unit: "each" },
      { material: "00000002", quantity: "16", unit: "each" },
      { material: "00000006", quantity: "1", unit: "each" },
    ],
  },
  {
    output: "00000005",
    priority: 2,
    validFrom: "2026-01-01",
    validThrough: "2026-12-31",
    components: [
      { material: "00000004", quantity: "4", unit: "each" },
      { material: "00000002", quantity: "2", unit: "case" },
      { material: "00000006", quantity: "1", unit: "each" },
    ],
  },
];

/** Everything planned at the main plant, and the painted side panel also bought at the contract packer (Make at one site, Buy at another). */
export const FIXTURE_PLANNING_PARAMETERS: readonly DemoPlanningParameters[] = [
  { material: "00000001", location: "00000001", procurement: "buy", leadTimeDays: 14, minimumQuantity: "500.000000", lotMultiple: "100.000000" },
  { material: "00000002", location: "00000001", procurement: "buy", leadTimeDays: 7, minimumQuantity: "1000.000000", lotMultiple: "100.000000" },
  { material: "00000003", location: "00000001", procurement: "buy", leadTimeDays: 10, minimumQuantity: "20.000000", lotMultiple: "5.000000" },
  { material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50.000000", lotMultiple: "10.000000" },
  { material: "00000004", location: "00000003", procurement: "buy", leadTimeDays: 5, minimumQuantity: "100.000000", lotMultiple: "50.000000" },
  { material: "00000005", location: "00000001", procurement: "make", leadTimeDays: 3, minimumQuantity: "20.000000", lotMultiple: "20.000000" },
  { material: "00000006", location: "00000001", procurement: "buy", leadTimeDays: 5, minimumQuantity: "100.000000", lotMultiple: "25.000000" },
];

/** At the main plant: the red cabinet's buffer doubles from 2027 (a series over time), and the bolts keep one target. */
export const FIXTURE_SAFETY_STOCK_TARGETS: readonly DemoSafetyStockTarget[] = [
  { material: "00000002", location: "00000001", effectiveFrom: "2026-01-01", quantity: "500.000000" },
  { material: "00000005", location: "00000001", effectiveFrom: "2026-01-01", quantity: "20.000000" },
  { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01", quantity: "40.000000" },
];

/** At the main plant: the bolts on one day and the red cabinet on three consecutive days. */
export const FIXTURE_FORECASTS: readonly DemoForecast[] = [
  { material: "00000002", location: "00000001", date: "2026-11-02", quantity: "1200.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-02", quantity: "40.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-03", quantity: "55.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-04", quantity: "60.000000" },
];

/** Opening stock of every fixture material, in its base unit. */
export const FIXTURE_STOCK = [
  { material: "00000001", location: "00000001", quantity: "500", unit: "kg" },
  { material: "00000002", location: "00000001", quantity: "1000", unit: "each" },
  { material: "00000003", location: "00000001", quantity: "40", unit: "l" },
  { material: "00000004", location: "00000001", quantity: "25", unit: "each" },
  { material: "00000005", location: "00000002", quantity: "10", unit: "each" },
  { material: "00000006", location: "00000001", quantity: "50", unit: "each" },
] as const;

/** 100 kg of steel sheet, and 5 cases of bolts (60 each). */
export const FIXTURE_REQUISITIONS = [
  { material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2026-11-02" },
  { material: "00000002", location: "00000001", quantity: "5", unit: "case", requiredDate: "2026-11-09" },
] as const;

/**
 * One order to the first supplier that converts 60 of the steel requisition's 100 kg and buys paint
 * directly, on two dates. `requisition` is the 1-based position in `FIXTURE_REQUISITIONS`.
 */
export const FIXTURE_ORDERS: readonly { supplier: string; location: string; lines: { material: string; quantity: string; unit: string; plannedDate: string; requisition?: number }[] }[] = [
  {
    supplier: "00000001",
    location: "00000001",
    lines: [
      { material: "00000001", quantity: "60", unit: "kg", plannedDate: "2026-11-04", requisition: 1 },
      { material: "00000003", quantity: "20", unit: "l", plannedDate: "2026-11-06" },
    ],
  },
];

/** One production order of 10 painted side panels at the main plant. */
export const FIXTURE_PRODUCTION_ORDER = { output: "00000004", location: "00000001", quantity: "10", unit: "each", plannedFinish: "2026-11-15" };
