import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpBom } from "../mrp-inputs";
import type { MrpDemandShare, MrpPlannedComponentDemand, MrpProposal } from "../mrp-result";

/** What explosion reads of a timed production-order proposal. */
export type ExplodedProposal = Pick<MrpProposal, "material" | "location" | "needDate" | "quantity" | "plannedStart">;

/**
 * Each component's need of a Make proposal exploded through `bom` (E17-S01, PRD §04 "Multilevel explosion",
 * BOM-006, BOM-007), the BOM `chooseBom` chose (E17-S02). Each line needs `scaledMicro(perOutput, quantity)`,
 * rounded upward once to six decimals as production orders' requirements are (R03), in the component's base
 * unit, at the producing site, on the proposal's planned start (N04). `provisional` marks the needs of a
 * proposal with no feasible BOM, which never count in a later feasibility test (BOM-011).
 *
 * Each need is split into the proposal's `shares` (#327, `pegProposals`), which add up to its quantity, by
 * cumulative rounding: with running totals Q₁ … Qₙ, share i needs `scaledMicro(perOutput, Qᵢ) − scaledMicro(perOutput, Qᵢ₋₁)`.
 * The parts then add up to exactly the need, rounded up once, and none is negative; a zero part is left out.
 */
export function explodeProposal(proposal: ExplodedProposal, bom: MrpBom, provisional: boolean, shares: readonly MrpDemandShare[]): MrpPlannedComponentDemand[] {
  const { bom: code, revision: bomRevision } = bom;
  return bom.components.map(({ material, perOutput }) => ({
    parent: proposal.material,
    parentNeedDate: proposal.needDate,
    bom: code,
    bomRevision,
    material,
    location: proposal.location,
    date: proposal.plannedStart,
    quantity: scaledMicro(perOutput, proposal.quantity),
    roots: split(perOutput, shares),
    provisional,
  }));
}

function split(perOutput: bigint, shares: readonly MrpDemandShare[]): MrpDemandShare[] {
  const roots: MrpDemandShare[] = [];
  let total = 0n;
  let before = 0n;
  for (const { root, quantity } of shares) {
    total += quantity;
    const upTo = scaledMicro(perOutput, total);
    if (upTo > before) roots.push({ root, quantity: upTo - before });
    before = upTo;
  }
  return roots;
}
