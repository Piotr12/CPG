# MRP root ranking: a Make proposal's component needs rank by the requirement they serve at the root, split by share, through every level

**Status:** implemented (#356). Q4 awaits Piotr12's confirmation; the other answer is a one-line change. A root names its priority (kind and original date), not its document, which narrows Q6: ⚠ NEEDS HUMAN CONFIRMATION (Implementation notes).
**Created:** 2026-11-02 16:13 UTC
**Issue:** #327 (follow-up to #281's Q9) · **Depends on:** MRP proposal timing and demand priority (`implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`, #279), BOM explosion (`implemented/2026-11-01--1107UTC-mrp-bom-explosion.md`, #281), BOM choice (`implemented/2026-11-01--1918UTC-mrp-bom-choice.md`, #282), at-risk and provisional plans (`implemented/2026-11-01--2049UTC-mrp-at-risk-and-provisional-plans.md`, #283), all merged · **Design authority:** `.ai/specs/product-brief.md` (R03, R10, D04), `research/CPG-prd001.pdf` §04 "Overdue demand and priority", "Multilevel explosion", `research/CPG-acceptance.md` MRP-044, DEM-018 to DEM-022

## 📝 TLDR

Since #281, every need a Make proposal puts on a component ranks in `rankShortages` as one `planned-component` requirement at rank 1, beside customer orders, dated at the parent's planned start. A stand-in: PRD §04 ranks customer orders, then forecast, then the safety target, and #279's spec asks exploded components to rank by the requirement at their root. After this change, MRP traces each Make proposal's quantity to the parent pair's requirements it covers, and splits each component need into those **root shares**. When the component is short, the share serving a customer order ranks as that customer order, by its original due date, the share serving a forecast as forecast, and the share left as stock as the safety target, through every level. Engine only: `MrpPlan.shortages` is still in no channel (#279 Q4), so no quantity, proposal, stored row, API field or screen changes.

## 📝 Problem Statement

`rankShortages` (`domain/mrp/priority/rank-shortages.ts`) gives a `planned-component` requirement rank 1 and its parent's start as its original date (#281 Q9). Two consequences:

- **A forecast's need outranks a later customer order.** Finished F's proposal covers F's forecast due on day 5 and starts on day 3. Its need for raw R on day 3 ranks as a customer order dated day 3, ahead of R's own customer order due on day 4. PRD §04 puts every customer order before the forecast.
- **A share of a customer order loses to a forecast.** The same proposal also covers F's customer order. Its share is one requirement with the forecast's, so when R is short, the shortage can't say which part is the firm order's. MRP-044's multilevel case ("one raw shortage affects firm customer order and residual forecast … firm requirement given priority and forecast shortage remains visible") can't be asserted. Its evidence line says it "needs E17's root ranking".

The engineering standards' priority bullet records the stand-in as temporary: "a stand-in until #327 ranks them by their root requirement".

## Resolved assumptions (autonomous defaults)

The issue settles the goal and the scope. The design questions it leaves open, each answered with the most reversible choice. None changes a quantity, a proposal or a contract: every answer below is engine code and its tests.

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Against which dates are a proposal's units traced: its need date or its receipt (planned finish)? | **Its need date**, as sizing reads it. On its need date, the proposal's quantity joins the parent pair's pool and serves what is outstanding. | "Timing moves receipts, never sizing" (#279): a proposal is sized for what its need date lacks. A Beyond Horizon proposal books no receipt but still explodes (#281), so its components need roots too. Tracing receipts would leave its shares with no root. |
| Q2 | When existing supply and a proposal could both serve a requirement, whose units does it take? | **Existing supply first.** Each day, the pair's stock, open documents' supply, transfer receipts and at-risk output serve the outstanding requirements, by priority. Then the proposals serve, oldest need date first. | A proposal exists only for what existing supply leaves (sizing reads the balance before proposals). Sizing adds at-risk output back (E17-S03), so the demand it was to cover is blocked, never pegged to a proposal. |
| Q3 | What root do units that no requirement takes get: the safety target's top-up and a lot's surplus? | The **parent's safety target**, dated at the proposal's need date, as a new rank 3: after the forecast, last. | PRD §04 ranks the target gap last. A unit no requirement consumes becomes stock, which only the target asks for. The pair's own target stays a level checked after the queues, as today (#273 Q4). |
| Q4 | ⚠ NEEDS HUMAN CONFIRMATION. A parent proposal that covers an open document's need (an open production order's component, a transfer dispatch) at the parent: does the share rank 0? | **Yes.** Every root kind ranks as itself: component and transfer 0, customer order 1, forecast 2, safety target 3. | The issue asks for this "and so on, through every level". Rank 0 holds the needs of open documents (#279 Q5), and such a share serves one. The standards' bullet says "never put them at rank 0", a guard on the blanket stand-in, so this overturns a written rule and needs the owner. It changes only the engine's shortage order: the other answer, rank 1 for such a share, is a one-line `RANK` edit. |
| Q5 | How are provisional proposals traced (E17-S03), sized only for the provisional demand parents leave? | **As sizing sizes them, in two passes.** Pass 1 traces the executable proposals on every requirement but provisional parents' needs, as they were sized. Pass 2 serves only those provisional needs: first from what pass 1 leaves unconsumed, which no executable share claims, then from the provisional proposals, which get the shares. Pass 1's shares never change. | `replenishPair` sizes a Make pair twice for this reason (E17-S03 Q6): executable proposals without provisional demand, provisional ones for what that demand adds. One pooled pass would give a provisional proposal the root of a firm order its executable sibling already covers (spec review). |
| Q6 | What does a short share report? | Kind `planned-component`, document the parent material, as today. Its `originalDate` becomes the root's, its `required` is the share's quantity, and a new field `root` names the root requirement: kind, material, original date, document and position. Every other kind reports `root: null`. | The requirement short at the component is still the planned component. The root says why it ranks where it does, and E18-S02 can show it. `MrpPlan.shortages` is engine-only (#279 Q4), so nothing outside the engine reads it. |
| Q7 | How is a component's rounded need split into shares? | **Cumulative rounding.** With the proposal's shares in priority order and Q₁ … Qₙ their running totals, share i needs `scaledMicro(perOutput, Qᵢ) − scaledMicro(perOutput, Qᵢ₋₁)`. A zero share is dropped. | The shares then add up to exactly `scaledMicro(perOutput, quantity)`, today's need, rounded up once (R03, BOM-007), and none is negative. Rounding each share alone could sum above the need. |
| Q8 | `rankShortages` appends a day's requirements to each rank's queue, which works because a day's original dates are never before those still queued. A share dated at its root (a customer order due on day 10, needed on the parent's start, day 7) breaks that. | Each rank's queue **inserts in order**: an outstanding requirement keeps its place by the full key, whichever day it joined. | The standards' bullet asks every seam that adds requirements to keep the queues sorted. A day's requirements still join only on their own day, so a later order never takes stock from an earlier day (#279 Q1). |
| Q9 | Integration tests, and MRP-044's status? | **No integration test.** No stored row, API field or screen changes, and `tests/integration` asserts proposals, which this change keeps exactly. MRP-044 stays **Not executed** (its channel, "Both", shows nothing yet), and its Evidence line cites the new engine test. | The production image can't show an engine-only list. The status moves only when every clause, channel included, is asserted (lesson 2026-10-21). |

The issue bundles one capability, so it stays one spec. Its open question about #281 being merged is settled: #326 merged on 2026-11-01.

## 📝 Proposed Solution

Trace first, then explode, then rank:

1. **Trace (new).** Before a level's proposals claim and explode, `planMrp` traces each Make pair's proposals onto that pair's requirements: `pegProposals` (Architecture). Each proposal gets its **shares**: the root requirements its quantity serves, each with a quantity, adding up to the proposal's quantity.
2. **Explode.** `explodeProposal` splits each component's need into the proposal's shares (Q7) and carries them on `MrpPlannedComponentDemand.roots`.
3. **Rank.** `rankShortages` queues each share of a planned component as its own requirement, at its root's rank and original date. At the next level, the trace reads those shares as the parent pair's requirements, so a root passes down every level unchanged.

Every quantity, balance, proposal, feasibility choice and exception stays as it is: the trace only labels units that sizing already placed.

Alternatives rejected:

- **Rank a share by its parent's dominant requirement** (the largest share's kind). It is one pass less, but MRP-044 asks for the split: the firm order's part served, the forecast's part short.
- **Trace receipts on planned finish**, as `rankShortages` reads them. A Beyond Horizon proposal books none, and a late one would take requirements due after its need date (Q1).
- **Store the shares** for the report. E18-S02 owns showing shortages; the issue puts that out of scope.

