import { describe, expect, it } from "vitest";
import { safetyGap } from "./safety-gap";

describe("safetyGap", () => {
  it("is how far the balance falls below the target, and zero at or above it (MRP-043)", () => {
    expect(safetyGap({ safetyTarget: 40n, projectedBefore: 25n })).toBe(15n);
    expect(safetyGap({ safetyTarget: 40n, projectedBefore: 40n })).toBe(0n);
    expect(safetyGap({ safetyTarget: 40n, projectedBefore: 41n })).toBe(0n);
  });

  it("adds the shortage below zero to the target, and is the shortage alone with no target (DEM-014)", () => {
    expect(safetyGap({ safetyTarget: 40n, projectedBefore: -15_500_000n })).toBe(15_500_040n);
    expect(safetyGap({ safetyTarget: 0n, projectedBefore: -7n })).toBe(7n);
    expect(safetyGap({ safetyTarget: 0n, projectedBefore: 0n })).toBe(0n);
  });
});
