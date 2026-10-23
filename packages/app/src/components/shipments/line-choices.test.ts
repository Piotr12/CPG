import type { CustomerOrderView, ShipmentView } from "@cpg/core";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { shipmentEditChoices } from "./line-choices";
import { shipmentsLabels } from "./labels";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";
const material = (id: string, description: string, baseUnit: string) => ({ id, type: "finished" as const, description, baseUnit, active: true, createdAt: new Date(), version: 1 });
const materials = new Map([["00000005", material("00000005", "Widget", "each")], ["00000006", material("00000006", "Gadget", "kg")]]);
const orderLine = (id: string, materialId: string, quantity: string, fulfilled: string) => ({
  id, material: materialId, quantity, enteredQuantity: quantity, enteredUnit: "each", numerator: "1", denominator: "1", requiredDate: "2026-11-04",
  fulfilled, posted: false, abandoned: "0.000000", status: "open" as const,
});
const ORDER: CustomerOrderView = {
  id: "00000007", customer: "00000001", location: "00000001", status: "open", version: 1, createdAt: new Date(), updatedAt: new Date(),
  lines: [orderLine(A, "00000005", "50.000000", "30.000000"), orderLine(B, "00000006", "40.000000", "0.000000"), orderLine(C, "00000005", "10.000000", "10.000000"), orderLine(D, "00000006", "8.000000", "0.000000")],
};
const shipmentLine = (line: number, orderLineId: string, materialId: string, quantity: string, issued: string, entered: { quantity: string; unit: string }) => ({
  line, orderLine: orderLineId, material: materialId, quantity, enteredQuantity: entered.quantity, enteredUnit: entered.unit, numerator: "1", denominator: "1",
  issued, posted: issued !== "0.000000", toIssue: "0.000000",
});
const SHIPMENT: ShipmentView = {
  id: "00000011", customerOrder: ORDER.id, customer: "00000001", location: "00000001", plannedDate: "2026-11-03", status: "open", version: 2, createdAt: new Date(),
  lines: [shipmentLine(1, A, "00000005", "50.000000", "30.000000", { quantity: "50", unit: "each" }), shipmentLine(3, D, "00000006", "2.000000", "0.000000", { quantity: "2000", unit: "g" })],
};

describe("shipmentEditChoices", () => {
  it("lists the shipment's lines filled, then the order's other lines with anything outstanding, empty, each named by its order line (shipment edit spec Q8)", () => {
    const choices = shipmentEditChoices(SHIPMENT, ORDER, materials, { "00000005": ["each", "box"], "00000006": ["kg"] }, shipmentsLabels(en));

    expect(choices).toEqual([
      { key: A, label: "Line 1: 00000005 Widget", hint: "Planned 50 each, issued 30 each, at least 30 each", units: ["each", "box"], initial: { quantity: "50", unit: "each" } },
      // Its conversion from g was removed since: the stored unit is still offered, so the line can be sent unchanged.
      { key: D, label: "Line 3: 00000006 Gadget", hint: "Planned 2 kg", units: ["kg", "g"], initial: { quantity: "2000", unit: "g" } },
      // C has nothing outstanding, so only B is offered to add.
      { key: B, label: "Order line 2: 00000006 Gadget", hint: "40 kg outstanding", units: ["kg"] },
    ]);
  });

  it("falls back to the base unit for a material with no listed units", () => {
    const [kept, added] = shipmentEditChoices({ ...SHIPMENT, lines: [SHIPMENT.lines[0]] }, { ...ORDER, lines: [ORDER.lines[0], ORDER.lines[1]] }, materials, {}, shipmentsLabels(en));
    expect(kept.units).toEqual(["each"]);
    expect(added.units).toEqual(["kg"]);
  });
});
