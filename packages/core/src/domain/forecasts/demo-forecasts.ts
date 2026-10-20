/** One demonstration forecast, by the demo material and location IDs. */
export interface DemoForecast {
  material: string;
  location: string;
  date: string;
  quantity: string;
}

/**
 * The forecasts a fresh Test tenant starts with (TEN-001, D06), in ID order, at the main plant: demand for the
 * bolts on one day and for the red cabinet on three consecutive days, none of it tied to a customer.
 */
export const DEMO_FORECASTS: readonly DemoForecast[] = [
  { material: "00000002", location: "00000001", date: "2026-11-02", quantity: "1200.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-02", quantity: "40.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-03", quantity: "55.000000" },
  { material: "00000005", location: "00000001", date: "2026-11-04", quantity: "60.000000" },
];
