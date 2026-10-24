import { expect, it } from "vitest";
import { completionMaterials, production } from "../../../../../tests/setup/production-orders";
import { completionInputs } from "./completion-inputs";

it("offers active raw and intermediate materials outside the recipe and the output, as picker choices with their units (spec Q5, #217)", () => {
  const order = { ...production, output: "00000009", components: [{ ...production.components[0], material: "00000006" }] };
  const materials = [...completionMaterials, { ...completionMaterials[0], id: "00000010", description: "Retired", type: "raw" as const, active: false }];
  expect(completionInputs(order, materials, { "00000007": ["each"], "00000008": ["kg", "g"] })).toEqual([
    { value: "00000007", code: "00000007", name: "Wrapper", detail: "each", units: ["each"] },
    { value: "00000008", code: "00000008", name: "Milk", detail: "kg", units: ["kg", "g"] },
  ]);
  // A material missing from the unit list is entered in its base unit.
  expect(completionInputs(order, materials, {}).map(({ units }) => units)).toEqual([["each"], ["kg"]]);
});
