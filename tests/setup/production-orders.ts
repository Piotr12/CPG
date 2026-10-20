import type { ProductionOrderDetail } from "@cpg/core";
export { materials, locations, tenant } from "./customer-orders";
export const production: ProductionOrderDetail = {
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
