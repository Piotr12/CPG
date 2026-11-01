import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpBom } from "../mrp-inputs";
import { explodeProposal, type ExplodedProposal } from "./explode-proposal";

const q = (text: string) => parseDecimal(text)!;
const recipe = (overrides: Omit<Partial<MrpBom>, "components"> & { components?: Record<string, string> } = {}): MrpBom => ({
  bom: "00000001",
  revision: 1,
  priority: 1,
  output: "P",
  validFrom: "2026-01-01",
  validThrough: null,
  inactiveComponents: [],
  ...overrides,
  components: Object.entries(overrides.components ?? { A: "1" }).map(([material, perOutput]) => ({ material, perOutput: q(perOutput) })),
});
const proposal = (quantity: string, overrides: Partial<ExplodedProposal> = {}): ExplodedProposal => ({
  material: "P",
  location: "L1",
  needDate: "2026-10-10",
  plannedStart: "2026-10-07",
  quantity: q(quantity),
  ...overrides,
});

describe("explodeProposal", () => {
  it("BOM-006: 0.5 kg A and 0.2 l B per one, for 10, need 5 and 2 on the planned start, at the proposal's location, through the chosen BOM", () => {
    expect(explodeProposal(proposal("10"), recipe({ bom: "00000004", revision: 2, components: { A: "0.5", B: "0.2" } }), false)).toEqual([
      { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "A", location: "L1", date: "2026-10-07", quantity: q("5"), provisional: false },
      { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "B", location: "L1", date: "2026-10-07", quantity: q("2"), provisional: false },
    ]);
  });

  it("BOM-007: 0.125 × 4 is exactly 0.5, and 0.333333 for 0.5 (0.1666665) is rounded up once to 0.166667", () => {
    expect(explodeProposal(proposal("4"), recipe({ components: { A: "0.125" } }), false)[0].quantity).toBe(q("0.5"));
    expect(explodeProposal(proposal("0.5"), recipe({ components: { A: "0.333333" } }), false)[0].quantity).toBe(q("0.166667"));
  });

  it("marks every need of a proposal with no feasible BOM provisional (E17-S02, BOM-011)", () => {
    expect(explodeProposal(proposal("1"), recipe({ components: { A: "1", B: "2" } }), true).map(({ provisional }) => provisional)).toEqual([true, true]);
  });
});
