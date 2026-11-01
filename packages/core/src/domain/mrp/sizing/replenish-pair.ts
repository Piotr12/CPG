import { isRevisionValidOn } from "../../boms/bom-validity";
import { isProcurementAllowed } from "../../planning-parameters/procurement";
import type { MrpBom, MrpPlanningParameters, MrpRecordKind } from "../mrp-inputs";
import type { MrpException, MrpMissingParametersReason } from "../mrp-result";
import { safetyGap } from "../projection/safety-gap";
import { sizeProposals, type SizedPair, type SizedProposal } from "./size-proposals";

/** What `replenishPair` knows of one planned pair besides its days. */
export interface PairContext {
  /** The material's first unreadable row (spec Q8), when it has one: its every pair is Invalid UoM Conversion. */
  unreadable: { record: MrpRecordKind; document?: string } | undefined;
  /** The pair's planning parameter set, when one was read. */
  parameters: MrpPlanningParameters | undefined;
  /** The pair's set was stored, but its lot data couldn't be read: `invalid-set`. */
  invalidSet: boolean;
  /** The current revisions of the output's active BOMs. */
  boms: readonly MrpBom[];
}

/** One planned pair's proposals, untimed, or the one exception that stops them (E16-S03). */
export interface Replenishment {
  proposals: SizedProposal[];
  exception: MrpException | null;
}

/**
 * The one per-pair decision (E16-S03, spec "One pair"): a pair gets its proposals, or exactly one of
 * three exceptions and no proposal, checked in this order:
 *
 * 1. a row of the material couldn't be read: Invalid UoM Conversion, needed or not (MRP-036);
 * 2. a stored set that can't be used, a raw Make set or one with unreadable lot data: Missing Planning
 *    Parameters, needed or not (MRP-033), dated at the first need when there is one;
 * 3. no set, and some day below its target: Missing Planning Parameters dated that day (MAT-017);
 * 4. a Make set with a proposal that no BOM covers on its need date: Missing BOM dated at the first
 *    such proposal, and none of the pair's proposals (MRP-035, spec Q3).
 *
 * Nothing is guessed in their place, and each pair is decided alone, so no other pair changes.
 */
export function replenishPair(pair: SizedPair, { unreadable, parameters, invalidSet, boms }: PairContext): Replenishment {
  const { material, location } = pair;
  if (unreadable) {
    const { record, document } = unreadable;
    return none({ code: "INVALID_UOM_CONVERSION", material, location, record, ...(document !== undefined && { document }) });
  }
  const firstNeed = pair.buckets.find((bucket) => safetyGap(bucket) > 0n)?.date;
  const missing = (reason: MrpMissingParametersReason) =>
    none({ code: "MISSING_PLANNING_PARAMETERS", material, location, ...(firstNeed !== undefined && { date: firstNeed }), reason });
  if (invalidSet) return missing("invalid-set");
  if (!parameters) return firstNeed === undefined ? { proposals: [], exception: null } : missing("no-set");
  if (!isProcurementAllowed(parameters.materialType, parameters.procurement)) return missing("raw-make");
  const proposals = sizeProposals(pair, parameters);
  if (parameters.procurement === "make") {
    const uncovered = proposals.find(({ needDate }) => !boms.some((bom) => isRevisionValidOn(bom, needDate)));
    if (uncovered) return none({ code: "MISSING_BOM", material, location, date: uncovered.needDate });
  }
  return { proposals, exception: null };
}

const none = (exception: MrpException): Replenishment => ({ proposals: [], exception });
