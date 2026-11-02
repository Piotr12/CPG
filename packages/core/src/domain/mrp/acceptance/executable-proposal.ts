import type { MrpProposalKind } from "../mrp-result";

/**
 * Whether accepting a proposal of `kind` can create its document (E19-S01): a purchase requisition can.
 * A production-order proposal carries the BOM E17-S02 (#282) chose, and since E17-S03 (#283) one no BOM
 * can supply is a provisional action, stored apart and never a proposal, so every listed Make proposal is
 * feasible. Make proposals are still listed but not accepted: that is the Make half of E19-S01. The
 * latest-run read and `MrpAcceptanceService` both ask this, so the screen and the API never disagree.
 */
export function isExecutableProposal(kind: MrpProposalKind): boolean {
  return kind === "purchase-requisition";
}
