import type { MrpProposalKind } from "../mrp-result";

/**
 * Whether accepting a proposal of `kind` can create its document (E19-S01): a purchase requisition can.
 * A production-order proposal carries the BOM E17-S02 (#282) chose, but a provisional one (No Feasible
 * BOM) is stored like a feasible one until E17-S03 (#283) marks it. So Make proposals are listed but
 * not accepted yet: the Make half of E19-S01 needs both. The latest-run read and `MrpAcceptanceService` both ask this, so the screen and
 * the API never disagree.
 */
export function isExecutableProposal(kind: MrpProposalKind): boolean {
  return kind === "purchase-requisition";
}