## 📝 Architecture

```
domain/mrp/
  mrp-result.ts                MrpDemandRoot, MrpDemandShare; MrpPlannedComponentDemand + roots;
                               MrpShortage + root
  priority/
    requirements.ts            Requirement, requirementsByDate, compareRequirements, RANK,
                               RequirementQueues (sorted insert, serve)                   (new)
    rank-shortages.ts          uses requirements.ts; a planned component queues one requirement per share
    peg-proposals.ts           pegProposals(pair, proposals, provisional): shares per proposal, two passes (new)
  explosion/explode-proposal.ts  + the parent's shares, split per component by cumulative rounding
  plan-mrp.ts                  traces each sized Make pair, then explodes with the traced shares
```

### Types: `mrp-result.ts`

```ts
/** A requirement at the root of a Make proposal's component need (#327): what the top parent's units serve. */
export interface MrpDemandRoot {
  kind: Exclude<MrpShortageKind, "planned-component">;
  /** The root requirement's material, at the same location. */
  material: string;
  /** Its priority date: as `MrpShortage.originalDate` has it for the kind; for the target, the proposal's need date. */
  originalDate: string;
  /** The customer order's, production order's or transfer's business ID; `null` for a forecast and the target. */
  document: string | null;
  /** The order line's position; `null` for every other kind. */
  position: number | null;
}

export interface MrpDemandShare {
  root: MrpDemandRoot;
  quantity: bigint;
}
```

