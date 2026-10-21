import type { CompletionPreview, CompletionView, MaterialSummary, ProductionOrderDetail } from "@cpg/core";
import { materials } from "./customer-orders";
export { materials, locations, tenant } from "./customer-orders";
export const production: ProductionOrderDetail = {
  hasProcessing: false,
  id: "00000001", output: "00000005", location: "00000001", bom: "00000002", revision: 3,
  quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1",
  plannedFinish: "2027-01-04", plannedStart: "2026-12-30", leadTimeDays: 5,
  produced: "0.000000", outstanding: "24.000000", abandoned: "0.000000", status: "open", version: 1, createdAt: new Date(), updatedAt: new Date(),
  components: [{ material: "00000005", baseUnit: "kg", active: true, quantity: "2.000000", required: "48.000000", available: "30.000000", shortage: "18.000000" }],
  shortages: [{ material: "00000005", baseUnit: "kg", active: true, quantity: "2.000000", required: "48.000000", available: "30.000000", shortage: "18.000000" }],
};
export const productionInput = { output: production.output, location: production.location, quantity: "2", unit: "case", plannedFinish: production.plannedFinish };
export const productionOptions = { quantity: production.quantity, plannedStart: production.plannedStart, leadTimeDays: 5,
  selected: { bom: production.bom, revision: production.revision },
  alternatives: [{ bom: production.bom, revision: production.revision, priority: 1, validFrom: "2026-01-01", validThrough: null, components: production.components },
    { bom: "00000003", revision: 1, priority: 2, validFrom: "2026-01-01", validThrough: null, components: production.components }],
};

/** The masters a completion uses: the shared ones plus cocoa and wrappers (pinned) and milk and filling (added inputs). */
export const completionMaterials: MaterialSummary[] = [
  ...materials,
  ...[["00000006", "Cocoa", "kg", "raw"], ["00000007", "Wrapper", "each", "raw"], ["00000008", "Milk", "kg", "raw"], ["00000009", "Filling", "kg", "intermediate"]].map(
    ([id, description, baseUnit, type]) => ({ id, description, baseUnit, type: type as MaterialSummary["type"], active: true, version: 1, createdAt: new Date("2026-10-20T12:00:00Z") }),
  ),
];
/** What a completion of 4 expects of a recipe of 0.5 kg cocoa and 2 wrappers per output (PRD-010); the wrapper has since been deactivated. */
export const completionPreview: CompletionPreview = {
  order: "00000001", location: "00000001", quantity: "4", baseQuantity: "4.000000", baseUnit: "each",
  produced: "0.000000", target: "24.000000", producedAfter: "4.000000", exceedsTarget: false,
  components: [
    { material: "00000006", description: "Cocoa", baseUnit: "kg", units: ["kg", "g"], active: true, perOutput: "0.500000", expected: "2.000000", available: "40.000000" },
    { material: "00000007", description: "Wrapper", baseUnit: "each", units: ["each"], active: false, perOutput: "2.000000", expected: "8.000000", available: "0.000000" },
  ],
};
/** A posted completion of 40 using 2 kg less cocoa than expected and an added 2 kg of milk (PRD-013, PRD-015). */
export const completionView: CompletionView = {
  id: "00000002", order: "00000001", businessDate: "2026-10-21", quantity: "40.000000", enteredQuantity: "40", enteredUnit: "each", baseUnit: "each",
  waste: false, createdAt: new Date("2026-10-21T08:00:00Z"),
  lines: [
    { material: "00000006", baseUnit: "kg", expected: "20.000000", actual: "18.000000", variance: "-2.000000", enteredQuantity: "18", enteredUnit: "kg", extra: false },
    { material: "00000007", baseUnit: "each", expected: "80.000000", actual: "80.000000", variance: "0.000000", enteredQuantity: "80", enteredUnit: "each", extra: false },
    { material: "00000008", baseUnit: "kg", expected: "0.000000", actual: "2.000000", variance: "2.000000", enteredQuantity: "2", enteredUnit: "kg", extra: true },
  ],
  reversal: null,
};
/** A waste posting: nothing produced, 10 kg of cocoa used (PRD-018). */
export const wasteView: CompletionView = {
  ...completionView, id: "00000001", businessDate: "2026-10-20", quantity: "0.000000", enteredQuantity: "0", waste: true,
  lines: [{ material: "00000006", baseUnit: "kg", expected: "0.000000", actual: "10.000000", variance: "10.000000", enteredQuantity: "10", enteredUnit: "kg", extra: false }],
};
