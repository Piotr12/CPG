import { isProcurementAllowed } from "../../planning-parameters/procurement";
import type { MrpPlanningParameters } from "../mrp-inputs";
import type { MrpBucket, MrpProposal } from "../mrp-result";
import { safetyGap } from "../projection/safety-gap";
import { lotQuantity } from "./lot-quantity";

/** One planned pair's days, before proposals: what sizing reads. */
export interface SizedPair {
  material: string;
  location: string;
  buckets: readonly Pick<MrpBucket, "date" | "safetyTarget" | "projectedBefore">[];
}

/**
 * The replenishment proposals of one material at one location (E16-S01, PRD §04 "Projection and
 * safety stock"). Walking the days in order, a day whose balance after the earlier proposals falls
 * below that day's safety target (zero when there is none) gets one proposal. Its need is
 * E15-S01's `safetyGap`, measured on that after-proposal balance, and `lotQuantity` sizes it. What
 * a proposal brings above the target carries into later days, so a later day gets a proposal only
 * where the balance would fall below its target again.
 *
 * This is the one place a target becomes a requirement (#278 Q2). A Make set for a raw material
 * proposes nothing (R02, MRP-033); E16-S03 reports it. Each pair is sized alone, so a surplus at
 * one location never covers another (TRF-018).
 */
export function sizeProposals({ material, location, buckets }: SizedPair, parameters: MrpPlanningParameters): MrpProposal[] {
  const { materialType, procurement, leadTimeDays, minimumQuantity, lotMultiple } = parameters;
  if (!isProcurementAllowed(materialType, procurement)) return [];
  const kind = procurement === "buy" ? "purchase-requisition" : "production-order";
  const proposals: MrpProposal[] = [];
  let carried = 0n;
  for (const { date, safetyTarget, projectedBefore } of buckets) {
    const need = safetyGap({ safetyTarget, projectedBefore: projectedBefore + carried });
    if (need === 0n) continue;
    const quantity = lotQuantity(need, minimumQuantity, lotMultiple);
    proposals.push({ kind, material, location, needDate: date, date, quantity, leadTimeDays });
    carried += quantity;
  }
  return proposals;
}
