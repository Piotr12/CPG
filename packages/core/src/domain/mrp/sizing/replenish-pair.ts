import { isRevisionValidOn } from "../../boms/bom-validity";
import { isProcurementAllowed } from "../../planning-parameters/procurement";
import type { MrpBom, MrpPlanningParameters, MrpRecordKind } from "../mrp-inputs";
import type { MrpException, MrpMissingParametersReason, MrpProposal, MrpProposalRecipe } from "../mrp-result";
import { MRP_HORIZON_DAYS } from "../projection/horizon";
import { safetyGap } from "../projection/safety-gap";
import { scheduleProposal } from "./schedule-proposal";
import { sizeProposals, type SizedPair } from "./size-proposals";

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
  /** The run's first day, from which each proposal is timed (E16-S02). */
  today: string;
  /** The material's cycle path when it is on a cycle of active BOMs (E17-S01, `bomLevels`). */
  cycle: string | undefined;
}

/** A timed proposal, before `planMrp` explodes it and adds its recipe (E17-S01). */
export type TimedProposal = Omit<MrpProposal, keyof MrpProposalRecipe>;

/** One planned pair's timed proposals, or the one exception that stops them (E16-S03). */
export interface Replenishment {
  proposals: TimedProposal[];
  exception: MrpException | null;
}

/**
 * The one per-pair decision (E16-S03, spec "One pair"): a pair gets its proposals, or exactly one of
 * four exceptions and no proposal, checked in this order:
 *
 * 1. a row of the material couldn't be read: Invalid UoM Conversion, needed or not (MRP-036);
 * 2. a stored set that can't be used, a raw Make set or one with unreadable lot data: Missing Planning
 *    Parameters, needed or not (MRP-033), dated at the first need when there is one;
 * 3. no set, and some day below its target: Missing Planning Parameters dated that day (MAT-017);
 * 4. a Make set of a material on a cycle of active BOMs: BOM Cycle naming the path, needed or not, so
 *    nothing on the cycle is ever exploded (E17-S01, MRP-028, #281 spec Q7);
 * 5. a Make set with a proposal that no BOM covers on its planned finish: Missing BOM dated at the
 *    first such proposal's finish, and none of the pair's proposals (MRP-035, spec Q3).
 *
 * Each proposal is timed by `scheduleProposal` (E16-S02) before the BOM check. The production order a
 * proposal becomes checks its BOM on its planned finish (`production-recipes.ts`), and a late proposal
 * finishes after its need date, so the check uses the same day (#317 review). An on-time proposal
 * finishes on its need date, as #280's spec had it.
 *
 * Nothing is guessed in their place, and each pair is decided alone, so no other pair changes.
 */
export function replenishPair(pair: SizedPair, { unreadable, parameters, invalidSet, boms, today, cycle }: PairContext): Replenishment {
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
  if (parameters.procurement === "make" && cycle !== undefined) return none({ code: "BOM_CYCLE", material, location, path: cycle });
  const proposals = sizeProposals(pair, parameters).map(
    (item): TimedProposal => ({ ...item, ...scheduleProposal(item.needDate, item.leadTimeDays, today, MRP_HORIZON_DAYS) }),
  );
  if (parameters.procurement === "make") {
    const uncovered = proposals.find(({ plannedFinish }) => !boms.some((bom) => isRevisionValidOn(bom, plannedFinish)));
    if (uncovered) return none({ code: "MISSING_BOM", material, location, date: uncovered.plannedFinish });
  }
  return { proposals, exception: null };
}

const none = (exception: MrpException): Replenishment => ({ proposals: [], exception });
