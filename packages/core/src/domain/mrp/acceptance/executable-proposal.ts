import type { MrpProposalKind } from "../mrp-result";

/**
 * The proposal kinds MRP can turn into their documents (E19-S01): a purchase requisition. A production-order
 * proposal carries the BOM E17-S02 (#282) chose, and since E17-S03 (#283) one no BOM can supply is a provisional
 * action, stored apart and never a proposal, so every listed Make proposal is feasible. Make proposals are still
 * listed but not created: that is the Make half of E19-S01 (#320), which adds `production-order` here.
 */
export const EXECUTABLE_PROPOSAL_KINDS: readonly MrpProposalKind[] = ["purchase-requisition"];

/**
 * Whether a proposal of `kind` can become its document. The latest-run read, `MrpAcceptanceService` and the
 * automatic batch (E19-S03) all ask this, so the screen, Accept and Automatic never disagree.
 */
export function isExecutableProposal(kind: MrpProposalKind): boolean {
  return EXECUTABLE_PROPOSAL_KINDS.includes(kind);
}
