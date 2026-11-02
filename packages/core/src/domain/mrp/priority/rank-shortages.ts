import type { MrpBucket, MrpShortage } from "../mrp-result";
import { RequirementQueues, requirementsByDate, rootOf, unserved, type Requirement, type RequirementLists } from "./requirements";

/** One projected pair: what the priority pass reads. */
export interface RankedPair extends RequirementLists {
  physical: bigint;
  buckets: readonly Pick<MrpBucket, "date" | "tentativeSupply" | "dependableSupply" | "transferIn" | "proposedReceipts" | "safetyTarget">[];
}

/**
 * The requirements of one material at one location that its stock, existing supply and the proposals
 * received by their day can't cover on that day (E16-S02, PRD §04 "Overdue demand and priority").
 *
 * Stock is consumed day by day. Each day, its receipts add to what is available and its requirements
 * join the outstanding ones, which are served in priority order (`compareRequirements`): rank (open
 * production orders' components and transfer dispatches, then customer orders, then the forecast residual),
 * original date, kind, document and position. A Make proposal's component need is served as one requirement
 * per share, each at its root requirement's rank and original date (#327), and the stock a proposal leaves
 * above every requirement after the forecast. A requirement left outstanding on its own day is reported once,
 * on that day. It is still served first by a later receipt of its rank. Orders on one original date are
 * equal; the stable ID only keeps the result deterministic (DEM-021). Where the target in force is above
 * what is left, the gap is reported last on its day. The target is a level and consumes nothing.
 *
 * Priority never changes a quantity. Each day, what is outstanding equals how far `projectedAfter` is
 * below zero, and what is left equals how far it is above.
 *
 * `due` is the pair's `requirementsByDate` when the trace already built it (`planMrp`); it is served afresh.
 */
export function rankShortages(pair: RankedPair, due?: Map<string, Requirement[]>): MrpShortage[] {
  if (due) unserved(due);
  else due = requirementsByDate(pair);
  const queues = new RequirementQueues();
  let available = pair.physical;
  const shortages: MrpShortage[] = [];
  for (const { date, tentativeSupply, dependableSupply, transferIn, proposedReceipts, safetyTarget } of pair.buckets) {
    available += tentativeSupply + dependableSupply + transferIn + proposedReceipts;
    const today = due.get(date) ?? [];
    for (const requirement of today) queues.push(requirement);
    available = queues.serve(available);
    for (const requirement of today) if (requirement.outstanding > 0n) shortages.push(shortageOf(requirement));
    if (safetyTarget > available) {
      shortages.push({ kind: "safety-target", date, originalDate: date, document: null, position: null, required: safetyTarget, uncovered: safetyTarget - available, root: null });
    }
  }
  return shortages;
}

/** A planned component names its parent and its root priority; every other kind its own business ID. */
function shortageOf(requirement: Requirement): MrpShortage {
  const { kind, date, originalDate, document, position, via, required, outstanding } = requirement;
  if (kind === "planned-component") return { kind, date, originalDate, document: via, position: null, required, uncovered: outstanding, root: rootOf(requirement) };
  return {
    kind, date, originalDate, document: kind === "forecast" ? null : document, position: kind === "customer-order" ? position : null, required, uncovered: outstanding, root: null,
  };
}
