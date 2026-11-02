import type { MrpBucket, MrpDemandRoot, MrpDemandShare } from "../mrp-result";
import { compareCodes } from "../projection/pairs";
import { compareRoots, RequirementQueues, requirementsByDate, rootOf, unserved, type Requirement, type RequirementLists } from "./requirements";

/** What the trace reads of one projected pair: its requirements and its existing supply, at-risk output included. */
export interface PeggedPair extends RequirementLists {
  physical: bigint;
  buckets: readonly Pick<MrpBucket, "date" | "tentativeSupply" | "dependableSupply" | "transferIn" | "atRiskSupply">[];
}

/** What the trace reads of a sized proposal: it serves from its need date (Q1). */
export interface PeggedProposal {
  needDate: string;
  quantity: bigint;
}

/** Each proposal's shares, in the order the proposals were given. */
export interface PeggedShares {
  proposals: MrpDemandShare[][];
  provisional: MrpDemandShare[][];
}

/**
 * The root requirements each Make proposal of one pair serves (#327, PRD §04 "Overdue demand and priority"):
 * shares that add up to its quantity, by which its components' needs rank (`rankShortages`). Priority changes
 * no quantity: the trace only labels units that sizing (`replenishPair`) already placed, as sizing places them.
 *
 * Pass 1 traces the executable `proposals` on every requirement but provisional parents' needs, as they were sized
 * (E17-S03 Q6). Day by day, existing supply (stock, open documents, transfer receipts and at-risk output, which
 * sizing adds back) serves the outstanding requirements first, by priority (Q2). Then each proposal joins on its
 * need date, never its receipt (Q1), and the proposals serve, oldest first. What no requirement takes is stock
 * above them, rooted at the pair's safety target on the proposal's need date (Q3).
 *
 * Pass 2 runs when the pair has provisional needs or provisional proposals (E17-S03 Q5): it serves those needs
 * alone, from what pass 1 never consumes, in Q2's order. First comes existing supply pass 1 never takes from that
 * day on, unattributed. Then each executable proposal's surplus, from its need date: those units are re-rooted
 * from the pair's target to the provisional need they serve, so only pass 1's target-rooted shares ever change.
 * Last come the provisional `provisional` proposals, sized only for what those needs add.
 *
 * `due` is the pair's `requirementsByDate`, which `planMrp` builds once for the trace and the ranking.
 */
export function pegProposals(
  pair: PeggedPair,
  proposals: readonly PeggedProposal[],
  provisional: readonly PeggedProposal[],
  due: Map<string, Requirement[]> = requirementsByDate(pair),
): PeggedShares {
  const executable = proposals.map(entryOf);
  const sized = provisional.map(entryOf);
  const existingLeft = trace(pair, due, executable, false, null);
  if (sized.length > 0 || pair.plannedComponentDemand.some(({ provisional: isProvisional }) => isProvisional)) {
    const free = [...existingLeft];
    for (let day = free.length - 2; day >= 0; day -= 1) if (free[day + 1] < free[day]) free[day] = free[day + 1];
    const surplus = executable.map(({ needDate, left }): PoolEntry => ({ needDate, left, shares: [] }));
    trace(pair, due, [...surplus, ...sized], true, free);
    surplus.forEach(({ left, shares }, index) => {
      const entry = executable[index];
      entry.left = left;
      for (const { root, quantity } of shares) addShare(entry.shares, root, quantity);
    });
  }
  const finish = (entry: PoolEntry) => {
    if (entry.left > 0n) addShare(entry.shares, { kind: "safety-target", originalDate: entry.needDate }, entry.left);
    return entry.shares.sort((a, b) => compareRoots(a.root, b.root));
  };
  return { proposals: executable.map(finish), provisional: sized.map(finish) };
}

/** A proposal while it serves: what is left of it and the shares it has served. */
interface PoolEntry {
  needDate: string;
  left: bigint;
  shares: MrpDemandShare[];
}

const entryOf = ({ needDate, quantity }: PeggedProposal): PoolEntry => ({ needDate, left: quantity, shares: [] });

/**
 * One pass over the requirements whose `provisional` flag is `provisionalNeeds`, served first from the pair's
 * existing supply, or from `free` on each day when given, then from `entries`, each from its need date, oldest
 * first (input order on one date). It adds to the entries' `shares` and lowers their `left`, and returns what
 * existing supply leaves on each day.
 */
function trace(pair: PeggedPair, due: Map<string, Requirement[]>, entries: readonly PoolEntry[], provisionalNeeds: boolean, free: readonly bigint[] | null): bigint[] {
  unserved(due);
  const queues = new RequirementQueues();
  const joining = [...entries].sort((a, b) => compareCodes(a.needDate, b.needDate));
  // The pool serves oldest first, and an entry serves until it is empty, so the empty ones are always its first.
  let joined = 0;
  let oldest = 0;
  let pooled = 0n;
  let existing = free === null ? pair.physical : 0n;
  let taken = 0n;
  const existingLeft: bigint[] = [];
  pair.buckets.forEach(({ date, tentativeSupply, dependableSupply, transferIn, atRiskSupply }, day) => {
    for (const requirement of due.get(date) ?? []) if (requirement.provisional === provisionalNeeds) queues.push(requirement);
    if (free === null) existing = queues.serve(existing + tentativeSupply + dependableSupply + transferIn + atRiskSupply);
    else {
      const available = free[day] - taken;
      taken += available - queues.serve(available);
    }
    while (joined < joining.length && joining[joined].needDate === date) pooled += joining[joined++].left;
    for (let index = oldest; index < joined && pooled > 0n; index += 1) {
      const entry = joining[index];
      const before = entry.left;
      entry.left = queues.serve(before, (requirement, quantity) => addShare(entry.shares, rootOf(requirement), quantity));
      pooled -= before - entry.left;
      if (entry.left === 0n && index === oldest) oldest += 1;
      if (entry.left > 0n) break;
    }
    existingLeft.push(existing);
  });
  return existingLeft;
}

/** Adds `quantity` to the share of `root`, one share per root. */
function addShare(shares: MrpDemandShare[], root: MrpDemandRoot, quantity: bigint): void {
  const share = shares.find((candidate) => compareRoots(candidate.root, root) === 0);
  if (share) share.quantity += quantity;
  else shares.push({ root, quantity });
}
