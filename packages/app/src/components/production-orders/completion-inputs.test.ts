import { expect, it } from "vitest";
import { completionMaterials, production } from "../../../../../tests/setup/production-orders";
import { completionInputs } from "./completion-inputs";

it("offers active raw and intermediate materials outside the recipe and the output, with their units (spec Q5)", () => {
  const order = { ...production, output: "00000009", components: [{ ...production.components[0], material: "00000006" }] };
  const materials = [...completionMaterials, { ...completionMaterials[0], id: "00000010", description: "Retired", type: "raw" as const, active: false }];
  expect(completionInputs(order, materials, { "00000007": ["each"], "00000008": ["kg", "g"] })).toEqual([
    { value: "00000007", label: "00000007 — Wrapper (each)", units: ["each"] },
    { value: "00000008", label: "00000008 — Milk (kg)", units: ["kg", "g"] },
  ]);
});
