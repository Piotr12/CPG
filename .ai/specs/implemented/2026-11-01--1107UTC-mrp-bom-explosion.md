# MRP BOM explosion: every Make proposal explodes through its BOM, level by level, so intermediates and raw materials get dependent demand on the parent's start, shared components are netted once, and cycles are refused

**Status:** implemented. One default awaits the owner's confirmation (Q9). Either answer only changes one rank in one module; root ranking is #327.
**Created:** 2026-11-01 11:07 UTC
**Issue:** #281 (E17-S01, epic #269) · **Depends on:** the MRP engine (`implemented/2026-10-27--0525UTC-mrp-engine-projection.md`, #273), MRP runs (`implemented/2026-10-27--0556UTC-mrp-runs.md`, #274), production and transfer supply (`implemented/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`, #277), replenishment proposals (`implemented/2026-10-31--2054UTC-mrp-replenishment-proposals.md`, #278), proposal timing and priority (`implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`, #279), planning exceptions (`implemented/2026-11-01--0737UTC-mrp-planning-exceptions.md`, #280), proposal acceptance (`implemented/2026-11-01--0737UTC-mrp-proposal-acceptance.md`, #287), all merged · **Design authority:** `.ai/specs/product-brief.md` (R03, R04, R10, D04, N04), `research/CPG-prd001.pdf` §04 "Multilevel explosion", "Component timing and execution", "Parameters/precision", `research/CPG-prd-datamodel.pdf` ("MRP recommendation / exception"), `research/CPG-acceptance.md` BOM-006, BOM-007, MRP-020, MRP-027, MRP-028, MRP-029, MRP-031, MRP-047

## 📝 TLDR

