import type { MrpDemandRoot, MrpPlan, MrpShortageKind } from "../mrp-result";
import { MRP_SHORTAGE_KINDS } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** The lists of one projected pair that hold its requirements. */
export type RequirementLists = Pick<MrpPlan, "material" | "firmDemand" | "forecastDemand" | "componentDemand" | "plannedComponentDemand" | "transfersOut">;

/**
 * A requirement while it is served. A pair's own requirement is its own `root`; a Make proposal's component need
 * is one requirement per share (#327), each with the share's root, its parent as `via` and its parent's need date.
 */
export interface Requirement {
  kind: Exclude<MrpShortageKind, "safety-target">;
  /** The bucket it counts in. */
  date: string;
  root: MrpDemandRoot;
  /** The parent material of a planned component's share; "" for the pair's own requirements. */
  via: string;
  /** The parent proposal's need date; "" for the pair's own requirements. */
  parentNeedDate: string;
  /** A provisional parent's need (E17-S03); false for the pair's own requirements. */
  provisional: boolean;
  required: bigint;
  outstanding: bigint;
}

/**
 * Open documents' needs, then customer orders, then the forecast residual (PRD §04, #279 Q5), then the stock a
 * Make proposal leaves above every requirement, which only the target asks for (#327 Q3). A planned component's
 * share ranks as its root (Q4): rank 3 holds only such shares, as the pair's own target is a level, not a queue.
 */
const RANK: Record<MrpDemandRoot["kind"], number> = { component: 0, transfer: 0, "customer-order": 1, forecast: 2, "safety-target": 3 };
const RANKS = 4;

/** Which of a pair's requirements a pass serves: provisional parents' needs (E17-S03) apart, alone, or with the rest. */
export type ProvisionalNeeds = "exclude" | "only" | "include";

/**
 * The priority of two roots (PRD §04, DEM-021): rank, original date, kind, then the business ID (document,
 * position and material), which only keeps the result deterministic. Dates and codes compare in code-unit order.
 */
export function compareRoots(a: MrpDemandRoot, b: MrpDemandRoot): number {
  return (
    RANK[a.kind] - RANK[b.kind] ||
    compareCodes(a.originalDate, b.originalDate) ||
    MRP_SHORTAGE_KINDS.indexOf(a.kind) - MRP_SHORTAGE_KINDS.indexOf(b.kind) ||
    compareCodes(a.document ?? "", b.document ?? "") ||
    (a.position ?? 0) - (b.position ?? 0) ||
    compareCodes(a.material, b.material)
  );
}

/**
 * The order requirements are served in: by root, then the pair's own before a share of the same root, then
 * shares by parent, parent need date and an executable parent before a provisional one. `requirementsByDate`
 * merges shares whose key is equal, so the order is total.
 */
export function compareRequirements(a: Requirement, b: Requirement): number {
  return (
    compareRoots(a.root, b.root) ||
    compareCodes(a.via, b.via) ||
    compareCodes(a.parentNeedDate, b.parentNeedDate) ||
    Number(a.provisional) - Number(b.provisional)
  );
}

/**
 * Every requirement of `pair` that `provisional` selects, by the date it counts in, each day's in priority
 * order. A planned component adds one requirement per share. Shares with an equal key are summed into one:
 * since E17-S03 a parent pair can hold two provisional proposals on one need date, of equal priority.
 */
export function requirementsByDate(pair: RequirementLists, provisional: ProvisionalNeeds): Map<string, Requirement[]> {
  const { material } = pair;
  const byDate = new Map<string, Requirement[]>();
  const add = (requirement: Requirement) => {
    if (provisional === (requirement.provisional ? "exclude" : "only")) return;
    (byDate.get(requirement.date) ?? byDate.set(requirement.date, []).get(requirement.date)!).push(requirement);
  };
  const own = (kind: MrpDemandRoot["kind"] & Requirement["kind"], date: string, root: Omit<MrpDemandRoot, "kind" | "material">, required: bigint) =>
    add({ kind, date, root: { kind, material, ...root }, via: "", parentNeedDate: "", provisional: false, required, outstanding: required });
  for (const { date, forecastDate, quantity } of pair.forecastDemand) own("forecast", date, { originalDate: forecastDate, document: null, position: null }, quantity);
  for (const { date, requiredDate, order, position, quantity } of pair.firmDemand) own("customer-order", date, { originalDate: requiredDate, document: order, position }, quantity);
  for (const { date, plannedDate, transfer, quantity } of pair.transfersOut) own("transfer", date, { originalDate: plannedDate, document: transfer, position: null }, quantity);
  for (const { date, plannedStart, order, quantity } of pair.componentDemand) own("component", date, { originalDate: plannedStart, document: order, position: null }, quantity);
  for (const { date, parent, parentNeedDate, provisional: isProvisional, roots } of pair.plannedComponentDemand) {
    for (const { root, quantity } of roots) {
      add({ kind: "planned-component", date, root, via: parent, parentNeedDate, provisional: isProvisional, required: quantity, outstanding: quantity });
    }
  }
  for (const [date, list] of byDate) byDate.set(date, merged(list.sort(compareRequirements)));
  return byDate;
}

/** `sorted` with each run of equal keys summed into its first requirement. */
function merged(sorted: Requirement[]): Requirement[] {
  const result: Requirement[] = [];
  for (const requirement of sorted) {
    const last = result[result.length - 1];
    if (last && compareRequirements(last, requirement) === 0) {
      last.required += requirement.required;
      last.outstanding += requirement.outstanding;
    } else result.push(requirement);
  }
  return result;
}

/**
 * The outstanding requirements, one queue per rank, each in priority order. A share joins on its own day but
 * keeps its root's date, which can be later than requirements that joined after it, so `push` inserts in order
 * (#327 Q8) and a later requirement never takes stock from an earlier day (#279 Q1).
 */
export class RequirementQueues {
  private readonly queues: Requirement[][] = Array.from({ length: RANKS }, () => []);

  push(requirement: Requirement): void {
    const queue = this.queues[RANK[requirement.root.kind]];
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (compareRequirements(queue[middle], requirement) <= 0) low = middle + 1;
      else high = middle;
    }
    queue.splice(low, 0, requirement);
  }

  /** Serves the queues in priority order from `available`, reporting each quantity served; returns what is left. */
  serve(available: bigint, onServed?: (requirement: Requirement, quantity: bigint) => void): bigint {
    for (const queue of this.queues) {
      let served = 0;
      while (served < queue.length && available > 0n) {
        const requirement = queue[served];
        const quantity = requirement.outstanding < available ? requirement.outstanding : available;
        requirement.outstanding -= quantity;
        available -= quantity;
        onServed?.(requirement, quantity);
        if (requirement.outstanding === 0n) served += 1;
      }
      queue.splice(0, served);
    }
    return available;
  }
}
