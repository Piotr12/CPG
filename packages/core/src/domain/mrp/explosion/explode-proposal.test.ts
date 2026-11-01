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
  componentsActive: true,
  ...overrides,
  components: Object.entries(overrides.components ?? { A: "1" }).map(([material, perOutput]) => ({ material, perOutput: q(perOutput) })),
});
const proposal = (quantity: string, overrides: Partial<ExplodedProposal> = {}): ExplodedProposal => ({
  material: "P",
  location: "L1",
  needDate: "2026-10-10",
  plannedStart: "2026-10-07",
  plannedFinish: "2026-10-10",
  quantity: q(quantity),
  ...overrides,
});

describe("explodeProposal", () => {
  it("BOM-006: 0.5 kg A and 0.2 l B per one, for 10, need 5 and 2 on the planned start, at the proposal's location, through its BOM", () => {
    expect(explodeProposal(proposal("10"), [recipe({ bom: "00000004", revision: 2, components: { A: "0.5", B: "0.2" } })])).toEqual({
      bom: "00000004",
      bomRevision: 2,
      components: [
        { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "A", location: "L1", date: "2026-10-07", quantity: q("5") },
        { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "B", location: "L1", date: "2026-10-07", quantity: q("2") },
      ],
    });
  });

  it("BOM-007: 0.125 × 4 is exactly 0.5, and 0.333333 for 0.5 (0.1666665) is rounded up once to 0.166667", () => {
    expect(explodeProposal(proposal("4"), [recipe({ components: { A: "0.125" } })]).components[0].quantity).toBe(q("0.5"));
    expect(explodeProposal(proposal("0.5"), [recipe({ components: { A: "0.333333" } })]).components[0].quantity).toBe(q("0.166667"));
  });

  it("takes the highest priority valid on the planned finish, never one valid only on the need's start, then the lowest BOM code", () => {
    const late = proposal("1", { plannedStart: "2026-10-01", needDate: "2026-10-02", plannedFinish: "2026-10-12" });
    const boms = [
      recipe({ bom: "00000001", priority: 1, validThrough: "2026-10-11" }),
      recipe({ bom: "00000003", priority: 2, validFrom: "2026-10-12" }),
      recipe({ bom: "00000002", priority: 2, validFrom: "2026-10-12" }),
      recipe({ bom: "00000004", priority: 3 }),
    ];
    expect(explodeProposal(late, boms).bom).toBe("00000002");
  });

  it("prefers a BOM whose components are all active over a higher priority one, and falls back to the priority order when none is", () => {
    const inactive = recipe({ bom: "00000001", priority: 1, componentsActive: false });
    expect(explodeProposal(proposal("1"), [inactive, recipe({ bom: "00000002", priority: 2 })]).bom).toBe("00000002");
    expect(explodeProposal(proposal("1"), [recipe({ bom: "00000002", priority: 2, componentsActive: false }), inactive]).bom).toBe("00000001");
  });

  it("throws when no BOM is valid, which Missing BOM prevents", () => {
    expect(() => explodeProposal(proposal("1"), [recipe({ validFrom: "2026-11-01" })])).toThrow("No BOM of P is valid on 2026-10-10");
  });
});