- `MrpPlannedComponentDemand.roots: readonly MrpDemandShare[]`: its shares in priority order, adding up to `quantity`, none zero, no two with one root.
- `MrpShortage.root: MrpDemandRoot | null`: a planned component's root, `null` for every other kind. A planned component's `originalDate` is its root's.
- `MRP_SHORTAGE_KINDS` keeps its order. Its comment and `MrpShortage`'s change: a planned component ranks by its root.

### The shared queue: `priority/requirements.ts`

`rankShortages` and `pegProposals` must serve in one order, so the requirement model moves out of `rank-shortages.ts` into one module both import:

- `Requirement` gains `root` (an `MrpDemandRoot`), `via` (the parent material, `""` for the pair's own requirements), `parentDay` (the parent's need date as a horizon day number, 0 where none) and `provisional` (a provisional parent's need, false for the pair's own). The pair's own requirement is its own root: its kind, the pair's material, its original date, document and position.
- `requirementsByDate(pair, { provisional })` lists requirements by the day they count in, as today. A planned component adds **one requirement per share**, with kind `planned-component` and its share's root. `provisional: "exclude"` leaves out provisional parents' needs, `"only"` lists nothing else, and `"include"` (the ranking) lists everything (Q5).
- `RANK` is keyed by the **root's** kind: component 0, transfer 0, customer order 1, forecast 2, safety target 3. `RANKS = 4`.
- `compareRequirements` orders by rank, then the root's original date, the root kind's index in `MRP_SHORTAGE_KINDS`, its document (`""` when `null`), its position (0 when `null`) and its material, then `via`, `parentDay` and `provisional` (false first). The pair's own requirements have `via = ""`, so one sorts before a share of the same root key. Dates and codes compare with `compareCodes`. For the pair's own requirements this is today's order: their root's kind is their kind.
- The key is total once equal keys are merged. A parent proposal has one share per root. Since #283 a parent pair can hold an executable and a provisional proposal on one need date, and two provisional ones (`drivenByParent` in `plan-mrp.ts`): the flag tells the first apart, and the second have equal priority. `requirementsByDate` therefore sums shares with an equal key into one requirement, which changes no priority and no total. `MrpPlannedComponentDemand.parentNeedDate`'s comment ("one proposal per parent pair and need date") is corrected to say so.
- `RequirementQueues` holds one queue per rank. `push` inserts an outstanding requirement by `compareRequirements` (Q8). `serve(available, onServed)` serves the ranks in order from `available`, calls `onServed(requirement, quantity)`, and returns what is left.

