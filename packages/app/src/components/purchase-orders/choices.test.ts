import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { requisitionChoices } from "./choices";
import { byId, ordersLabels } from "./labels";

const materials = byId([{ id: "00000001", type: "raw" as const, description: "Steel", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }]);
const requisition = (id: string, status: string, outstanding: string) => ({
  id,
  material: "00000001",
  location: "00000002",
  quantity: "100.000000",
  enteredQuantity: "100",
  enteredUnit: "kg",
  numerator: "1",
  denominator: "1",
  requiredDate: "2027-03-01",
  converted: "0.000000",
  outstanding,
  status,
  createdAt: new Date(),
  version: 1,
});

describe("requisitionChoices", () => {
  it("offer the open requisitions with what is outstanding in the base unit, and not a completed one (BUY-003)", () => {
    const choices = requisitionChoices(
      [requisition("00000001", "open", "40.000000"), requisition("00000002", "completed", "0.000000")] as never,
      materials,
      ordersLabels(en),
    );

    expect(choices).toEqual([{ value: "00000001", label: "00000001 — 40 kg outstanding", material: "00000001", location: "00000002" }]);
  });
});
