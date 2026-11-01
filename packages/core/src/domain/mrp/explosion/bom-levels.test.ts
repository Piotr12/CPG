import { describe, expect, it } from "vitest";
import type { MrpBom } from "../mrp-inputs";
import { bomLevels } from "./bom-levels";

/** BOM `bom`'s current revision making `output` from `components` (one per output each). */
const recipe = (bom: string, output: string, ...components: string[]): MrpBom => ({
  bom,
  revision: 1,
  priority: 1,
  output,
  validFrom: "2026-01-01",
  validThrough: null,
  componentsActive: true,
  components: components.map((material) => ({ material, perOutput: 1_000_000n })),
});

describe("bomLevels", () => {
  it("gives a chain F → I → R levels 0, 1 and 2, and lists no material off every edge", () => {
    const { levelOf, cycles } = bomLevels([recipe("B1", "F", "I"), recipe("B2", "I", "R")]);
    expect([...levelOf].sort()).toEqual([["F", 0], ["I", 1], ["R", 2]]);
    expect(levelOf.has("X")).toBe(false);
    expect(cycles.size).toBe(0);
  });

  it("keeps the longest chain in a diamond: R under F directly and through I is level 2", () => {
    const { levelOf, cycles } = bomLevels([recipe("B1", "F", "I", "R"), recipe("B2", "I", "R"), recipe("B3", "G", "R")]);
    expect(Object.fromEntries(levelOf)).toEqual({ F: 0, G: 0, I: 1, R: 2 });
    expect(cycles.size).toBe(0);
  });

  it("counts every alternative BOM of an output, so a component plans after each output that could use it", () => {
    const { levelOf } = bomLevels([recipe("B1", "F", "I"), recipe("B2", "F", "R"), recipe("B3", "I", "R")]);
    expect(levelOf.get("R")).toBe(2);
  });

  it("names a two-member cycle on each member, starting and ending at it", () => {
    const { cycles } = bomLevels([recipe("00000002", "X", "Y"), recipe("00000001", "Y", "X")]);
    expect(Object.fromEntries(cycles)).toEqual({
      X: "X →(BOM 00000002) Y →(BOM 00000001) X",
      Y: "Y →(BOM 00000001) X →(BOM 00000002) Y",
    });
  });

  it("names a three-member cycle and a self-edge", () => {
    const { cycles } = bomLevels([recipe("B1", "A", "B"), recipe("B2", "B", "C"), recipe("B3", "C", "A"), recipe("B4", "S", "S")]);
    expect(cycles.get("A")).toBe("A →(BOM B1) B →(BOM B2) C →(BOM B3) A");
    expect(cycles.get("C")).toBe("C →(BOM B3) A →(BOM B1) B →(BOM B2) C");
    expect(cycles.get("S")).toBe("S →(BOM B4) S");
  });

  it("gives each member of a component of two loops, A ↔ B and A ↔ C, a path through itself", () => {
    const { cycles } = bomLevels([recipe("B1", "A", "B", "C"), recipe("B2", "B", "A"), recipe("B3", "C", "A")]);
    expect(Object.fromEntries(cycles)).toEqual({
      A: "A →(BOM B1) B →(BOM B2) A",
      B: "B →(BOM B2) A →(BOM B1) B",
      C: "C →(BOM B3) A →(BOM B1) C",
    });
  });

  it("names the shortest cycle across a BOM's components, not the first component's: X → Z → X over X → A → C → X", () => {
    const { cycles } = bomLevels([recipe("B1", "X", "A", "Z"), recipe("B2", "A", "C"), recipe("B3", "C", "X"), recipe("B4", "Z", "X")]);
    expect(cycles.get("X")).toBe("X →(BOM B1) Z →(BOM B4) X");
  });

  it("breaks a tie between equally short cycles by BOM code, then component code", () => {
    const { cycles } = bomLevels([recipe("B2", "X", "A"), recipe("B1", "X", "Z", "Y"), recipe("B3", "A", "X"), recipe("B4", "Y", "X"), recipe("B5", "Z", "X")]);
    expect(cycles.get("X")).toBe("X →(BOM B1) Y →(BOM B4) X");
  });

  it("tries a member's BOMs in code order until one closes a cycle", () => {
    const { cycles } = bomLevels([recipe("B1", "X", "R"), recipe("B2", "X", "Y"), recipe("B3", "Y", "X")]);
    expect(cycles.get("X")).toBe("X →(BOM B2) Y →(BOM B3) X");
    expect(cycles.has("R")).toBe(false);
  });

  it("drops a cycle's own edges, keeping the level a sound parent gives a member, so every level is finite", () => {
    const { levelOf, cycles } = bomLevels([recipe("B1", "F", "X"), recipe("B2", "X", "Y", "R"), recipe("B3", "Y", "X"), recipe("B4", "G", "R")]);
    expect(Object.fromEntries(levelOf)).toEqual({ F: 0, G: 0, R: 1, X: 1, Y: 0 });
    expect([...cycles.keys()].sort()).toEqual(["X", "Y"]);
  });

  it("gives the same levels and paths for a shuffled input", () => {
    const boms = [recipe("B1", "F", "I", "X"), recipe("B2", "I", "R"), recipe("B3", "X", "Y"), recipe("B4", "Y", "X", "R"), recipe("B5", "Y", "R")];
    const forward = bomLevels(boms);
    const shuffled = bomLevels([...boms].reverse().map((bom) => ({ ...bom, components: [...bom.components].reverse() })));
    expect(Object.fromEntries(shuffled.levelOf)).toEqual(Object.fromEntries(forward.levelOf));
    expect(Object.fromEntries(shuffled.cycles)).toEqual(Object.fromEntries(forward.cycles));
  });

  it("levels a 2,000-deep chain without overflowing the stack", () => {
    const code = (index: number) => `M${String(index).padStart(5, "0")}`;
    const boms = Array.from({ length: 2_000 }, (_, index) => recipe(`B${index}`, code(index), code(index + 1)));
    const { levelOf, cycles } = bomLevels(boms);
    expect(levelOf.get(code(2_000))).toBe(2_000);
    expect(cycles.size).toBe(0);
  });
});
