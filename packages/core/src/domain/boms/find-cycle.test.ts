import { describe, expect, it } from "vitest";
import { findCycle, type RecipeEdge } from "./find-cycle";

const edge = (bom: string, output: string, component: string): RecipeEdge => ({ bom, output, component });

describe("findCycle", () => {
  it("finds the one-step cycle of an output that is its own component (BOM-024)", () => {
    expect(findCycle([], { bom: null, output: "A", components: ["X", "A"] })).toEqual([{ from: "A", to: "A", bom: null }]);
  });

  it("finds the path back to the output through other BOMs, starting at the saved one (BOM-025)", () => {
    const edges = [edge("BOM-A", "A", "B"), edge("BOM-B", "B", "C"), edge("BOM-C", "C", "X")];
    expect(findCycle(edges, { bom: "BOM-C", output: "C", components: ["A"] })).toEqual([
      { from: "C", to: "A", bom: "BOM-C" },
      { from: "A", to: "B", bom: "BOM-A" },
      { from: "B", to: "C", bom: "BOM-B" },
    ]);
  });

  it("ignores the saved BOM's old edges, which the new recipe replaces", () => {
    const edges = [edge("BOM-A", "A", "B"), edge("BOM-B", "B", "A")];
    expect(findCycle(edges, { bom: "BOM-B", output: "B", components: ["X"] })).toBeNull();
  });

  it("accepts a diamond: two paths to one material are no cycle", () => {
    const edges = [edge("1", "B", "D"), edge("2", "C", "D"), edge("3", "D", "R")];
    expect(findCycle(edges, { bom: null, output: "A", components: ["B", "C"] })).toBeNull();
  });

  it("returns a shortest path when there are several", () => {
    const edges = [edge("1", "B", "C"), edge("2", "C", "A"), edge("3", "B", "A")];
    expect(findCycle(edges, { bom: null, output: "A", components: ["B"] })).toEqual([
      { from: "A", to: "B", bom: null },
      { from: "B", to: "A", bom: "3" },
    ]);
  });
});
