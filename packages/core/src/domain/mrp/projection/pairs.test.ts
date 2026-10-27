import { describe, expect, it } from "vitest";
import { compareCodes, comparePairs, pairKey } from "./pairs";

describe("MRP pairs", () => {
  it("keys a material and a location without confusing where one ends", () => {
    expect(pairKey("AB", "C")).not.toBe(pairKey("A", "BC"));
    expect(pairKey("M1", "L1")).toBe(pairKey("M1", "L1"));
  });

  it("compares business IDs in code-unit order", () => {
    expect(compareCodes("a", "b")).toBe(-1);
    expect(compareCodes("b", "a")).toBe(1);
    expect(compareCodes("a", "a")).toBe(0);
    expect(["M2", "a1", "M10", "Z9"].sort(compareCodes)).toEqual(["M10", "M2", "Z9", "a1"]);
  });

  it("orders pairs by material, then location", () => {
    const pairs = [
      { material: "M2", location: "L1" },
      { material: "M1", location: "L2" },
      { material: "M1", location: "L1" },
    ];
    expect([...pairs].sort(comparePairs)).toEqual([
      { material: "M1", location: "L1" },
      { material: "M1", location: "L2" },
      { material: "M2", location: "L1" },
    ]);
  });
});
