import type { MrpDemandRoot, MrpPlan, MrpShortageKind } from "../mrp-result";
import { MRP_SHORTAGE_KINDS } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** The lists of one projected pair that hold its requirements. */
export type RequirementLists = Pick<MrpPlan, "firmDemand" | "forecastDemand" | "componentDemand" | "plannedComponentDemand" | "transfersOut">;

/** A requirement's priority and business ID, flat, so the queues compare it without reading nested objects. */
interface RequirementKey {
  /** The root's rank. */
  rank: number;
  /** The root's original date. */
  originalDate: string;
  /** The root kind's place in `MRP_SHORTAGE_KINDS`. */
  kindOrder: number;
  /** The pair's own requirement's business ID: "" and 0 where it has none, and for a share. */
  document: string;
  position: number;
}

/**
 * A requirement while it is served. A pair's own requirement is its own root; a Make proposal's component need
 * is one requirement per share (#327), each with the share's root, its parent as `via` and its parent's need date.
 */
export interface Requirement extends RequirementKey {
  kind: Exclude<MrpShortageKind, "safety-target">;
  /** The bucket it counts in. */
  date: string;
  /** A planned component's root; `null` for the pair's own requirements, whose root is their kind and original date. */
  share: MrpDemandRoot | null;
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
/** Each root kind's place in `MRP_SHORTAGE_KINDS`, which orders kinds of one rank and original date. */
const KIND_ORDER = Object.fromEntries(MRP_SHORTAGE_KINDS.map((kind, index) => [kind, index])) as Record<MrpDemandRoot["kind"], number>;

/** The priority of two roots (PRD §04): rank, original date, then kind. Equal roots are one share. */
export function compareRoots(a: MrpDemandRoot, b: MrpDemandRoot): number {
  return RANK[a.kind] - RANK[b.kind] || compareCodes(a.originalDate, b.originalDate) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/**
 * The order requirements are served in: by root priority, then the pair's own before any share, then the pair's
 * own by business ID (document, position: DEM-021, which only keeps the result deterministic), and shares by
 * parent, parent need date and an executable parent before a provisional one. `requirementsByDate` merges shares
 * whose key is equal, so the order is total.
 */
export function compareRequirements(a: Requirement, b: Requirement): number {
  return (
    a.rank - b.rank ||
    compareCodes(a.originalDate, b.originalDate) ||
    a.kindOrder - b.kindOrder ||
    compareCodes(a.via, b.via) ||
    compareCodes(a.document, b.document) ||
    a.position - b.position ||
    compareCodes(a.parentNeedDate, b.parentNeedDate) ||
    Number(a.provisional) - Number(b.provisional)
  );
}

/** The requirement's root priority: its share's, or its own kind and original date. */
export function rootOf(requirement: Requirement): MrpDemandRoot {
  return requirement.share ?? { kind: requirement.kind as MrpDemandRoot["kind"], originalDate: requirement.originalDate };
}

/**
 * Every requirement of `pair` by the date it counts in, each day's in priority order. A planned component adds
 * one requirement per share. Shares with an equal key are summed into one: since E17-S03 a parent pair can hold
 * two provisional proposals on one need date, of equal priority. The trace and the ranking of one pair share
 * the result (`pegProposals`, `rankShortages`), each serving from `required` again.
 */
export function requirementsByDate(pair: RequirementLists): Map<string, Requirement[]> {
  const byDate = new Map<string, Requirement[]>();
  const add = (requirement: Requirement) => {
    const list = byDate.get(requirement.date);
    if (list) list.push(requirement);
    else byDate.set(requirement.date, [requirement]);
  };
  // One literal shape, never spreads or nested objects: this runs for every requirement of every pair.
  const own = (kind: MrpDemandRoot["kind"] & Requirement["kind"], date: string, originalDate: string, document: string, position: number, required: bigint) =>
    add({
      kind, date, rank: RANK[kind], originalDate, kindOrder: KIND_ORDER[kind], document, position,
      share: null, via: "", parentNeedDate: "", provisional: false, required, outstanding: required,
    });
  for (const { date, forecastDate, quantity } of pair.forecastDemand) own("forecast", date, forecastDate, "", 0, quantity);
  for (const { date, requiredDate, order, position, quantity } of pair.firmDemand) own("customer-order", date, requiredDate, order, position, quantity);
  for (const { date, plannedDate, transfer, quantity } of pair.transfersOut) own("transfer", date, plannedDate, transfer, 0, quantity);
  for (const { date, plannedStart, order, quantity } of pair.componentDemand) own("component", date, plannedStart, order, 0, quantity);
  for (const { date, parent, parentNeedDate, provisional, roots } of pair.plannedComponentDemand) {
    for (const { root, quantity } of roots) {
      add({
        kind: "planned-component", date, rank: RANK[root.kind], originalDate: root.originalDate, kindOrder: KIND_ORDER[root.kind], document: "",
        position: 0, share: root, via: parent, parentNeedDate, provisional, required: quantity, outstanding: quantity,
      });
    }
  }
  for (const [date, list] of byDate) if (list.length > 1) byDate.set(date, merged(list.sort(compareRequirements)));
  return byDate;
}

/** Restores every requirement of `due` to unserved, so another pass can serve it. */
export function unserved(due: ReadonlyMap<string, readonly Requirement[]>): void {
  for (const list of due.values()) for (const requirement of list) requirement.outstanding = requirement.required;
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
  /** Each rank's requirements; those before `heads[rank]` are served. */
  private readonly queues: Requirement[][] = Array.from({ length: RANKS }, () => []);
  private readonly heads: number[] = Array.from({ length: RANKS }, () => 0);

  push(requirement: Requirement): void {
    const { rank } = requirement;
    const queue = this.queues[rank];
    // Most requirements sort last: a pair's own original dates are rarely before those still queued.
    if (queue.length === this.heads[rank] || compareRequirements(queue[queue.length - 1], requirement) <= 0) {
      queue.push(requirement);
      return;
    }
    let low = this.heads[rank];
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
    for (let rank = 0; rank < RANKS && available > 0n; rank += 1) {
      const queue = this.queues[rank];
      while (this.heads[rank] < queue.length && available > 0n) {
        const requirement = queue[this.heads[rank]];
        const quantity = requirement.outstanding < available ? requirement.outstanding : available;
        requirement.outstanding -= quantity;
        available -= quantity;
        onServed?.(requirement, quantity);
        if (requirement.outstanding === 0n) this.heads[rank] += 1;
      }
    }
    return available;
  }
}
