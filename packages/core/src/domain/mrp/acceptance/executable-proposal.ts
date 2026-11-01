import type { MrpProposalKind } from "../mrp-result";

/**
 * Whether accepting a proposal of `kind` can create its document (E19-S01): a purchase requisition can.
 * A production order needs the BOM revision E17-S02 (#282) will choose, so Make proposals are listed but
 * not accepted yet. The latest-run read and `MrpAcceptanceService` both ask this, so the screen and
 * the API never disagree.
 */
export function isExecutableProposal(kind: MrpProposalKind): boolean {
  return kind === "purchase-requisition";
}
