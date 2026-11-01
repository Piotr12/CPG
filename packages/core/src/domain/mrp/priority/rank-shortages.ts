import type { MrpBucket, MrpPlan, MrpShortage, MrpShortageKind } from "../mrp-result";
import { MRP_SHORTAGE_KINDS } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** One projected pair: what the priority pass reads. */
export interface RankedPair extends Pick<MrpPlan, "physical" | "firmDemand" | "forecastDemand" | "componentDemand" | "transfersOut"> {
  buckets: readonly Pick<MrpBucket, "date" | "tentativeSupply" | "dependableSupply" | "transferIn" | "proposedReceipts" | "safetyTarget">[];
}

/** A requirement while it is served. `document` and `position` are sort keys: "" and 0 where the kind has none. */
interface Requirement {
  kind: Exclude<MrpShortageKind, "safety-target">;
  date: string;
  originalDate: string;
  document: string;
  position: number;
  required: bigint;
  outstanding: bigint;
}

/** Open documents' needs, then customer orders, then the forecast residual (PRD §04, #279 Q5). */
const RANK: Record<Requirement["kind"], number> = { component: 0, transfer: 0, "customer-order": 1, forecast: 2 };
const RANKS = 3;

/**
 * The requirements of one material at one location that its stock, existing supply and the proposals
 * received by their day can't cover on that day (E16-S02, PRD §04 "Overdue demand and priority").
 *
 * Stock is consumed day by day. Each day, its receipts add to what is available and its requirements
 * join the outstanding ones, which are served in priority order: rank (open production orders'
 * components and transfer dispatches, then customer orders, then the forecast residual), original
 * date, kind, document and position. A requirement left outstanding on its own day is reported once,
 * on that day. It is still served first by a later receipt of its rank. Orders on one original date are
 * equal; the stable ID only keeps the result deterministic (DEM-021). Where the target in force is above
 * what is left, the gap is reported last on its day. The target is a level and consumes nothing.
 *
 * Priority never changes a quantity. Each day, what is outstanding equals how far `projectedAfter` is
 * below zero, and what is left equals how far it is above.
 */
export function rankShortages(pair: RankedPair): MrpShortage[] {
  const due = requirementsByDate(pair);
  const queues: Requirement[][] = Array.from({ length: RANKS }, () => []);
  const heads = queues.map(() => 0);
  let available = pair.physical;
  const shortages: MrpShortage[] = [];
  for (const { date, tentativeSupply, dependableSupply, transferIn, proposedReceipts, safetyTarget } of pair.buckets) {
    available += tentativeSupply + dependableSupply + transferIn + proposedReceipts;
    const today = (due.get(date) ?? []).sort(compareRequirements);
    // A day's original dates are never before those still queued, so each rank's queue stays sorted.
    for (const requirement of today) queues[RANK[requirement.kind]].push(requirement);
    for (let rank = 0; rank < RANKS; rank += 1) {
      const queue = queues[rank];
      while (heads[rank] < queue.length && available > 0n) {
        const requirement = queue[heads[rank]];
        const served = requirement.outstanding < available ? requirement.outstanding : available;
        requirement.outstanding -= served;
        available -= served;
        if (requirement.outstanding === 0n) heads[rank] += 1;
      }
    }
    for (const requirement of today) if (requirement.outstanding > 0n) shortages.push(shortageOf(requirement));
    if (safetyTarget > available) {
      shortages.push({ kind: "safety-target", date, originalDate: date, document: null, position: null, required: safetyTarget, uncovered: safetyTarget - available });
    }
  }
  return shortages;
}

/** Every requirement of `pair`, by the date it counts in. */
function requirementsByDate({ firmDemand, forecastDemand, componentDemand, transfersOut }: RankedPair): Map<string, Requirement[]> {
  const byDate = new Map<string, Requirement[]>();
  const add = (requirement: Omit<Requirement, "outstanding">) => {
    const list = byDate.get(requirement.date) ?? byDate.set(requirement.date, []).get(requirement.date)!;
    list.push({ ...requirement, outstanding: requirement.required });
  };
  for (const { date, plannedStart, order, quantity } of componentDemand) {
    add({ kind: "component", date, originalDate: plannedStart, document: order, position: 0, required: quantity });
  }
  for (const { date, plannedDate, transfer, quantity } of transfersOut) {
    add({ kind: "transfer", date, originalDate: plannedDate, document: transfer, position: 0, required: quantity });
  }
  for (const { date, requiredDate, order, position, quantity } of firmDemand) {
    add({ kind: "customer-order", date, originalDate: requiredDate, document: order, position, required: quantity });
  }
  for (const { date, forecastDate, quantity } of forecastDemand) {
    add({ kind: "forecast", date, originalDate: forecastDate, document: "", position: 0, required: quantity });
  }
  return byDate;
}

function compareRequirements(a: Requirement, b: Requirement): number {
  return (
    RANK[a.kind] - RANK[b.kind] ||
    compareCodes(a.originalDate, b.originalDate) ||
    MRP_SHORTAGE_KINDS.indexOf(a.kind) - MRP_SHORTAGE_KINDS.indexOf(b.kind) ||
    compareCodes(a.document, b.document) ||
    a.position - b.position
  );
}

function shortageOf({ kind, date, originalDate, document, position, required, outstanding }: Requirement): MrpShortage {
  return {
    kind,
    date,
    originalDate,
    document: kind === "forecast" ? null : document,
    position: kind === "customer-order" ? position : null,
    required,
    uncovered: outstanding,
  };
}