### Tracing: `priority/peg-proposals.ts`

```ts
/** What the trace reads of one projected pair: `RankedPair`, its buckets with `atRiskSupply` too. */
export interface PeggedPair extends Omit<RankedPair, "buckets"> {
  buckets: readonly Pick<MrpBucket, "date" | "tentativeSupply" | "dependableSupply" | "transferIn" | "atRiskSupply">[];
}
export interface PeggedProposal { needDate: string; quantity: bigint }

/** Each proposal's shares, in input order (#327 Q1–Q3, Q5). */
export function pegProposals(
  pair: PeggedPair,
  proposals: readonly PeggedProposal[],
  provisional: readonly PeggedProposal[],
): { proposals: MrpDemandShare[][]; provisional: MrpDemandShare[][] }
```

**Pass 1, the executable proposals.** Per day, in date order:

1. `existing += tentativeSupply + dependableSupply + transferIn + atRiskSupply` (day 0 also adds `physical`). Proposed receipts are never read.
2. The day's requirements, without provisional parents' needs, are pushed.
3. `existing` serves the queues by priority (Q2).
4. The proposals whose need date is today join the pool, in input order.
5. The pool serves the queues by priority, oldest entry first. Each served quantity adds to that proposal's share of the requirement's root.
6. `left[day]` records `existing` plus what the pool still holds.

After the last day, what is left of each proposal is a share rooted at the pair's safety target on the proposal's need date (Q3).

**Pass 2, the provisional proposals**, only when there are any. `free[day]`, the lowest `left` from that day to the horizon's end, is what pass 1 never consumes from that day on. Giving it away changes none of pass 1's shares. Per day, the day's provisional needs are pushed, and served first from `free[day]` less what earlier days took, unattributed, then from the provisional proposals, as steps 4 and 5 do. What is left of each is rooted at the pair's target, as in pass 1.

Each proposal's shares are then sorted by `compareRequirements`' root keys and merged by root, so they add up to its quantity.

The trace reads the projection `planMrp` already builds for `replenishPair`. It costs at most two walks of the 90 days and one sorted insert per requirement, and only Make pairs with proposals run it.

### Explosion: `explosion/explode-proposal.ts`

`explodeProposal(proposal, bom, provisional, shares)` keeps each line's `quantity = scaledMicro(perOutput, proposal.quantity)`, and adds `roots` by cumulative rounding over `shares` (Q7). The shares must add up to `proposal.quantity`: `planMrp` always passes `pegProposals`' result.

### The level loop: `plan-mrp.ts`

`sized` keeps each pair's projection, which today is built inline for `replenishPair` and dropped. After `sized` is built, and before any claim, each pair with production-order proposals or provisional ones is traced on it: `pegProposals(pair, its production-order proposals, replenished.provisional)`. The shares go into a `Map<TimedProposal, MrpDemandShare[]>`, and `explode` passes each proposal's own. The function's JSDoc gains a paragraph on the trace. Whether a proposal turns out feasible or infeasible changes nothing: it was traced on its sized quantity and need date. Every pair of a level is complete when it is traced, because only lower levels explode into it. A requisition explodes nothing and isn't traced.

### Priority: `priority/rank-shortages.ts`

