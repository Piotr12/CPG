import type { CustomerOrderView, MaterialSummary, NamedRecordView, TenantInfo } from "@cpg/core";
import { en } from "../../packages/app/src/i18n/messages/en";
import { orderLabels } from "../../packages/app/src/components/customer-orders/labels";
export const tenant: TenantInfo = { code: "test", name: "Test", generation: 1, readOnly: false };
export const order: CustomerOrderView = {
  id: "00000001", customer: "00000001", location: "00000001", status: "open", version: 3,
  createdAt: new Date("2026-10-20T12:00:00Z"), updatedAt: new Date("2026-10-20T12:01:00Z"),
  lines: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", material: "00000005", quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1", requiredDate: "2027-01-04", fulfilled: "0.000000", posted: false, abandoned: "0.000000", status: "open" }],
};
export const materials: MaterialSummary[] = [
  { id: "00000005", description: "Cabinet", baseUnit: "each", type: "finished", active: true, version: 1, createdAt: order.createdAt },
  { id: "00000004", description: "Old panel", baseUnit: "each", type: "intermediate", active: false, version: 1, createdAt: order.createdAt },
];
const named = (name: string): NamedRecordView[] => [
  { id: "00000001", name, active: true, version: 1, createdAt: order.createdAt },
  { id: "00000002", name: `Old ${name}`, active: false, version: 1, createdAt: order.createdAt },
];
export const customers = named("Customer A");
export const locations = named("Warehouse");
export const choices = {
  customers: customers.map(({ id, name, active }) => ({ id, name, active })),
  locations: locations.map(({ id, name, active }) => ({ id, name, active })),
  materials: materials.map(({ id, description, active, baseUnit }) => ({ value: id, code: id, name: description, detail: baseUnit, active, units: ["each", "case"] })),
};
export const labels = orderLabels(en);
export const initial = { customer: order.customer, location: order.location,
  lines: order.lines.map(({ id, material, enteredQuantity, enteredUnit, requiredDate }) => ({ id, material, quantity: enteredQuantity, unit: enteredUnit, requiredDate })) };
