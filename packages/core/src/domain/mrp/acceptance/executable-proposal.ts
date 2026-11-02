import type { MrpProposalKind } from "../mrp-result";

/**
 * The proposal kinds MRP can turn into their documents (E19-S01): a purchase requisition, and a production order
 * pinned to the BOM MRP chose (#320). Since E17-S03 (#283) a Make need no BOM can supply is a provisional action,
 * stored apart and never a proposal, so every Make proposal an MRP run of this image stores is feasible and carries
 * its BOM. The automatic batch (E19-S03) reads candidates of these kinds, then asks `isExecutableProposal`.
 */
export const EXECUTABLE_PROPOSAL_KINDS: readonly MrpProposalKind[] = ["purchase-requisition", "production-order"];

/** What executability depends on: the kind, and the BOM a production order is pinned to. */
export interface ExecutableProposalFields {
  kind: MrpProposalKind;
  /** The BOM MRP chose for a production order; null for a requisition, or a Make row an image older than E17-S01 wrote. */
  bom: string | null | undefined;
}

/**
 * Whether a proposal can become its document (#320 spec Q2): a requisition always, a production order only when it
 * carries the BOM to pin. The latest-run read, `MrpAcceptanceService` and the automatic batch all ask this, so the
 * screen, Accept and Automatic never disagree.
 */
export function isExecutableProposal({ kind, bom }: ExecutableProposalFields): boolean {
  return kind === "purchase-requisition" || bom != null;
}
