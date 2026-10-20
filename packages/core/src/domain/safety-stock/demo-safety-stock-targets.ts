/** One demonstration safety-stock target, by the demo material and location IDs. */
export interface DemoSafetyStockTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: string;
}

/**
 * The targets a fresh Test tenant starts with (TEN-001, D06), at the main plant: the red cabinet's
 * buffer doubles from 2027 (a series over time, DEM-016), and the bolts keep one target.
 */
export const DEMO_SAFETY_STOCK_TARGETS: readonly DemoSafetyStockTarget[] = [
  { material: "00000002", location: "00000001", effectiveFrom: "2026-01-01", quantity: "500.000000" },
  { material: "00000005", location: "00000001", effectiveFrom: "2026-01-01", quantity: "20.000000" },
  { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01", quantity: "40.000000" },
];