Today MRP proposes a production order for a Make material (E16-S01, #278), but the proposal consumes nothing. Its components see only their own independent demand and the pinned needs of open production orders (#277), so a new proposal for a finished product leaves its intermediates and raw materials unplanned. After this change, MRP plans materials **level by level**, each parent before its components. Every Make proposal explodes through the highest-priority BOM valid on its planned finish. Each component needs the proposal's quantity times its per-output quantity, rounded up once to six decimals. That need counts as dependent demand on the parent's planned start, at the same location. It joins the component's one projection, beside open production orders' needs, so several parents' needs are netted once and the component gets its own proposal. Each production-order proposal records the BOM and revision it exploded through, which the run stores and the API and the proposals table show. A cycle in stored BOM data is reported as a **BOM Cycle** exception naming its path. The materials on it are never exploded, and every other material still plans.

## 📝 Problem Statement

`planMrp` (`domain/mrp/plan-mrp.ts`) plans every pair alone, in material-code order. A Make pair's proposals (`sizing/size-proposals.ts`) raise its own `proposedReceipts` and nothing else. The gaps that follow:

- **Components go unplanned.** A finished product F short by 10 gets a production-order proposal of 10. Its BOM needs 2 of intermediate I per F, but I's projection shows no demand, so I gets no proposal, and neither does the raw material under I. PRD §04 "Multilevel explosion" requires that recommendations "explode through BOMs level by level" (MRP-027, MRP-047).
- **Shared components are under-counted.** When P1 and P2 both use raw R, each parent's proposal should add to R's demand on its start day, netted once against R's stock and supply (MRP-029). Today neither does.
- **New production competes with nothing.** An open production order's pinned BOM already takes 80 of C on Monday (#277). A new proposal needing 50 of C on Wednesday must see a balance of −30 and drive a proposal for C, never reuse the 80 (MRP-020). Today the 50 isn't counted.
- **No proposal names its recipe.** MRP-031 asks for a production-order recommendation "with pinned BOM revision". The run stores only kind, need date, quantity and lead time.
- **Stored data can loop.** The BOM service refuses a cycle at entry (R04, BOM-024, `findCycle`), but MRP reads stored data. A row written around the service, by a restore or a migration, must not hang the run (MRP-028).

## Resolved assumptions (autonomous defaults)

The issue's three open questions, plus the gaps between its notes and the shipped code, each answered with the most reversible choice. The one schema change is two additive nullable columns (Q5). The one contract change is two additive fields on each listed proposal and one new exception code (Q5, Q7).

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | What date do dependent requirements take (issue open question 1)? | The parent proposal's **`plannedStart`**, from E16-S02's `scheduleProposal`. It is the need date less the lead time, never before today, so a late parent's components are needed today. | E16-S02 merged (#317), so the issue's interim "need date minus lead time" is unnecessary. Open production orders' components already count on their start day (#277), and N04 plans components on the start day only. |
| Q2 | Does every Make proposal explode, even one E17-S02 may later find infeasible (issue open question 2)? | **Yes.** Every proposal in `MrpResult.proposals` of kind `production-order` explodes, Late Supply and Beyond Horizon ones included. A Beyond Horizon proposal's start is always inside the horizon (it is never after its need date, which is), so its components count. A pair with an exception has no proposals, so it explodes nothing. | It is the issue's proposal. Lower levels get their requirements, so feasible lower-level proposals stay executable (MRP-047). Whether a parent is feasible, and what its output counts as, is E17-S02 and E17-S03. |
| Q3 | Low-level codes over which BOMs (issue open question 3)? | The **current revision of every active BOM**, whatever its validity dates: the list `readBoms` already loads for Missing BOM (E16-S03). A material's level is the longest chain of "output uses component" edges above it. A material that is no BOM's component is level 0. | The level then never changes across the horizon, and every BOM a proposal could explode through is in the graph, so a component always plans after each of its parents. Inactive BOMs and older revisions can never be made with (`resolveProductionOptions`), so they are left out. |
| Q4 | Which BOM does a Make proposal explode through, until E17-S02 chooses by feasibility? | Among the output's BOMs in `inputs.boms` whose current revision is **valid on the proposal's `plannedFinish`** (`isRevisionValidOn`), prefer those whose components are **all active**, as the production dialog does. Among those, take the **lowest priority number**, then the lowest BOM code. When every valid BOM has an inactive component, fall back to the same order over all the valid ones. | It is the issue's interim rule, "the eligibility rule shared with `resolveProductionOptions`", which skips a recipe with an inactive component (`production-recipes.ts`). It is applied on the day Missing BOM already checks (#317 review). So the stored `bom` names a recipe the dialog would offer whenever one exists. The fallback keeps the guarantee that every Make proposal surviving Missing BOM has exactly one BOM to explode through, so Missing BOM's rule and its protected message don't change. Ties are impossible among active alternatives (`assertNoPriorityConflict`); the code only keeps stored data deterministic. E17-S02's feasibility choice and E17-S03's at-risk rule replace the fallback. |
| Q5 | How does a proposal "carry the BOM and revision" (MRP-031), and where? | `MrpProposal` gains `bom` (the BOM's eight-digit business ID) and `bomRevision` (its current revision's number). Both are set on a `production-order` proposal and `null` on a `purchase-requisition`. `mrp_recommendation` gains two nullable columns, `bom varchar(8)` and `bom_revision integer`. The latest-run API lists both on every proposal. The one-pair proposals table shows "BOM 00000004, revision 2" under a production-order proposal's kind. | MRP-031's channel is "Both". The accepted production order (the E19-S01 Make follow-up) will need the recipe, so the run must keep it. Nullable columns are additive ALTERs (lesson 2026-10-23). A row a previous image writes during a deploy reads `null`, which is honest, because that image exploded nothing. |
| Q6 | Where does exploded demand sit relative to transfers? | **After** `planTransfers`, as #277's spec fixed for this story ("Later seams"). An open transfer's source check never sees proposal-driven demand, so a hypothetical proposal never cuts a planned transfer. The component's balance after transfers then carries both. | Open documents are commitments MRP never rewrites (R10), and feasibility is measured before proposals (#277 Q2). It also keeps `planTransfers` and every existing seam unchanged. |
| Q7 | What does a cycle in stored BOM data raise, on which pairs, and what still plans? | A new exception code, **`BOM_CYCLE`**, ranked after `MISSING_BOM`. It is raised on **every planned pair with a usable Make set** of each material in a cycle, needed or not. A pair is planned only when the snapshot names it (stock, demand, supply or a parent's explosion), since parameters name no pairs. Those pairs get **no proposals**, so nothing on the cycle is exploded. `params.path` names a shortest cycle through that material, starting and ending at it, in the BOM service's notation without descriptions, for example `00000003 →(BOM 00000009) 00000001 →(BOM 00000007) 00000003`. The level graph drops the cycle members' own edges, so levels are finite and every other material plans. A Buy pair of a cycle material plans normally. | It is #280's rule: a pair gets its proposals, or one exception and no guessed proposal. A production proposal whose components can't be ordered would be a guess. "Needed or not" follows MRP-033's broken-data case, so the cycle surfaces even without demand. A Buy pair never uses the BOM. The exception table already takes any code string (#280 Q6), so no rebuild is needed. |
| Q8 | An active BOM's current revision has a component line the loader can't read? | Two things happen. The line is reported as a `bom-line` unreadable row of its component (document `BOM/revision/position`, as `readProductionOrders` names a pinned line) at **every location where the output has a Make planning set**. So the component's pairs raise Invalid UoM Conversion, which points at the line to fix. The revision is also **left out of `inputs.boms`**, as a revision with an unreal validity date already is (#316 review). It covers no date, so the output's Make pair relying on it raises Missing BOM, and its edges don't count for levels. | Exploding without the line would guess a recipe. It is #280's shipped rule for pinned lines: a row is reported at every pair it would feed, and those are the output's Make sites, read earlier in the same snapshot. Missing BOM stays true to its protected message: a revision that can't be read is not a usable revision, and the component's exception names the row. No new code or contract. |
| Q9 | ⚠ NEEDS HUMAN CONFIRMATION. Where does an exploded requirement rank in `rankShortages`? | A new shortage kind, **`planned-component`**, at **rank 1, beside customer orders**. It is ordered by original date, which is the parent's planned start, with the parent's material code as its document. Open documents' needs keep rank 0. | #279's spec, and the engineering standards' MRP bullet after it, say exploded components must rank by the requirement at their root, not at rank 0. Tracing each proposal back to the order lines, forecasts and targets it serves is an allocation pass of its own (MRP-044's multilevel case), beyond this issue's scope. A parent proposal mostly serves customer orders and forecast, so rank 1 is the nearest stand-in. `MrpPlan.shortages` is engine-only (#279 Q4): no user sees it, and any answer is a one-line change. The owner confirms it, and a follow-up issue tracks root ranking. |
| Q10 | What does the plan record of exploded demand? | `MrpPlan` gains `plannedComponentDemand`, one item per parent proposal and component: the parent's material, need date, BOM and revision, the component, the location, the bucket date (the parent's planned start) and the quantity. It joins the bucket's existing `dependentDemand` (`MrpBucket` already documents "and of Make proposals (E17-S01)"). It is engine-only: the stored daily `dependentDemand` already carries it, and showing the explosion is E18-S03. | It mirrors #277's `componentDemand`, so the figure is traceable in the result, and MRP-027 asks for "quantities and dates for all three levels in the result". No new stored table or API field. |
| Q11 | The engine's run order? | `planMrp` keeps every seam up to `planTransfers` unchanged. Then it plans the pairs **level by level, in `comparePairs` order within a level**. Each pair is replenished, its receipts are booked, and each Make proposal is exploded into its components' pairs, which are always at a higher level and created when absent. Then the pair is projected and ranked. Plans are returned in `comparePairs` order, and proposals by material, location and need date, as `MrpResult` documents. | A component at level L+1 sees every parent's demand before it is sized, which is what "netted once in a single projection" needs. The results' order and shape don't change for any caller. |
| Q12 | Integration tests? | Two cases in `tests/integration/mrp-run-api.test.ts`. The first is three levels: F (finished, Make), made from 2 I per F, I (intermediate, Make), made from 0.5 kg R per I, and R (raw, Buy), none on hand, with a customer order for F. It asserts F's, I's and R's proposals, with their quantities, dates and kinds and with `bom` and `bomRevision` on F's and I's, and I's and R's `dependentDemand` on their parents' start days. The second shows the proposals table's BOM line on the MRP page for F. A cycle can't be written through the API (BOM-024), so it is proved in the service test. | The production image is the only proof that the migration, the stored columns and the API fields reach a client. |

The issue's Q05 (the showcase) doesn't bear on this design. If the owner answers Q9 differently, only `RANK` in `priority/rank-shortages.ts` and its tests change.

## 📝 Proposed Solution

One new seam, `explosion/`, and a level loop in `planMrp`:

```
domain/mrp/
  mrp-inputs.ts                MrpBom + bom, revision, priority, components
  mrp-result.ts                MrpProposal + bom, bomRevision; MrpPlan + plannedComponentDemand;
                               + MrpPlannedComponentDemand, MrpBomCycle; MRP_SHORTAGE_KINDS + "planned-component"
  plan-mrp.ts                  level-by-level loop after planTransfers; explodes each Make proposal
  explosion/                                                                                (new seam)
    bom-levels.ts              bomLevels(boms): { levelOf, cycles }                         (new)
    explode-proposal.ts        explodeProposal(proposal, boms): { bom, bomRevision, components } (new)
  sizing/replenish-pair.ts     PairContext + cycle; BOM_CYCLE before sizing for a Make pair
  priority/rank-shortages.ts   planned-component requirements at rank 1
  exceptions/codes.ts          + BOM_CYCLE, its message and rank
  exceptions/stored-exception.ts + BOM_CYCLE → details { path }
services/mrp/
  snapshot/boms.ts             reads each current revision's code, number, priority and lines
  mrp-run.service.ts           stores bom, bomRevision; latest() lists them
  mrp-run-view.ts              MrpProposalView + bom, bomRevision
db/entities/mrp/
  mrp-recommendation.entity.ts + bom, bomRevision (nullable)
db/migrations/                 + Migration…_mrp_recommendation_bom                          (new)
app/components/mrp/
  mrp-proposals.tsx            "BOM {bom}, revision {revision}" under a production-order proposal's kind
```

**Alternatives considered.**
- *Explode recursively from each proposal.* Each parent would net its own share of a component, so P1 and P2 would each size a proposal for R (MRP-029 forbids that), and a cycle would recurse forever.
- *Re-run the whole plan per level.* Every seam would repeat for every level, for the same result.
- *Explode before transfers.* Proposals would cut open transfers (Q6), and `planTransfers` would have to run per level.
- *A second input list of recipes beside `boms`.* Missing BOM and the explosion would read two lists that can disagree. One `MrpBom` per current revision, carrying its lines, is one read and one rule (Q3, Q4).
- *Plan cycle members anyway, unexploded.* That would be a production proposal whose components are never planned: a guess (Q7).

## 📝 Architecture

### Levels and cycles: `explosion/bom-levels.ts`

```ts
/** Each material's low-level code over `boms`' edges, and the cycles they contain (PRD §04, R04, MRP-028). */
export function bomLevels(boms: readonly MrpBom[]): { levelOf: ReadonlyMap<string, number>; cycles: ReadonlyMap<string, string> }
```

- **Edges.** Each `MrpBom` gives one edge per component line: `{ bom: bom.bom, output: bom.output, component }`. That is `findCycle`'s `RecipeEdge` shape (`domain/boms/find-cycle.ts`).
- **Cycles.** Find the strongly connected components (iterative Tarjan, no recursion, so a deep chain can't overflow the stack). A material is **on a cycle** when its component has two or more members, or when it has an edge to itself. Then, for **each member** of a cyclic component, take its BOMs in code order and call `findCycle(edges, { bom, output: member, components })` for each until one returns a path. `edges` are sorted by output, BOM and component, and `components` by code, so `findCycle`'s breadth-first search, which follows input order, finds the same shortest path whatever the snapshot's order. `findCycle` skips that BOM's own edges and searches from its components back to the member. A member of a cyclic component reaches itself through one of its own BOMs, so a path is always found, and it starts and ends at the member it is reported on. Format the path in the BOM service's notation without descriptions, `M1 →(BOM B1) M2 →(BOM B2) M1`.
- **Levels.** Drop every edge whose output is on a cycle, which leaves an acyclic graph. Run Kahn's algorithm over it in code order: `level(component) = max(level(output) + 1)` over its remaining edges, and 0 for a material that is no remaining edge's component. A cycle member keeps the level its non-cycle parents give it, so a parent's demand still reaches it before it plans. `levelOf` lists only materials in the graph; `planMrp` reads a missing one as 0.

### Explosion: `explosion/explode-proposal.ts`

```ts
/** The BOM a Make proposal explodes through, and each component's need on its planned start (BOM-006, BOM-007, R03). */
export function explodeProposal(proposal: MrpProposal, boms: readonly MrpBom[]): { bom: string; bomRevision: number; components: MrpPlannedComponentDemand[] }
```

- **Choice (Q4).** `boms` are the output's own BOMs. Filter them with `isRevisionValidOn(bom, proposal.plannedFinish)`. Sort them with those whose `componentsActive` is true first, then by `priority`, then by `compareCodes(bom.bom)`, and take the first. `replenishPair`'s Missing BOM check guarantees there is one. The function throws an `Error` naming the material if there isn't, a programming error that a unit test pins.
- **Quantity.** Each line gives `scaledMicro(line.perOutput, proposal.quantity)`: the product, rounded up once to six decimals. Production orders' `scaledRequirement` and #277's open-order needs use the same arithmetic (BOM-007, R03), so an accepted proposal will require the same quantities. `BomComponent.quantity` is already in the component's base unit per base unit of the output, so nothing is converted.
- **Item.** `{ parent: proposal.material, parentNeedDate: proposal.needDate, bom, bomRevision, material: line.material, location: proposal.location, date: proposal.plannedStart, quantity }`. The location is the producing site (#277), and `date` is always inside the horizon (Q2).

### The level loop: `plan-mrp.ts`

Everything up to `planTransfers` and the parameter and BOM maps is unchanged. Then:

```ts
const { levelOf, cycles } = bomLevels(inputs.boms);
// Bucketed once: `pairOf` files every pair it creates under its material's level (0 when absent).
const byLevel: PairDraft[][] = …;
for (let level = 0; level < byLevel.length; level += 1) {
  // A lower level's explosion has filed its components' pairs here by now.
  for (const draft of byLevel[level].sort(comparePairs)) {
    const replenished = replenishPair(…, { …, cycle: cycles.get(draft.material) });
    // book receipts on plannedFinish (unchanged)
    for (const proposal of replenished.proposals) {
      if (proposal.kind !== "production-order") { proposals.push({ ...proposal, bom: null, bomRevision: null }); continue; }
      const exploded = explodeProposal(proposal, bomsOf.get(proposal.material)!);
      proposals.push({ ...proposal, bom: exploded.bom, bomRevision: exploded.bomRevision });
      for (const item of exploded.components) {
        const component = pairOf(item.material, item.location);
        component.flows[dayOf.get(item.date)!].dependentDemand += item.quantity;
        component.plannedComponentDemand.push(item);
      }
    }
    // project, rank (unchanged), collected into `plans`
  }
}
plans.sort(comparePairs); proposals.sort(byPairThenNeedDate);
```

- **Netting once.** A component's figures from every parent proposal and every open production order add to the same `flows[day].dependentDemand` of its one `PairDraft`, which is sized only once all its parents have planned (MRP-020, MRP-029).
- **Termination.** The loop runs once per level, which is at most the number of materials in the graph. Each pair is planned exactly once (MRP-028). A component's level is always above its parent's, because only cycle members, which never explode, lose their edges. `byLevel` is sized from the largest level with a plain loop, never `Math.max(...values)`, whose spread hits the argument limit on a large catalogue.
- **`replenishPair`.** `PairContext` gains `cycle: string | undefined`, the material's cycle path. After the `raw-make` check, a usable Make set with a cycle returns `none({ code: "BOM_CYCLE", material, location, path: cycle })`, before sizing. Every earlier check, and Missing BOM after sizing, is unchanged.
- **Purity.** Results depend only on the snapshot's content, never its order, and the snapshot is never changed. The shuffled-snapshot test covers the new lists.

### Priority: `priority/rank-shortages.ts`

`RankedPair` gains `plannedComponentDemand`. Each item is a requirement of kind `planned-component`: date `date`, original date `date` (the parent's start), document `parent`, and position the parent's **need date as a horizon day number** (0 to 89). `RANK` gains `"planned-component": 1` (Q9). `MRP_SHORTAGE_KINDS` places it after `customer-order`, so a customer order and a planned component on the same original date are ordered by kind. A parent pair has at most one proposal per need date (`MrpRecommendation`'s unique key), so the key stays total. Two late proposals of one parent both start today, and their need dates tell them apart. A component's demand from two parents on one day is ordered by parent code. The shortage's `document` is the parent's material code, and its `position` is `null`.

### Snapshot: `services/mrp/snapshot/boms.ts`

`readBoms` keeps its active-BOM read and its `(bom, number)` chunks. The BOM read adds `code` to its `fields`, and the revision read adds `id`, `number` and `priority`. For the chunk's revisions it then reads their lines, as `readProductionOrders` reads pinned lines: `BomComponent` with `revision: { $in: ids }`, fields `revision`, `material`, `quantity`, `numerator` and `denominator`, through `bom_component_revision_id_index`, followed by a yield. Each line goes through `readRow({ quantities: { perOutput }, factor })`. A revision is pushed only when its dates are real days and **every** line reads. An unreadable line is pushed to `unreadable` as a `bom-line` of its component, with document `BOM/revision/position`, at each location of the output's Make sets (Q8). `readBoms` therefore takes the snapshot's `planningParameters` and `unreadable`, which `load` already holds. `componentsActive` is false when a line's material is in the tenant's inactive materials, read once as a partial `Material` list of `{ active: false }`, which is small. Partial loads only, never populated entities (lesson 2026-10-25).

### Storage and read

- `MrpRecommendation` gains `bom: p.string().length(8).nullable()` and `bomRevision: p.integer().nullable()`. `writeResults` stores both.
- `proposalsOf` adds both to its `fields`, and `MrpProposalView` lists them, so the read's plan doesn't change.
- `isExecutableProposal` and the acceptance rule are unchanged. A Make proposal still can't be accepted. `MrpAcceptedProposalView` extends `MrpProposalView`, so the accept answer's `proposal` lists the two fields too. It is always a requisition, so both are `null`. The E19-S01 Make follow-up compares `bom` and `bomRevision` in its freshness check.

## 📝 Data Model

`mrp_recommendation`, two new nullable columns, through an additive migration (`npm run db:migration:create -- mrp_recommendation_bom`). The generated SQL must be two `alter table \`mrp_recommendation\` add column …` statements, `bom` text/varchar(8) null and `bom_revision` integer null. If MikroORM emits a table rebuild, hand-edit it to the `ALTER`s (lesson 2026-10-23), and `down()` drops both columns. Existing rows read `null`, and the next run replaces them. No backfill, and no change to `mrp_run_exception` (`exception_code` is a plain string, #280 Q6).

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest`: each element of `plans[].proposals` gains two fields:

```json
{ "id": "…", "kind": "production-order", "needDate": "2026-10-20", "quantity": "10.000000",
  "plannedStart": "2026-10-18", "plannedFinish": "2026-10-20", "lateDays": 0, "beyondHorizon": false,
  "executable": false, "document": null, "bom": "00000004", "bomRevision": 2 }
```

Both are additive. `bom` and `bomRevision` are `null` for a `purchase-requisition`, and for a row a previous image wrote during a deploy. `POST …/mrp/runs/{run}/proposals/{proposal}/accept` lists both on its `proposal`, `null` for the requisition proposals it accepts. Each plan's `buckets[].dependentDemand` now includes Make proposals' components, so a run lists more pairs and more proposals than before on the same data. `plans[].exceptions` may carry the new code:

- `BOM_CYCLE`: "This material is on a cycle of BOMs, so MRP doesn't explode it and proposes no production for it here." `params`: `material`, `location`, `path`.

The order, paging, filters and `MRP_RUN_SUPERSEDED` are unchanged.

## 📝 UI/UX

- **Proposals table** (`app/src/components/mrp/mrp-proposals.tsx`). The Document cell of a `production-order` proposal with a `bom` gains a muted second line, "BOM {bom}, revision {revision}" (`data-mrp-proposal-bom`), in the same style as the Late line under the need date. A requisition, or a row with a `null` BOM, shows none. EN and PL messages are under `mrp.proposals.bom`.
- **Help** (`app/src/help/topics.ts`, the MRP topic, EN and PL):
  - The day paragraph's "dependent demand (components of open production orders)" becomes "(components of open production orders and of production-order proposals)".
  - The proposal paragraph gains: "A production-order proposal also plans what it consumes: through the BOM with the highest priority that is valid on its planned finish, each component needs the proposal's quantity times its quantity per unit, rounded up to six decimals, on the proposal's planned start at the same location. Materials are planned level by level, every product before its components, so a component's needs from all its products and open production orders are netted together and it gets its own proposal. A material on a cycle of BOMs, which CPG never accepts but stored data could contain, gets a BOM cycle exception naming the cycle and no production proposal."
  - The API paragraph gains: "…the BOM and revision a production-order proposal plans through (bom, bomRevision)…".
- No new route, page or control. Prototype: none (a one-line addition to an existing table).

## 📝 Edge Cases & Failure Scenarios

- **A component with no planning parameters at the producing site:** its dependent demand drives Missing Planning Parameters (`no-set`), dated on the first need. A Make component with no valid BOM raises Missing BOM, and a raw component set to Make raises `raw-make`. None of them gets a guessed proposal.
- **An intermediate with its own customer orders:** independent and dependent demand net in its one projection, so a single proposal covers both.
- **A late parent:** it starts today, so its components are needed today and are likely late themselves. Each level is timed by its own lead time (E16-S02).
- **A Beyond Horizon parent:** it still explodes, on its start inside the horizon (Q2).
- **A parent with an exception** (Invalid UoM Conversion, Missing Planning Parameters, Missing BOM, BOM Cycle) has no proposals and explodes nothing. Its components plan from their other demand.
- **Two alternative BOMs with different components:** levels count both (Q3), and the explosion uses the one Q4 chooses on each proposal's finish. Two proposals of one pair may explode through different BOMs when validity windows change inside the horizon.
- **A component used twice in one recipe:** impossible, because `(revision, material)` is unique.
- **A cycle reachable from a sound product:** F → A ↔ B. F plans and explodes into A. A's Make pairs raise BOM Cycle with no proposal, so A's shortage stays visible and B gets nothing from A. Materials only under A plan from their other demand.
- **A cycle of inactive BOMs:** it isn't in the snapshot (Q3), so nothing is raised.
- **Huge quantities:** sums are `bigint` and can't overflow, as #277 already relies on. Stored figures are six-decimal texts.
- **Determinism:** the result depends on the snapshot's content only. A shuffled snapshot, including `boms` and their lines, gives identical plans, proposals, exceptions and shortages.

## 📝 Risks & Impact Review

- **Contract:** two additive fields on the latest-run read and the accept answer, one new exception code with its message (a protected text), and more dependent demand, pairs and proposals on the same data. `BACKWARD_COMPATIBILITY.md` gains the line. A client counting a run's pairs or proposals sees larger numbers, which are the correct plan.
- **During a deploy:** two cases are safe but worth noting in the compatibility entry. Accepting across images, where one image accepts a proposal from the other's run, can be refused as `MRP_PROPOSAL_STALE` when explosion changed the component's plan: run MRP again. An old image reading a stored `BOM_CYCLE` row shows the fallback message (#280 Q7).
- **Schema:** two additive nullable columns. Rollback is `down()`. Update the migration count and lists (lesson 2026-10-23), and run `smoke.test.ts`.
- **Seam rule:** this story edits `mrp-inputs.ts` (`MrpBom`), `replenish-pair.ts` (one check), `rank-shortages.ts` (one kind) and `plan-mrp.ts` (the loop). Explosion is the first seam that links pairs, so it can't sit beside them unchanged. Each edit is one field or one branch, and #280's and #279's tests must pass unchanged apart from the shapes they assert.
- **Performance:** the snapshot reads every active BOM's current lines, a bounded chunked read. The engine adds O(materials + edges) for levels, plus O(proposals × components) for the explosion, with no I/O. Explosion can multiply proposals: in the worst case every day of every level gets one. `mrp-run-timing.test.ts` gains a multilevel fixture (Implementation Plan step 9) under the unchanged budgets, 1,000 ms realistic and 5,000 ms at ten times, with its pairs, proposals and BOM lines printed in absolute counts (lesson 2026-11-01, "A benchmark fixture must keep the shape of real data").
- **Test dataset:** its Make materials (`domain/demo/supply-plan.ts`) now explode, so the Test tenant's runs show more proposals. Tests that pin a dataset run's counts need new figures, each one explained.
- **Product direction:** Q9, marked ⚠, ranks exploded requirements beside customer orders instead of by their root. Q4's interim BOM choice is replaced by E17-S02.

## 📝 Decisions in play

This design honours, and supersedes none of:

- R03: exact six-decimal quantities, with each component need rounded up once.
- R04: immutable revisions, and cycles reported with their path.
- R10: no document written or rewritten.
- D04: the simplest consistent behaviour for Q3 to Q8, Q10 and Q11.
- N04: components planned on the start day only, with no reservation.

Q9 needs Piotr12's confirmation.

## 📋 Phasing

One phase, one implementation PR, as the issue scopes it. The snapshot read, the levels and the explosion are useless apart, and the columns and the UI line are small. Root ranking (Q9) and E17-S02's feasibility choice are follow-ups.

## 📋 Implementation Plan

1. **Inputs and the snapshot.** `MrpBom` gains `bom`, `revision`, `priority`, `componentsActive` and `components: readonly MrpComponentLine[]`. `readBoms` reads them (Architecture, Snapshot). Update every `MrpBom` fixture. Tests in the snapshot service:
   - a revision's lines read and converted;
   - a revision with one unreadable line left out, and that line reported as a `bom-line` of its component at each of the output's Make sites, but not at a Buy site;
   - an inactive component turning `componentsActive` false;
   - the BOM's other revisions never read;
   - chunking past `BOM_CHUNK`;
   - an `EXPLAIN QUERY PLAN` pin of the line read on `bom_component_revision_id_index`, beside the existing pins in `mrp-snapshot.service.test.ts` (lesson 2026-10-31).
2. **Types.** `MrpProposal` gains `bom` and `bomRevision`, and `MrpPlan` gains `plannedComponentDemand` with `MrpPlannedComponentDemand`. `MrpBomCycle` joins `MrpException`. `BOM_CYCLE` joins `exceptions/codes.ts` (after `MISSING_BOM`) and `toStoredException` (`details: { path }`). Update the codes, the stored-exception and the compare-exceptions tests. Until step 6, `planMrp` sets `bom` and `bomRevision` to `null` and `plannedComponentDemand` to `[]`.
3. **Levels and cycles.** `explosion/bom-levels.ts` with tests:
   - a chain F → I → R gives 0, 1 and 2;
   - a diamond keeps the longest chain;
   - a material with no BOM edges is absent, read as 0;
   - a two-member cycle, a three-member cycle and a self-edge, each with its path in the stated notation;
   - an SCC {A, B, C} of two loops, A ↔ B and A ↔ C, where C's path starts and ends at C and passes through A, never B's loop;
   - a cycle reachable from a sound parent, with the parent's level kept and the members' edges dropped;
   - shuffled input gives identical levels and paths;
   - a 2,000-deep chain doesn't overflow the stack.
4. **Explosion.** `explosion/explode-proposal.ts` with tests:
   - BOM-006: 0.5 kg A and 0.2 l B per one, a proposal of 10, gives 5 and 2, each on the proposal's planned start and location;
   - BOM-007: 0.125 × 4 = exactly 0.5. A product that isn't exact rounds up once: 0.333333 per one for a proposal of 0.5 gives 0.1666665, stored as 0.166667. This test fails without the `+ ONE − 1n`.
   - Q4: the lowest priority valid on `plannedFinish`, never one valid only on the need date or start, with a BOM-code tie-break;
   - Q4: an all-active BOM wins over a higher-priority BOM with an inactive component, and the fallback applies when every valid BOM has one;
   - the throw when no BOM is valid.
5. **`replenishPair`.** `PairContext.cycle`, with BOM Cycle checked after `raw-make` and before sizing. Tests: a cycle material's Make pair with and without a need gives the exception and no proposal; its Buy pair still gets proposals; `raw-make` and `invalid-set` still win over it.
6. **The level loop.** `planMrp` (Architecture). In `plan-mrp.ts`'s tests, one test per criterion, asserting on `planMrp`'s result:
   - MRP-031: intermediate I made at L with a valid BOM, short, gives a production-order proposal with its `bom` and `bomRevision`.
   - MRP-029: P1 and P2 need 30 and 40 R on the same day, with 50 R in stock. R's bucket shows `dependentDemand` 70 and `projectedBefore` −20, and R gets exactly one requisition sized from 20 by the lot rules.
   - MRP-020: 100 C, an open order taking 80 C on Monday, and a proposal needing 50 C on Wednesday. Wednesday's `projectedBefore` is −30, and C gets a proposal. The 80 is counted once.
   - MRP-027: F, I and R, none on hand. F's proposal explodes into I on F's start, I's into R on I's start, and R gets a requisition. All three levels' quantities and dates are in the result.
   - MRP-028: A → B → C terminates, and each material plans once. A cycle A ↔ B written into `boms`, with both planned and short, gives BOM Cycle on both Make pairs with each one's path, and neither gets a proposal. B's `plannedComponentDemand` is empty, and every other material still plans. Without the cycle check, A would explode into B and that assertion would fail.
   - A Late Supply parent's components are needed today, and a Beyond Horizon parent still explodes.
   - A parent with Missing BOM explodes nothing.
   - The shuffled-snapshot test is extended to the new lists.
   - The existing Make tests gain components or assert the new fields.
7. **Priority.** `planned-component` at rank 1 (Q9). Tests: a customer order and a planned component on one original date, ordered by kind; two parents on one day, ordered by parent code; two late proposals of one parent, both starting today, ordered by need date; the invariant on a multilevel fixture.
8. **Columns, write and read.** `MrpRecommendation.bom` and `bomRevision`, then `npm run db:migration:create -- mrp_recommendation_bom`, and review the SQL (Data Model). Update the migration lists and counts. Add a migration test: upgrade on a populated table (existing rows read `null`), an old-style insert without the columns, `getUpdateSchemaSQL()` not mentioning the table, and `down()`. `writeResults` stores the two fields, and `proposalsOf` reads them. Tests in `mrp-run.service.test.ts`: a three-level run stored and read back, a requisition's `null`s, and a cycle written around the BOM service with `em.create` of `BomComponent` rows. That last test asserts the stored `BOM_CYCLE` row, its `params.path` and the other materials' proposals. In `mrp-acceptance.service.test.ts`, the accept answer's `proposal` carries `bom: null` and `bomRevision: null`. Re-pin the read in `mrp-report-reads.test.ts` (same plan). Update the route test and the app's `MrpPlanView` fixtures.
9. **Benchmark.** In `mrp-run-timing.test.ts`, split the materials in thirds. The top third is Make at home with one active BOM of `COMPONENTS` lines from the middle third. The middle third is Make too, with BOMs of its own from the bottom third. The bottom third is Buy. All are homed at the same site, so the run has two exploding levels. Run it under the unchanged budgets, print pairs, proposals and BOM lines next to the timings, and record the figures in the PR.
10. **UI line.** `mrp-proposals.tsx` shows the BOM line (UI/UX), with EN and PL messages. Tests in `mrp-proposals.test.tsx`: a production-order proposal shows "BOM 00000004, revision 2", while a requisition and a `null`-BOM row show none.
11. **Integration test.** The two Q12 cases in `tests/integration/mrp-run-api.test.ts`, each with its own materials, BOMs and parameters. Run `npm run test:integration -- tests/integration/mrp-run-api.test.ts tests/integration/smoke.test.ts`.
12. **Copy, docs, catalogue.**
    - The help paragraphs in EN and PL (UI/UX), and the `topics.test.ts` assertions they move.
    - `BACKWARD_COMPATIBILITY.md`:
      - the two fields on the latest-run read and the accept answer;
      - `BOM_CYCLE` and its message;
      - the larger plans on the same data;
      - during a deploy: a previous image's `null`s, cross-image acceptance refused as stale, and an old image's fallback message for `BOM_CYCLE`.
    - `.ai/docs/engineering-standards.md`, MRP bullets:
      - `explosion/` is the seam that links pairs;
      - `bomLevels` and `explodeProposal` are the only level and explosion rules;
      - exploded demand comes after transfers;
      - the BOM choice is interim until E17-S02.
    - `CPG-acceptance.md`: the Evidence lines of BOM-006, MRP-020, MRP-027 (explosion half), MRP-028, MRP-029 and MRP-031, citing the tests. A status moves only when every clause, channel included, is asserted (lesson 2026-10-21). MRP-027's and MRP-047's executability halves stay with E17-S02 and E17-S03.
    - File the follow-up for root ranking (Q9, MRP-044's multilevel case) and cite its number.
    - Move this spec to `implemented/` with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

- **Implementation PR** #326, from `main`; the spec PR #325 stays design-only.
- **Priority key (Q9).** A planned component's tie-break position is the number of days from its date (the parent's start) to the parent's need date, not the need date's horizon day. Within one parent and one start day, both orders are the same, and the subtraction avoids passing the horizon into `rankShortages`. Root ranking is filed as #327.
- **Snapshot.** `readBoms` takes `planningParameters` and `unreadable` from `load`, and reads the tenant's inactive materials once, as a partial `{ active: false }` list, for `componentsActive`. The new line read is the same SQL shape as the production orders' pinned-line read. The existing `EXPLAIN` test now pins both reads to `bom_component_revision_id_index`.
- **Types.** `MrpProposal` gained `MrpProposalRecipe` (`bom`, `bomRevision`). `SizedProposal` omits it, and `replenishPair` returns a `TimedProposal`, the proposal before `planMrp` explodes it.
- **Benchmark** (`mrp-run-timing.test.ts`, fastest of three, run locally, under the unchanged 1,000 ms and 5,000 ms budgets):

  | Size | Pairs | Daily rows | Recommendations | Exploded | Active BOM lines | Run | Longest stall | `planMrp` alone |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Realistic | 43 | 3,870 | 795 | 327 | 80 | 243 ms | 33 ms | 6 ms |
  | Ten times | 441 | 39,690 | 4,869 | 2,323 | 800 | 2,439 ms | 121 ms | 59 ms |

  The worst case for proposals (a proposal every day of every material) is 291 ms realistic and 3,367 ms at ten times, with a 210 ms longest stall. The fixture's only exceptions are `INSUFFICIENT_TRANSFER_STOCK`, and the test asserts that.
- **Test dataset.** No unit or integration test pinned a dataset run's proposal counts, so none moved.
- **Integration.** Docker was unavailable locally, so the files ran against a standalone build (lesson 2026-10-23). `mrp-run-api` and `smoke` passed (16 tests). `mrp-accept`, `mrp-accept-api`, `mrp-report`, `mrp-report-api` and `mrp-run` passed (27 tests).

