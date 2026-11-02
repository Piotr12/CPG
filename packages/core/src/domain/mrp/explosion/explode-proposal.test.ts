import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpBom } from "../mrp-inputs";
import type { MrpDemandRoot, MrpDemandShare } from "../mrp-result";
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

const forecast: MrpDemandRoot = { kind: "forecast", material: "P", originalDate: "2026-10-10", document: null, position: null };
const order: MrpDemandRoot = { kind: "customer-order", material: "P", originalDate: "2026-10-10", document: "00000001", position: 1 };
/** The whole proposal serving one forecast, as `pegProposals` would trace a proposal of `quantity` for it. */
const all = (quantity: string): MrpDemandShare[] => [{ root: forecast, quantity: q(quantity) }];

describe("explodeProposal", () => {
  it("BOM-006: 0.5 kg A and 0.2 l B per one, for 10, need 5 and 2 on the planned start, at the proposal's location, through the chosen BOM", () => {
    expect(explodeProposal(proposal("10"), recipe({ bom: "00000004", revision: 2, components: { A: "0.5", B: "0.2" } }), false, all("10"))).toEqual([
      { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "A", location: "L1", date: "2026-10-07", quantity: q("5"), roots: [{ root: forecast, quantity: q("5") }], provisional: false },
      { parent: "P", parentNeedDate: "2026-10-10", bom: "00000004", bomRevision: 2, material: "B", location: "L1", date: "2026-10-07", quantity: q("2"), roots: [{ root: forecast, quantity: q("2") }], provisional: false },
    ]);
  });

  it("BOM-007: 0.125 × 4 is exactly 0.5, and 0.333333 for 0.5 (0.1666665) is rounded up once to 0.166667", () => {
    expect(explodeProposal(proposal("4"), recipe({ components: { A: "0.125" } }), false, all("4"))[0].quantity).toBe(q("0.5"));
    expect(explodeProposal(proposal("0.5"), recipe({ components: { A: "0.333333" } }), false, all("0.5"))[0].quantity).toBe(q("0.166667"));
  });

  it("marks every need of a proposal with no feasible BOM provisional (E17-S02, BOM-011)", () => {
    expect(explodeProposal(proposal("1"), recipe({ components: { A: "1", B: "2" } }), true, all("1")).map(({ provisional }) => provisional)).toEqual([true, true]);
  });

  it("splits each need into the proposal's shares by cumulative rounding, so the parts add up to exactly the need (#327 Q7)", () => {
    // 0.333333 per one: 0.5 is 0.1666665, rounded up to 0.166667; the whole 1 is 0.333333, so the forecast's half is 0.166666.
    // Rounding each half alone would give 0.166667 twice, 0.333334 in all.
    const [need] = explodeProposal(proposal("1"), recipe({ components: { A: "0.333333" } }), false, [{ root: order, quantity: q("0.5") }, { root: forecast, quantity: q("0.5") }]);
    expect(need.quantity).toBe(q("0.333333"));
    expect(need.roots).toEqual([{ root: order, quantity: q("0.166667") }, { root: forecast, quantity: q("0.166666") }]);
  });

  it("leaves out a part that rounds to nothing, and keeps a single share whole", () => {
    // 0.000001 per one: the order's 0.4 needs 0.0000004, rounded up to 0.000001; the forecast's 0.6 adds nothing more.
    const [tiny] = explodeProposal(proposal("1"), recipe({ components: { A: "0.000001" } }), false, [{ root: order, quantity: q("0.4") }, { root: forecast, quantity: q("0.6") }]);
    expect(tiny.roots).toEqual([{ root: order, quantity: q("0.000001") }]);
    expect(explodeProposal(proposal("3"), recipe({ components: { A: "2" } }), false, all("3"))[0].roots).toEqual([{ root: forecast, quantity: q("6") }]);
  });
});