The loop is unchanged but for the queues: `RequirementQueues` instead of the appended arrays and their head pointers. `shortageOf` sets `root` for a planned component (its share's root, with the root's original date, and the share's quantity as `required`) and `null` otherwise. The invariant holds: a planned component's shares add up to its quantity, so each day's outstanding total is unchanged.

## 📝 Data Model

No entity, column or migration. `MrpRecommendation`, `MrpDailyResult` and `MrpRunException` store nothing this change touches: the daily `dependentDemand` sums `quantity`, which is unchanged.

## 📝 API Contracts

None. `MrpPlan.shortages` and `MrpPlan.plannedComponentDemand` are engine-only. `BACKWARD_COMPATIBILITY.md` doesn't change.

## 📝 Edge Cases & Failure Scenarios

- **MRP-044, multilevel.** F (Make, 1 R per F) has a customer order of 6 and a forecast residual of 4 on day 10. F's proposal of 10 has two shares: 6 rooted at the order and 4 at the forecast. R has 7 on hand and a lead time too long to help, so `chooseBom` finds F's proposal infeasible: it is a provisional action with No Feasible BOM, and its needs still count at R (E17-S03). R serves the order's 6 and 1 of the forecast's 4. R's only planned-component shortage is the forecast's 3, with `root.kind = "forecast"`.
- **Three levels.** G's customer order is covered by G's proposal. Its need for F is rooted at G's order, and F's own forecast also needs F. F's proposal splits into G's order and F's forecast, and R's shortage keeps those roots: G's order before F's forecast.
- **A proposal sized only for the target, or a lot's surplus.** Its unconsumed units are rooted at the parent's target on its need date and rank last at the component, after the component's own forecast.
- **An overdue customer order at the parent.** Its share keeps the order's original due date, before today, so it ranks ahead of later orders at the component.
- **Existing supply.** A purchase order at the parent serves its earliest outstanding requirements first, so the proposal's shares are what the order leaves (Q2). At-risk output counts as existing, so a share never roots at demand it blocks.
- **A late or Beyond Horizon parent proposal.** It is traced on its need date, so its components get roots like any other.
- **A provisional chain.** An infeasible parent proposal is traced like any other, in pass 1. A proposal sized only for provisional needs is traced in pass 2, onto those needs alone. F's own order of 10 and G's provisional need of 4, both rank 1 on day 5 with G's order code first: the executable proposal of 10 is rooted at F's order, and the provisional one of 4 at G's order (Q5). One pooled pass would root the second at F's order too.
- **Stock a provisional need takes.** 5 on hand, a provisional need of 5 on day 1 and F's own order of 5 on day 3. Pass 1 serves the order from stock, so nothing is free, and the provisional proposal of 5 (sized on day 3) is rooted at the provisional need, never at F's order.
- **Two parents serving one root.** A customer order of G covered partly by two proposals, each exploding into F. F's requirements hold two shares of one root, via the same parent and different need dates. F's proposal merges them into one share.
- **A tiny line quantity.** A share whose cumulative rounding gives zero is dropped. The component's need still adds up, and at least one share is never zero, since the need is at least one micro-unit.
- **No proposal.** A pair without production-order proposals isn't traced, and a requisition is never traced.
- **Failure modes.** The pass is pure, with no I/O. A share list that doesn't add up to its proposal's quantity is a programming error, which the explosion tests catch.

## 📝 Risks & Impact Review

- **No user-visible change.** Shortages and planned component needs are engine-only, so a wrong root order shows nowhere until E18-S02. Rollback is a revert of engine code.
- **Run time.** One trace per Make pair with proposals, linear in days and requirements. `mrp-run-timing.test.ts` runs two exploding levels (#281) under unchanged budgets. Record its figures in the PR.
- **The queues' sorted insert.** Today's order for the pair's own requirements must stay exactly as it is. The existing `rank-shortages.test.ts` cases pin it, unchanged.
- **Product direction (Q3, Q4).** Rank 3 for the target's share and rank 0 for an open document's share are readings of PRD §04 and the issue, not evidenced rules. Q4 overturns the standards' "never put them at rank 0", so Piotr12 confirms it before this spec merges. Each is a one-line `RANK` change.

## 📝 Decisions in play

This design honours, and supersedes none of:

- R03: exact quantities. Shares split a need exactly, and priority changes none.
- R10: no document written or rewritten.
- D04: the simplest consistent behaviour for Q1 to Q8.

It retires the standards' stand-in, "planned components rank at rank 1", which #281's Q9 introduced and Piotr12 confirmed as temporary until this issue. Q4 needs Piotr12's confirmation.

## 📋 Phasing

One phase, one implementation PR: the trace, the split and the ranking are useless apart, and all three are pure engine code.

## 📋 Implementation Plan

1. **Types.** `MrpDemandRoot` and `MrpDemandShare`. `MrpPlannedComponentDemand.roots`, `MrpShortage.root`, and their comments (Architecture, Types). Until step 4, `explodeProposal` sets `roots` to one share rooted at the parent's target, and `shortageOf` sets `root: null`. Update fixtures (`warnings/overdue.test.ts`, `rank-shortages.test.ts`, `explode-proposal.test.ts`, whose `toEqual` gains `roots`, and `plan-mrp.test.ts`). Every existing test passes.
2. **The shared queue.** `priority/requirements.ts`, with `rank-shortages.ts` moved onto it, a planned component still one requirement at rank 1. Tests in `requirements.test.ts`:
   - `compareRequirements` orders the pair's own requirements exactly as before: rank, original date, kind, document, position;
   - the sorted insert: a requirement with an earlier original date pushed after a later one is served first;
   - `serve` reports each served quantity and returns what is left;
   - the `provisional` options, and two shares with an equal key summed into one requirement.
   Every `rank-shortages.test.ts` case passes unchanged.
3. **Tracing.** `priority/peg-proposals.ts`. Tests in `peg-proposals.test.ts`:
   - a proposal covering a customer order of 6 and a forecast of 4 on one day gives shares 6 and 4, the order first;
   - existing supply first: a purchase order of 5 the day before leaves the proposal 1 of the order's 6 and the forecast's 4;
   - at-risk output counts as existing;
   - a lot's surplus and a target top-up are a share rooted at the pair's target on the proposal's need date;
   - two proposals, the older one's units serving first;
   - a late proposal traced on its need date, never its planned finish;
   - a planned component's shares at the pair keep their roots (two levels);
   - two shares of one root, via one parent and two need dates, merged into one share;
   - pass 1 leaves out provisional parents' needs;
   - pass 2, the two Edge Cases examples: a provisional need whose root sorts before the pair's own order roots the provisional proposal at that need, and stock pass 1 needs later is never free;
   - pass 2 takes what pass 1 never consumes before any provisional proposal, and leaves pass 1's shares unchanged;
   - every proposal's shares add up to its quantity.
4. **Explosion.** `explodeProposal` with shares. Tests: an order's share of 0.5 and a forecast's of 0.5 in a proposal of 1, at 0.333333 per output, give 0.166667 and 0.166666, adding up to the line's 0.333333 (rounding each share alone gives 0.333334, so this test fails without the cumulative rule); a zero share is dropped; a single share is the whole need.
5. **Ranking by root.** `RANK` by root kind, `RANKS = 4`, one requirement per share, `shortageOf` with `root`. Tests in `rank-shortages.test.ts`, replacing the three "Make proposals' components (E17-S01, #281 Q9)" cases:
   - a share rooted at a customer order due on day 4 is served before the pair's own customer order due on day 5, and a forecast-rooted share after it;
   - a share rooted at an open production order's component ranks 0, and one rooted at a target ranks after the pair's own forecast;
   - a direct requirement before a share of the same root key, two parents ordered by parent code, and an executable parent's share before a provisional one's on one need date;
   - the reported shortage's `originalDate`, `document` (the parent), `required` (the share's quantity) and `root`.
6. **The level loop.** `planMrp` traces and explodes with the shares (Architecture). Tests in `plan-mrp.test.ts`:
   - MRP-044, multilevel (Edge Cases): F's proposal is a provisional action with No Feasible BOM, and R's shortage is the forecast's 3, with its root, and none rooted at the order;
   - three levels G → F → R: R's shares are rooted at G's order and F's forecast;
   - a provisional parent's components get roots, and a provisional-only proposal is traced on the provisional need;
   - a Beyond Horizon parent's components get roots;
   - the existing "ranks a short component's exploded need" test, rewritten for its root, and the invariant over every pair (outstanding = max(0, −projectedAfter)) on a multilevel fixture;
   - the shuffled-snapshot test, extended to `roots` and `root`.
   - Every proposal and bucket of the existing tests is unchanged.
7. **Benchmark.** Run `mrp-run-timing.test.ts` under its unchanged budgets and record the figures in the PR.
8. **Docs and catalogue.**
   - `.ai/docs/engineering-standards.md`, the priority bullet: planned components rank by their root, shares from `pegProposals`, and the queues insert in order. `pegProposals` is the only trace, by need date, existing supply first.
   - `CPG-acceptance.md`, MRP-044's Evidence: the multilevel case, citing the `plan-mrp.test.ts` test. Status stays Not executed (Q9).
   - Move this spec to `implemented/` with implementation notes.

## Implementation notes

Implemented on #356, spec PR #355. Where the code differs from the design above:

- **One requirement list per traced pair.** `requirementsByDate(pair)` takes no option: it lists every requirement, and the trace pushes only those whose `provisional` flag its pass serves. `planMrp` builds a traced pair's list once, and `pegProposals` and `rankShortages` both take it (an optional last argument), each serving from `required` again (`unserved`). A pair that isn't traced builds its list in `rankShortages`, as before.
- **⚠ A root is a priority, not a document (deviation from Q6, needs Piotr12's confirmation).** `MrpDemandRoot` holds only `kind` and `originalDate`, and shares with equal ones merge. As designed, with document, position and material, roots compounded down the levels: a bottom component held one requirement per distinct root of every parent, about 20 times as many at the second exploding level. CI's ten-times worst case then stalled 2,089 ms against its 1,500 ms bound (`mrp-run-timing.test.ts`, run on 31ce791a). PRD §04 gives requirements of one kind on one original date equal business priority, and the ID only keeps the result deterministic (DEM-021). So merging them changes no ranking between priorities, and a need holds one share per priority it serves at every level. A short share's `root` therefore says "ranked as a customer order due on day N", not which order. Naming the document again would need a bound on the count instead, such as a cap per need.
- **A flat key.** `Requirement` carries its priority flat (`rank`, `originalDate`, `kindOrder`), its own business ID (`document`, `position`; "" and 0 for a share) and the share's root as `share`, `null` for the pair's own requirement. `compareRequirements` orders by priority, then the pair's own before any share (`via`), then own business ID, then the parent and its need date. The parent's need date is compared as a date string (`parentNeedDate`), not a day number.
- **Pass 2 (code review of #356).** As designed, an executable lot's surplus that served a provisional need stayed rooted at the target, and pass 2 ran only with provisional proposals. It now runs whenever the pair has provisional needs. It serves them, in Q2's order, from existing supply pass 1 never takes from that day on (unattributed), then from each executable proposal's surplus, re-rooted from the target to the need it serves, then from the provisional proposals. So pass 1's target-rooted shares can change, and no other share does. The executable surplus is never consumed in pass 1, from its need date on, so taking it changes nothing there.
- **Queues.** Each rank keeps a head pointer. `push` appends when a requirement sorts last, which is the usual case, and otherwise inserts by binary search.
- **Tests.** `requirements.test.ts` pins the order, the merge and the queues; `peg-proposals.test.ts` the trace, both review counterexamples included; `rank-shortages.test.ts` and `plan-mrp.test.ts` the ranking, MRP-044's multilevel case and a three-level provisional chain.
- **Run time.** On `mrp-run-timing.test.ts` (this machine, fastest of 3), `planMrp` alone takes:

  | Case | `main` | #356 |
  |---|---|---|
  | realistic | 7 ms | 7 ms |
  | worst case for proposals, realistic | 21 ms | 27 ms |
  | ten times | 70 ms | 87 ms |
  | worst case for proposals, ten times | 224 ms | 296 ms |

  The ten-times worst case's stall is 325 ms (`main`: 270 ms, already above the 250 ms budget). CI runs about 4.3 times slower than this machine, where `main` shows about 970 ms against the 1,500 ms bound. The trace itself costs about 12 ms of a 307 ms synthetic three-level run; the rest is the larger requirement records.
