import { describe, expect, it } from "vitest";
import { isSameRecipe, type RecipeContent } from "./recipe-equality";

const CURRENT: RecipeContent = {
  priority: 1,
  validFrom: "2026-01-01",
  validThrough: null,
  components: [
    { material: "00000004", quantity: "4.000000" },
    { material: "00000002", quantity: "24.000000" },
  ],
};

describe("isSameRecipe", () => {
  it("is the same recipe with the lines in another order (BOM-023)", () => {
    expect(isSameRecipe(CURRENT, { ...CURRENT, components: [...CURRENT.components].reverse() })).toBe(true);
  });

  it("compares quantities as numbers, so a line entered in another unit with the same base quantity is no change", () => {
    const candidate = { ...CURRENT, components: [{ material: "00000004", quantity: "4" }, { material: "00000002", quantity: "24.0" }] };
    expect(isSameRecipe(CURRENT, candidate)).toBe(true);
  });

  it("differs on the priority or either date (BOM-021)", () => {
    expect(isSameRecipe(CURRENT, { ...CURRENT, priority: 2 })).toBe(false);
    expect(isSameRecipe(CURRENT, { ...CURRENT, validFrom: "2026-02-01" })).toBe(false);
    expect(isSameRecipe(CURRENT, { ...CURRENT, validThrough: "2026-12-31" })).toBe(false);
  });

  it("differs on a quantity, a material, or a line added or removed (BOM-020)", () => {
    const [panel, bolt] = CURRENT.components;
    expect(isSameRecipe(CURRENT, { ...CURRENT, components: [panel, { ...bolt, quantity: "20.000000" }] })).toBe(false);
    expect(isSameRecipe(CURRENT, { ...CURRENT, components: [panel, { ...bolt, material: "00000006" }] })).toBe(false);
    expect(isSameRecipe(CURRENT, { ...CURRENT, components: [panel] })).toBe(false);
    expect(isSameRecipe(CURRENT, { ...CURRENT, components: [panel, bolt, { material: "00000006", quantity: "1" }] })).toBe(false);
  });
});
