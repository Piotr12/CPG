import { describe, expect, it } from "vitest";
import { BOM_COMPONENTS_MAX, BOM_PRIORITY_MAX, canBeBomComponent, canBeBomOutput } from "./recipe-rules";

describe("recipe rules", () => {
  it("lets intermediate and finished materials be outputs, never raw (BOM-001…003)", () => {
    expect(canBeBomOutput("finished")).toBe(true);
    expect(canBeBomOutput("intermediate")).toBe(true);
    expect(canBeBomOutput("raw")).toBe(false);
  });

  it("lets raw and intermediate materials be components, never finished (BOM-004, BOM-005)", () => {
    expect(canBeBomComponent("raw")).toBe(true);
    expect(canBeBomComponent("intermediate")).toBe(true);
    expect(canBeBomComponent("finished")).toBe(false);
  });

  it("bounds priorities and lines", () => {
    expect(BOM_PRIORITY_MAX).toBe(999);
    expect(BOM_COMPONENTS_MAX).toBe(100);
  });
});
