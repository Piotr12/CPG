import type { MaterialSummary } from "@cpg/core";
import { describe, expect, it } from "vitest";
import { componentChoices, outputChoices } from "./choices";

const material = (id: string, type: MaterialSummary["type"], active = true): MaterialSummary => ({
  id,
  type,
  description: `M${id}`,
  baseUnit: "each",
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [
  material("00000001", "raw"),
  material("00000002", "intermediate"),
  material("00000003", "finished"),
  material("00000004", "raw", false),
  material("00000005", "finished", false),
];

describe("recipe choices", () => {
  it("offer active intermediate and finished materials as outputs (R02, MAT-029)", () => {
    expect(outputChoices(MATERIALS)).toEqual([
      { value: "00000002", label: "00000002 — M00000002 (each)", description: "M00000002", baseUnit: "each" },
      { value: "00000003", label: "00000003 — M00000003 (each)", description: "M00000003", baseUnit: "each" },
    ]);
  });

  it("offer active raw and intermediate components with their units, and inactive ones the recipe keeps (spec Q10)", () => {
    const units = { "00000001": ["each", "case"], "00000002": ["each"], "00000004": ["each"] };
    expect(componentChoices(MATERIALS, units).map(({ value, units }) => [value, units])).toEqual([
      ["00000001", ["each", "case"]],
      ["00000002", ["each"]],
    ]);
    expect(componentChoices(MATERIALS, units, ["00000004", "00000005"]).map(({ value }) => value)).toEqual(["00000001", "00000002", "00000004"]);
  });
});
