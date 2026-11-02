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
 * Pass 2 traces the `provisional` proposals, sized only for what provisional needs add, on those needs alone (Q5).
 * They are served first from what pass 1 never consumes from that day on, which no executable share claims, then
 * by the provisional proposals. Pass 1's shares never change.
 *
 * `due` is the pair's `requirementsByDate`, which `planMrp` builds once for the trace and the ranking.
 */
export function pegProposals(
  pair: PeggedPair,
  proposals: readonly PeggedProposal[],
  provisional: readonly PeggedProposal[],
  due: Map<string, Requirement[]> = requirementsByDate(pair),
): PeggedShares {
  const executable = trace(pair, due, proposals, false, null);
  if (provisional.length === 0) return { proposals: executable.shares, provisional: [] };
  const free = [...executable.left];
  for (let day = free.length - 2; day >= 0; day -= 1) if (free[day + 1] < free[day]) free[day] = free[day + 1];
  return { proposals: executable.shares, provisional: trace(pair, due, provisional, true, free).shares };
}

interface PoolEntry {
  needDate: string;
  left: bigint;
  shares: MrpDemandShare[];
}

/**
 * One pass over the requirements whose `provisional` flag is `provisionalNeeds`: `free` is what they may take
 * before any proposal on each day, or `null` for the pair's existing supply. Returns each proposal's shares and,
 * by day, what existing supply and the pool leave.
 */
function trace(pair: PeggedPair, due: Map<string, Requirement[]>, proposals: readonly PeggedProposal[], provisionalNeeds: boolean, free: readonly bigint[] | null) {
  unserved(due);
  const queues = new RequirementQueues();
  const entries: PoolEntry[] = proposals.map(({ needDate, quantity }) => ({ needDate, left: quantity, shares: [] }));
  const joining = [...entries].sort((a, b) => compareCodes(a.needDate, b.needDate));
  // The pool serves oldest first, and an entry serves until it is empty, so the empty ones are always its first.
  let joined = 0;
  let oldest = 0;
  let pooled = 0n;
  let existing = free === null ? pair.physical : 0n;
  let taken = 0n;
  const left: bigint[] = [];
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
    left.push(existing + pooled);
  });
  for (const entry of entries) {
    if (entry.left > 0n) addShare(entry.shares, { kind: "safety-target", material: pair.material, originalDate: entry.needDate, document: null, position: null }, entry.left);
  }
  return { shares: entries.map((entry) => entry.shares.sort((a, b) => compareRoots(a.root, b.root))), left };
}

/** Adds `quantity` to the share of `root`, one share per root. */
function addShare(shares: MrpDemandShare[], root: MrpDemandRoot, quantity: bigint): void {
  const share = shares.find((candidate) => compareRoots(candidate.root, root) === 0);
  if (share) share.quantity += quantity;
  else shares.push({ root, quantity });
}
