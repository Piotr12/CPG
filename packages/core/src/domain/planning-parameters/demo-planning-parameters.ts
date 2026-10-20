import type { ProcurementMode } from "./procurement";

/** One demonstration parameter set, by the demo material and location IDs. */
export interface DemoPlanningParameters {
  material: string;
  location: string;
  procurement: ProcurementMode;
  leadTimeDays: number;
  minimumQuantity: string;
  lotMultiple: string;
}

/**
 * The parameter sets a fresh Test tenant starts with (TEN-001, D06), on the demo materials (#22) and
 * locations (#23): everything planned at the main plant (00000001), and the painted side panel also
 * bought from the contract packer (00000003), so one intermediate is Make at one site and Buy at
 * another (MAT-015). Quantities are in each material's base unit, in the stored six-decimal form.
 */
export const DEMO_PLANNING_PARAMETERS: readonly DemoPlanningParameters[] = [
  { material: "00000001", location: "00000001", procurement: "buy", leadTimeDays: 14, minimumQuantity: "500.000000", lotMultiple: "100.000000" },
  { material: "00000002", location: "00000001", procurement: "buy", leadTimeDays: 7, minimumQuantity: "1000.000000", lotMultiple: "100.000000" },
  { material: "00000003", location: "00000001", procurement: "buy", leadTimeDays: 10, minimumQuantity: "20.000000", lotMultiple: "5.000000" },
  { material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50.000000", lotMultiple: "10.000000" },
  { material: "00000004", location: "00000003", procurement: "buy", leadTimeDays: 5, minimumQuantity: "100.000000", lotMultiple: "50.000000" },
  { material: "00000005", location: "00000001", procurement: "make", leadTimeDays: 3, minimumQuantity: "20.000000", lotMultiple: "20.000000" },
  { material: "00000006", location: "00000001", procurement: "buy", leadTimeDays: 5, minimumQuantity: "100.000000", lotMultiple: "25.000000" },
];
