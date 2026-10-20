import { describe, expect, it } from "vitest";
import { recipeDiff, type DiffLine } from "./recipe-diff";

const line = (material: string, quantity: string, unit = "kg"): DiffLine => ({ material, quantity, unit });

describe("recipeDiff", () => {
  it("names the changed, removed and added components (XLS-025)", () => {
    const before = [line("A", "1.000000"), line("B", "2.000000")];
    const after = [line("A", "1.500000"), line("C", "1.000000")];
    expect(recipeDiff(before, after)).toEqual([
      { material: "A", before: "1.000000 kg", after: "1.500000 kg" },
      { material: "C", before: null, after: "1.000000 kg" },
      { material: "B", before: "2.000000 kg", after: null },
    ]);
  });

  it("reports a component left out as removed (XLS-021)", () => {
    const before = [line("A", "1.000000"), line("B", "1.000000"), line("C", "1.000000", "each")];
    expect(recipeDiff(before, before.slice(0, 2))).toEqual([{ material: "C", before: "1.000000 each", after: null }]);
  });

  it("finds nothing when only the order differs", () => {
    const lines = [line("A", "1.000000"), line("B", "2.000000")];
    expect(recipeDiff(lines, [...lines].reverse())).toEqual([]);
  });
});
