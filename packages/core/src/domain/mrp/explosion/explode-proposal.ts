import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpBom } from "../mrp-inputs";
import type { MrpPlannedComponentDemand, MrpProposal } from "../mrp-result";

/** What explosion reads of a timed production-order proposal. */
export type ExplodedProposal = Pick<MrpProposal, "material" | "location" | "needDate" | "quantity" | "plannedStart">;

/**
 * Each component's need of a Make proposal exploded through `bom` (E17-S01, PRD §04 "Multilevel explosion",
 * BOM-006, BOM-007), the BOM `chooseBom` chose (E17-S02). Each line needs `scaledMicro(perOutput, quantity)`,
 * rounded upward once to six decimals as production orders' requirements are (R03), in the component's base
 * unit, at the producing site, on the proposal's planned start (N04). `provisional` marks the needs of a
 * proposal with no feasible BOM, which never count in a later feasibility test (BOM-011).
 */
export function explodeProposal(proposal: ExplodedProposal, bom: MrpBom, provisional: boolean): MrpPlannedComponentDemand[] {
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
    provisional,
  }));
}
