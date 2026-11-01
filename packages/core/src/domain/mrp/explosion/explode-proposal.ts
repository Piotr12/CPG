import { isRevisionValidOn } from "../../boms/bom-validity";
import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpBom } from "../mrp-inputs";
import type { MrpPlannedComponentDemand, MrpProposal } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** What a Make proposal is exploded through, and what it needs. */
export interface Explosion {
  bom: string;
  bomRevision: number;
  components: MrpPlannedComponentDemand[];
}

/** What explosion reads of a timed production-order proposal. */
export type ExplodedProposal = Pick<MrpProposal, "material" | "location" | "needDate" | "quantity" | "plannedStart" | "plannedFinish">;

/**
 * The BOM a Make proposal is exploded through, and each component's need (E17-S01, PRD §04 "Multilevel
 * explosion", BOM-006, BOM-007). `boms` are the output's own active BOMs' current revisions.
 *
 * The BOM is the one valid on the proposal's planned finish, the day the production order it becomes
 * checks its BOM on and the day Missing BOM checks (#317 review), preferring one whose components are
 * all active as the production dialog does, then the highest priority, then the BOM code (#281 spec
 * Q4). E17-S02 replaces this interim choice with feasibility. Each line needs `scaledMicro(perOutput,
 * quantity)`, rounded upward once to six decimals as production orders' requirements are (R03), in the
 * component's base unit, at the producing site, on the proposal's planned start (N04).
 *
 * `replenishPair` raises Missing BOM before any proposal of a pair no BOM covers, so a proposal without
 * a valid BOM is a programming error.
 */
export function explodeProposal(proposal: ExplodedProposal, boms: readonly MrpBom[]): Explosion {
  const [chosen] = boms.filter((bom) => isRevisionValidOn(bom, proposal.plannedFinish)).sort(compareRecipes);
  if (!chosen) throw new Error(`No BOM of ${proposal.material} is valid on ${proposal.plannedFinish}, so Missing BOM should have stopped its proposals.`);
  const { bom, revision: bomRevision } = chosen;
  return {
    bom,
    bomRevision,
    components: chosen.components.map(({ material, perOutput }) => ({
      parent: proposal.material,
      parentNeedDate: proposal.needDate,
      bom,
      bomRevision,
      material,
      location: proposal.location,
      date: proposal.plannedStart,
      quantity: scaledMicro(perOutput, proposal.quantity),
    })),
  };
}

/** All-active recipes first, then by priority (1 is the highest), then by BOM code. */
function compareRecipes(a: MrpBom, b: MrpBom): number {
  return Number(b.componentsActive) - Number(a.componentsActive) || a.priority - b.priority || compareCodes(a.bom, b.bom);
}
