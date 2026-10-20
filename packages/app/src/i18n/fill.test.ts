import { expect, it } from "vitest";
import { fill } from "./fill";
it("fills known context, retaining unknown placeholders", () => {
  expect(fill("Material {material}: {quantity} {unit}", { material: "00000001", quantity: "2.000000" })).toBe("Material 00000001: 2.000000 {unit}");
});
