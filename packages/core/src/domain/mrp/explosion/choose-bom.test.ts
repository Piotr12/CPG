import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpBom } from "../mrp-inputs";
import { chooseBom, validBoms, type ChosenProposal } from "./choose-bom";

const q = (text: string) => parseDecimal(text)!;
const recipe = (overrides: Omit<Partial<MrpBom>, "components"> & { components?: Record<string, string> } = {}): MrpBom => ({
  bom: "00000001",
  revision: 1,
  priority: 1,
  output: "F",
  validFrom: "2026-01-01",
  validThrough: null,
  inactiveComponents: [],
  ...overrides,
  components: Object.entries(overrides.components ?? { A: "1" }).map(([material, perOutput]) => ({ material, perOutput: q(perOutput) })),
});
const proposal = (quantity: string, plannedFinish = "2026-10-10"): ChosenProposal => ({ material: "F", quantity: q(quantity), plannedFinish });
/** Each component's availability from a table of texts; a component not listed gives nothing. */
const stock = (table: Record<string, string>) => (component: string) => q(table[component] ?? "0");
const short = (material: string, required: string, available: string, shortage: string) => ({ material, required: q(required), available: q(available), shortage: q(shortage) });

const first = recipe({ bom: "00000001", priority: 1, components: { A: "1" } });
const second = recipe({ bom: "00000002", priority: 2, components: { B: "1" } });

describe("chooseBom", () => {
  it("MRP-024: priority 1 feasible is chosen, with no fallback and no rejection", () => {
    expect(chooseBom(proposal("6"), [second, first], stock({ A: "6", B: "6" }))).toEqual({ bom: first, feasible: true, rejected: [], shortages: [] });
  });

  it("MRP-046: tests the lot-rounded 6, so 5 A is infeasible by 1 although 4.1 would fit", () => {
    // `sizeProposals` rounded 4.1 up to 6 by a lot multiple of 2; the choice never sees the 4.1.
    expect(chooseBom(proposal("6"), [first], stock({ A: "5" }))).toEqual({
      bom: first,
      feasible: false,
      rejected: [{ bom: "00000001", revision: 1, reason: "shortage", shortages: [short("A", "6", "5", "1")] }],
      shortages: [short("A", "6", "5", "1")],
    });
  });

  it("MRP-025: priority 1 is rejected with A 6 required, 5 available, 1 short, and priority 2 is chosen only when its full 6 B is there", () => {
    const rejection = { bom: "00000001", revision: 1, reason: "shortage", shortages: [short("A", "6", "5", "1")] };
    expect(chooseBom(proposal("6"), [first, second], stock({ A: "5", B: "6" }))).toEqual({ bom: second, feasible: true, rejected: [rejection], shortages: [] });
    expect(chooseBom(proposal("6"), [first, second], stock({ A: "5", B: "5.9" }))).toEqual({
      bom: first,
      feasible: false,
      rejected: [rejection, { bom: "00000002", revision: 1, reason: "shortage", shortages: [short("B", "6", "5.9", "0.1")] }],
      // The chosen BOM's own shortages, never the last candidate's (#369).
      shortages: [short("A", "6", "5", "1")],
    });
  });

  it("BOM-010: the higher BOM's rejection lists each missing component with its shortage, by code, and the available lower one is chosen", () => {
    const higher = recipe({ bom: "00000001", priority: 1, components: { Z: "2", A: "1", C: "0.5" } });
    expect(chooseBom(proposal("10"), [higher, second], stock({ A: "4", C: "5", Z: "30", B: "10" }))).toEqual({
      bom: second,
      feasible: true,
      rejected: [{ bom: "00000001", revision: 1, reason: "shortage", shortages: [short("A", "10", "4", "6")] }],
      shortages: [],
    });
    expect(chooseBom(proposal("10"), [higher, second], stock({ C: "1", Z: "30", B: "10" })).rejected).toEqual([
      { bom: "00000001", revision: 1, reason: "shortage", shortages: [short("A", "10", "0", "10"), short("C", "5", "1", "4")] },
    ]);
  });

  it("MRP-050: priority 1 with inactive R is rejected as inactive-component, and priority 2 with available S is chosen", () => {
    const withR = recipe({ bom: "00000001", priority: 1, components: { R: "1" }, inactiveComponents: ["R"] });
    const withS = recipe({ bom: "00000002", priority: 2, components: { S: "1" } });
    expect(chooseBom(proposal("1"), [withR, withS], stock({ R: "100", S: "1" }))).toEqual({
      bom: withS,
      feasible: true,
      rejected: [{ bom: "00000001", revision: 1, reason: "inactive-component", materials: ["R"] }],
      shortages: [],
    });
  });

  it("BOM-011: when both usable BOMs lack inputs, the highest-priority usable one is returned infeasible with every rejection", () => {
    const inactive = recipe({ bom: "00000003", priority: 1, components: { R: "1" }, inactiveComponents: ["R"] });
    const choice = chooseBom(proposal("2"), [second, recipe({ bom: "00000001", priority: 2, components: { A: "1" } }), inactive], stock({}));
    expect(choice.feasible).toBe(false);
    // Priorities 1 (inactive), then 2 (00000001 and 00000002 are both priority 2, so by code).
    expect(choice.bom.bom).toBe("00000001");
    expect(choice.rejected.map(({ bom, reason }) => [bom, reason])).toEqual([
      ["00000003", "inactive-component"],
      ["00000001", "shortage"],
      ["00000002", "shortage"],
    ]);
  });

  it("clamps a negative availability at zero, so the shortage is the whole requirement", () => {
    expect(chooseBom(proposal("3"), [first], () => q("-5")).rejected).toEqual([{ bom: "00000001", revision: 1, reason: "shortage", shortages: [short("A", "3", "0", "3")] }]);
  });

  it("tests only the BOMs valid on the planned finish", () => {
    const later = recipe({ bom: "00000001", priority: 1, validFrom: "2026-10-11" });
    expect(chooseBom(proposal("1"), [later, second], stock({ A: "1", B: "1" })).bom).toBe(second);
  });

  it("throws when no BOM valid on the planned finish is usable, which Missing BOM and Missing Usable BOM prevent", () => {
    const inactive = recipe({ inactiveComponents: ["A"] });
    expect(() => chooseBom(proposal("1"), [inactive], stock({ A: "1" }))).toThrow("No usable BOM of F is valid on 2026-10-10");
    expect(() => chooseBom(proposal("1"), [], stock({}))).toThrow("No usable BOM of F");
  });
});

describe("validBoms", () => {
  it("keeps the BOMs valid on the date, by priority, then BOM code, whatever the input order", () => {
    const boms = [
      recipe({ bom: "00000004", priority: 3 }),
      recipe({ bom: "00000003", priority: 2 }),
      recipe({ bom: "00000002", priority: 2 }),
      recipe({ bom: "00000001", priority: 1, validThrough: "2026-10-09" }),
    ];
    expect(validBoms(boms, "2026-10-10").map(({ bom }) => bom)).toEqual(["00000002", "00000003", "00000004"]);
  });
});
