# MRP BOM choice: every Make proposal plans through the highest-priority usable BOM it can be made from after lot rounding, against stock and dependable supply only, passes over each rejected BOM with its reason, and raises a parent exception when none qualifies

**Status:** implemented. Feasibility reads `lowestDependableBalances`, one array per component, rather than the design's per-day `lowestDependableBalance` (Implementation notes).
**Created:** 2026-11-01 19:18 UTC
**Issue:** #282 (E17-S02, epic #269) · **Depends on:** BOM explosion (`implemented/2026-11-01--1107UTC-mrp-bom-explosion.md`, #281), purchasing supply (`implemented/2026-10-31--0905UTC-mrp-purchasing-supply.md`, #276), production and transfer supply (`implemented/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`, #277), replenishment proposals (#278), proposal timing and priority (#279), planning exceptions (#280), all merged · **Design authority:** `.ai/specs/product-brief.md` (R03, R04, R10, D04, N04), `research/CPG-prd001.pdf` §04 "BOM choice and explanation", "Parameters/precision", closure defaults, `research/CPG-acceptance.md` MRP-024, MRP-025, MRP-026, MRP-041, MRP-046, MRP-050, BOM-010, BOM-011, LFC-025, LFC-026, PRD-002

## 📝 TLDR

Today every Make proposal explodes through the highest-priority BOM valid on its planned finish (#281's interim rule, Q4), whether or not its components will be there. So MRP can propose production that can't run, and when every valid BOM has an inactive component it still explodes one, planning the inactive material. After this change, MRP tests each Make proposal's BOMs in priority order, at the proposal's lot-rounded quantity:

- A BOM with an inactive component is rejected as **inactive-component**.
- A BOM whose full requirement of some component is more than that component can still give is rejected as a **shortage**, naming each missing component with its required, available and shortage quantities. What a component can still give comes from its stock and dependable supply only, never requisitions or proposals. It is net of what existing documents and earlier proposals need from the proposal's start to the end of the horizon.
- The first BOM that passes is chosen, and the proposal records it.

When every BOM valid on a proposal's finish has an inactive component, the pair raises **Missing Usable BOM** and gets no proposal (LFC-026). When usable BOMs exist but none can be supplied, the proposal raises **No Feasible BOM**, listing each BOM's missing components. It is still exploded, provisionally, through the highest-priority usable BOM, so its components are planned (BOM-011). E17-S03 then keeps that provisional chain apart from executable supply.

## 📝 Problem Statement

`explodeProposal` (`domain/mrp/explosion/explode-proposal.ts`) picks a BOM by validity, then "all components active", then priority. Nothing asks whether the components will be there:

- **Infeasible production is proposed as if it could run.** F short by 4.1, with a lot multiple of 2, is proposed at 6. Its priority-1 BOM needs 6 A and only 5 A are dependable. MRP still explodes priority 1 and never tries priority 2, which needs B, of which there is plenty (MRP-025, MRP-046, BOM-010).
- **Tentative supply isn't separated.** A requisition of 50 A is not approved supply (E15-S02), but nothing stops a BOM that relies on it from being chosen (MRP-041).
- **An inactive component is still planned.** When F's only BOM uses a deactivated raw R, #281's fallback explodes it anyway, so R gets demand and a requisition proposal for a material nobody may buy (LFC-025, LFC-026, MRP-050).
- **No reason is given.** The PRD requires every rejected BOM to be explained with its missing components and shortages ("BOM choice and explanation"). The run doesn't know why a BOM was or wasn't used.
- **Competing proposals aren't ordered.** Two Make proposals that need the same scarce component must be served in E16-S02's priority, the earlier start first. Today parents explode in material-code order, and nothing is claimed.

The production dialog already preselects a feasible BOM (E10-S01), but against current physical stock at the site (PRD-002 Evidence, its spec's Q1). That stays: MRP's choice uses projected dependable supply.

## Resolved assumptions (autonomous defaults)

The issue's three open questions, plus the gaps between its notes and the shipped engine, each answered with the most reversible choice. There is no schema change. The contract change is two new exception codes, more accurate BOMs on the same data, and no proposal for a pair whose valid BOMs all have an inactive component.

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Which availability does feasibility test (issue open question 1)? | **⚠ NEEDS HUMAN CONFIRMATION.** The issue's proposal: the component's **lowest dependable balance from the proposal's planned start through day 89**, at the producing site, never below zero. The balance is `dependableBalance`'s (#277): physical stock, purchase orders, open production output and transfers, less firm, forecast, dependent and transfer demand. It never counts requisitions or proposals. It does count what every proposal already given a feasible BOM takes, and it **leaves out** what provisional (No Feasible BOM) proposals take (Q4). | The lowest balance from the start onward is the only measure under which a feasible choice is never undercut later in the same run. A start-day balance would let a level-1 proposal starting on day 5 take R that a level-0 proposal starting on day 60 had already counted on, because levels are planned in order. It also protects open documents' later needs: an open production order's components on day 50 rank first (E16-S02), and a hypothetical order must not take them. It reads the PRD's "on-hand plus dependable already-scheduled receipts and issues" as of the start day, including the issues after it. Changing the measure is a change to one function. **Why ⚠:** the implementation's benchmark gives every material its own forecast. Under this rule no Make proposal there was feasible: every component's dependable balance falls below zero later in the horizon. The owner chooses between this window, the component's own lead time from the start, and the start day alone. |
| Q2 | One code or two for a parent with no BOM to use (issue open question 2)? | **Two**, as the issue proposes. **`MISSING_USABLE_BOM`**: a proposal's BOMs valid on its planned finish all have an inactive component. It is per pair, like Missing BOM: dated at the first such proposal's finish, it stops all of the pair's proposals, so nothing explodes. **`NO_FEASIBLE_BOM`**: usable BOMs exist and none can be supplied. It is raised once per infeasible proposal, dated at that proposal's need date. The proposal is kept (Q4). | They differ for the planner. The first is master data to fix, so nothing about it can be planned (LFC-026: "no F production order, no PR for inactive R"). The second is a supply problem whose components still need planning (BOM-011, MRP-047). A pair's proposals can be feasible on some days and not others, so the second belongs to the proposal, which its need date identifies (`MrpRecommendation`'s unique key). |
| Q3 | Which date makes a BOM valid (issue open question 3)? | The proposal's **`plannedFinish`**, unchanged from #281 Q4 and the Missing BOM check. | It is the issue's proposal and the day `resolveProductionOptions` checks. |
| Q4 | What happens to an infeasible proposal in this story? | It stays in `proposals` and in the stored run, with the **highest-priority usable BOM** as its `bom` and `bomRevision`. It is exploded through that BOM, so its components get dependent demand and their own proposals (BOM-011, MRP-026, MRP-047). The engine marks the proposal `feasible: false` and each component need it adds `provisional: true`. Provisional needs are **left out of every later feasibility test** (Q1), but stay in the components' projections. Its receipt still counts in the parent's `proposedReceipts`, as today. | BOM-011 asks for the subcomponents to be planned "by selected default recipe". E17-S03 ("built from E17-S01's explosion of the proposals E17-S02 marked infeasible") keeps that chain apart from executable supply, stores the distinction, and takes the hypothetical output out of the parent's balances. Counting a hypothetical order's needs against real ones would let one infeasible parent make every later proposal on the same component infeasible. No Make proposal can be accepted yet (`isExecutableProposal`), so nothing executes a provisional proposal in the meantime. **Known limit, owned by E17-S03:** the mark covers only the provisional proposal's direct needs. A lower-level proposal that exists only because of them is sized and tested as a normal one, and its own needs count in full. Carrying the mark down needs each pair sized with and without its provisional demand, which is E17-S03's provisional plan (#283: "hypothetical parent and intermediate actions"). |
| Q5 | In what order are competing proposals tested (issue criterion 12)? | Within one level, every pair is sized first, as today. Then the level's production-order proposals choose their BOMs in **E16-S02's order for planned components**: by planned start, then material, location and need date. Each claims its components before the next is tested. A level's pairs feed only higher levels, so sizing them first changes no figure. | `rankShortages` ranks a planned component by its parent's start, then the parent's code, then its need date (#281 Q9), so the proposal "served first by E16-S02's priority" is the earlier start. Under Q1 the order decides only who gets a scarce component, never whether a choice already made holds. |
| Q6 | Where do the rejections live? | **In the engine result**: each proposal carries `rejectedBoms`, every BOM tested before the chosen one, in order, each with its reason and, for a shortage, every short component's `required`, `available` (clamped at zero, as Insufficient Transfer Stock's) and `shortage`, the production dialog's own names (`componentRequirement`). The **stored** exceptions name the missing components in params. Missing Usable BOM lists each valid BOM's inactive components; No Feasible BOM lists each usable BOM's short components with their required, available and shortage quantities. The rejections of a feasible fallback (BOM-010) aren't stored or listed: MRP-024's "no fallback or rejection is recorded" is asserted on the engine result in this story. | Presenting rejections is E18-S03, out of this story's scope, as showing `plannedComponentDemand` was for #281 (Q10). The engine result proves every criterion. The stored exceptions carry what a client must act on, with no schema change. E18-S03 decides how to store and show the full figures. |
| Q7 | #281's fallback when every valid BOM has an inactive component? | **Removed.** That case is now Missing Usable BOM (Q2). | It planned the inactive material (LFC-026). #281's spec named this story as its replacement. |
| Q8 | The eligibility rule the issue wants in one place? | `isUsableRevision(revision, componentsActive, date)` in `domain/boms/bom-validity.ts`: the revision is valid on `date` (`isRevisionValidOn`) and its components are all active. `resolveProductionOptions` and MRP both call it. The dialog's feasibility stays physical stock (PRD-002, E10-S01 Q1). | It is the issue's note. The snapshot already passes only active BOMs' current revisions, and the dialog reads the same, so "active BOM, current revision" is the read's part and the rest is this function. |
| Q9 | A component with an unreadable row? | It can give **nothing** (available 0) to any feasibility test, so a BOM needing it is rejected as a shortage. The component's own pairs raise Invalid UoM Conversion, which names the row. | #316's rule: no figure from a balance an unreadable row left incomplete. A choice made on such a balance would be a guess. |
| Q10 | Executability and acceptance? | `isExecutableProposal` is **unchanged**: a production-order proposal still can't be accepted. Its doc comment says the Make half (E19-S01) also needs E17-S03's stored provisional mark. | Accepting a proposal is out of scope. Without E17-S03 the stored run can't tell a provisional proposal from a feasible one. |
| Q11 | Integration tests? | Two cases in `tests/integration/mrp-run-api.test.ts`. **Fallback.** F has a priority-1 BOM needing 1 A and a priority-2 BOM needing 1 B, with 5 A and 20 B on hand, a lot multiple of 2 and a customer order of 4.1. The latest run lists F's proposal of 6 with priority 2's `bom`, and no exception for F. **No usable BOM.** G's only BOM uses raw R, deactivated through the materials API. With a customer order for G, the run lists `MISSING_USABLE_BOM` for G with `params.inactive`, and no proposal for G or R. | The production image is the only proof that the codes, messages and params reach a client. No Feasible BOM is proved in the service test, beside the stored row it writes. |
| Q12 | Proposals on different levels competing for one component? | The **higher level claims first**, whatever the dates. A level-1 proposal starting on day 5 can't take C that a level-0 proposal starting on day 60 already claimed. Within a level, Q5's order applies. | A level-1 proposal doesn't exist until level 0 has exploded into its pair, so it can't be tested earlier without replanning the level above (#281 Q11). Criterion 12 is met between proposals of one level. It can't be met across levels, so the run can disagree with itself there. `rankShortages` on C serves the day-5 need before the day-60 one, so it reports the "feasible" day-60 need as uncovered while the "infeasible" day-5 one is served. Feasibility and ranking answer different questions: whether a choice can rely on C, and who is short on a day. Shared components across levels are where this shows. Undoing it would need an iterative replan, a larger design for a later story if the owner wants it. |

The issue's Q05 (the showcase) doesn't bear on this design.

## 📝 Proposed Solution

A pure BOM choice beside the explosion, a usable-BOM check in `replenishPair`, and a claim order in `planMrp`'s level loop:

```
domain/boms/
  bom-validity.ts              + isUsableRevision(revision, componentsActive, date)           (Q8)
domain/mrp/
  mrp-inputs.ts                MrpBom: componentsActive → inactiveComponents (codes)
  mrp-result.ts                MrpProposalRecipe + feasible, rejectedBoms; + MrpBomRejection, MrpComponentShortfall;
                               MrpPlannedComponentDemand + provisional; + MrpMissingUsableBom, MrpNoFeasibleBom
  plan-mrp.ts                  per level: size all pairs, choose and explode in priority order, then project
  explosion/
    choose-bom.ts              chooseBom(proposal, boms, available): { bom, feasible, rejected }  (new)
    explode-proposal.ts        explodeProposal(proposal, bom, provisional): components only
  projection/project-buckets.ts + lowestDependableBalance(ledger, fromDay, excluded)
  sizing/replenish-pair.ts     + MISSING_USABLE_BOM after MISSING_BOM
  exceptions/codes.ts          + MISSING_USABLE_BOM, NO_FEASIBLE_BOM, their messages and rank
  exceptions/stored-exception.ts + both codes → details { inactive } / { missing, inactive? }
services/
  mrp/snapshot/boms.ts         inactiveComponents instead of componentsActive
  production-orders/production-recipes.ts  isUsableRevision instead of its inline check
```

**Alternatives considered.**
- *Test feasibility on the start day only.* It is cheaper, but a later-tested proposal starting earlier could take what an earlier choice counted on, so a "feasible" BOM could be undercut in the same run (Q1).
- *Drop an infeasible proposal.* Its components would go unplanned, contrary to BOM-011 and MRP-047, and E17-S03 would have nothing to build its provisional plan from.
- *Count provisional needs like any other.* One infeasible parent would make every later proposal on the same component infeasible (Q4).
- *Store the rejections now* (a table or a JSON column). That is a schema change for E18-S03's presentation, which belongs with that story (Q6).
- *One No Feasible BOM per pair.* A pair can be feasible on some days and not others, and its proposals stay. A per-pair row couldn't say which proposals are provisional (Q2).

## 📝 Architecture

### Usable revision: `domain/boms/bom-validity.ts`

```ts
/** The revision can be produced with on `date`: valid then, and every component active (R04, PRD §04 "BOM choice"). */
export function isUsableRevision(revision: RevisionValidity, componentsActive: boolean, date: string): boolean
```

`resolveProductionOptions` replaces its `isRevisionValidOn` filter and `components.some(({ active }) => !active)` skip with it. Its behaviour, tests and messages are unchanged.

### Inputs: `MrpBom.inactiveComponents`

`componentsActive: boolean` becomes `inactiveComponents: readonly string[]`: the codes of the revision's components that are inactive, in code order, empty when all are active. `readBoms` already reads the tenant's inactive materials once (#281). It lists them instead of testing `some`. A BOM is usable on a date when `isUsableRevision(bom, bom.inactiveComponents.length === 0, date)`.

### Availability: `projection/project-buckets.ts`

```ts
/**
 * The lowest dependable balance of `ledger` from day `fromDay` through the last day, with `excluded[day]`
 * added back on each day (Q1, Q4). It may be negative.
 */
export function lowestDependableBalance(ledger: MrpLedger, fromDay: number, excluded: readonly bigint[]): bigint
```

It walks the days once, adding `dependableChange(day) + excluded[day]`, the same terms as `dependableBalance`, and keeps the minimum from `fromDay` on. `excluded` is the component's provisional dependent demand per day, which `planMrp` keeps per pair (Q4). Tentative supply and proposed receipts are never counted (MRP-041). The component's own proposals don't exist yet when its parent is tested, because components are at a higher level (#281).

### The choice: `explosion/choose-bom.ts`

```ts
/** The BOM a production-order proposal plans through, whether it can be supplied, and every BOM passed over before it (E17-S02). */
export function chooseBom(
  proposal: Pick<MrpProposal, "material" | "quantity" | "plannedFinish">,
  boms: readonly MrpBom[],
  available: (component: string) => bigint,
): { bom: MrpBom; feasible: boolean; rejected: MrpBomRejection[] }
```

- **Candidates.** The output's BOMs valid on `plannedFinish` (`isRevisionValidOn`), by `priority`, then BOM code. Priority is total among active alternatives (R04, `findPriorityConflict`). The code only keeps stored data deterministic.
- **Each in order.** A BOM with an `inactiveComponents` entry is rejected as `{ reason: "inactive-component", materials }`. Otherwise each line needs `scaledMicro(perOutput, proposal.quantity)`, the requirement the explosion and production orders use (R03, BOM-007), and gets `available(material)` clamped at zero. Every line whose need is more than that is a `{ material, required, available, shortage }`, by component code. A revision has at most one line per material (`(revision, material)` is unique, and entry refuses duplicates), so lines are tested one by one. None means this BOM is chosen, `feasible: true`, with the BOMs before it in `rejected` (MRP-024, BOM-010). Otherwise it is rejected as `{ reason: "shortage", shortages }` and the next is tested (MRP-025).
- **None feasible.** The first usable candidate is returned with `feasible: false`, and every candidate is in `rejected` (BOM-011).
- **None usable.** `replenishPair`'s Missing BOM and Missing Usable BOM checks guarantee one exists. If not, the function throws an `Error` naming the material, a programming error that a unit test pins.

`proposal.quantity` is already lot-rounded by `sizeProposals` (MRP-046). The choice never rounds again.

### The explosion: `explosion/explode-proposal.ts`

`explodeProposal(proposal, bom, provisional)` keeps #281's arithmetic, location and date, and loses its choice (`compareRecipes`). Each item gains `provisional`.

### Usable BOM check: `sizing/replenish-pair.ts`

After Missing BOM, a Make pair whose proposal has no usable BOM on its planned finish (`!boms.some((bom) => isUsableRevision(bom, bom.inactiveComponents.length === 0, plannedFinish))`) returns `none({ code: "MISSING_USABLE_BOM", material, location, date: plannedFinish, inactive })`. The `date` is the first such proposal's planned finish. `inactive` lists that day's valid BOMs, each `{ bom, revision, materials }`, in candidate order. The doc comment's numbered list gains it as rule 6, and its "exactly one of four exceptions" becomes six. It also says that No Feasible BOM, raised later by `planMrp`, is the one planning exception a pair has beside its proposals. Every earlier rule is unchanged.

### The level loop: `plan-mrp.ts`

Everything before the loop is unchanged. Each level now runs in three passes:

```ts
for (const level of byLevel) {
  const sized = level.sort(comparePairs).map((draft) => ({ draft, replenished: replenishPair(…) }));   // as today
  // Book every receipt (unchanged), and pass each requisition through with bom/bomRevision/feasible null.
  const makes = sized.flatMap(…production-order proposals…)
    .sort((a, b) => compareCodes(a.plannedStart, b.plannedStart) || comparePairs(a, b) || compareCodes(a.needDate, b.needDate)); // Q5
  for (const proposal of makes) {
    const start = dayOf.get(proposal.plannedStart)!;
    const choice = chooseBom(proposal, bomsOf.get(proposal.material)!, (component) =>
      unreadable.has(component) ? 0n : availableOf(component, proposal.location, start));                  // Q1, Q9
    const components = explodeProposal(proposal, choice.bom, !choice.feasible);
    proposals.push({ ...proposal, bom: choice.bom.bom, bomRevision: choice.bom.revision, feasible: choice.feasible, rejectedBoms: choice.rejected });
    for (const item of components) { /* dependentDemand and plannedComponentDemand, as today; provisional[day] += quantity when provisional */ }
    if (!choice.feasible) exceptions.push({ code: "NO_FEASIBLE_BOM", material, location, date: proposal.needDate, rejections: choice.rejected });
  }
  for (const { draft, replenished } of sized) { /* exception, project, rank: unchanged */ }
}
```

- `availableOf` reads the component's `PairDraft` **without creating one**. A component with no pair has no stock, supply or demand, so it gives 0, and a BOM that isn't chosen adds no plan. Each `PairDraft` gains `provisional: bigint[]` (90 zeros), passed as `excluded`. It is destructured out with `flows` before the plan is built, so it never reaches `MrpPlan`.
- A chosen BOM's needs, feasible or not, go into the component's `dependentDemand` as today, so its projection and proposals cover them. Only feasibility tests leave the provisional ones out.
- **Determinism.** The claim order is total (Q5). Results depend only on the snapshot's content, and the shuffled-snapshot test covers the new fields.
- **Cost.** Each candidate line costs one 90-day walk: O(Make proposals × candidates × lines × 90), with no I/O. At #281's ten-times benchmark (2,323 exploded proposals, eight lines, one BOM each), that is about 1.7 million additions.

### Exceptions and storage

- `MRP_EXCEPTION_CODES` becomes `INVALID_UOM_CONVERSION, MISSING_PLANNING_PARAMETERS, MISSING_BOM, MISSING_USABLE_BOM, CYCLIC_BOM, NO_FEASIBLE_BOM, INSUFFICIENT_TRANSFER_STOCK`. Existing codes keep their relative order. A pair with No Feasible BOM has proposals, so it never also has one of the first five. Two of its rows differ by date, so `compareExceptions` stays total.
- `toStoredException` stores Missing Usable BOM as `date` = the planned finish, `details: { inactive }`, and No Feasible BOM as `date` = the need date, `details: { missing, inactive? }`. Both use a language-neutral notation, BOMs in candidate order separated by `; `:
  - `inactive`: `00000004/1: 00000011, 00000012`, BOM/revision then its inactive components;
  - `missing`: `00000005/2: 00000013 6.000000 5.000000 1.000000, 00000014 0.500000 0.000000 0.500000`, BOM/revision then each short component with its required, available and shortage quantities as six-decimal texts, in that order. `inactive` is present on No Feasible BOM only when a valid BOM was rejected for an inactive component.
- No column, table or migration. `mrp_run_exception.exception_code` takes any string (#280 Q6). `bom` and `bomRevision` on `mrp_recommendation` now hold the chosen or provisional BOM.

## 📝 Data Model

No change. `MrpRecommendation.bom` and `bomRevision` (#281) store the chosen BOM, or the provisional one for a No Feasible BOM proposal. `MrpRunException` stores the two new codes in its existing columns. `feasible`, `rejectedBoms` and `provisional` are engine-only (Q4, Q6).

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest`: the shapes don't change. On the same data:

- a production-order proposal's `bom` and `bomRevision` may name a lower-priority BOM that its components can supply (MRP-024, MRP-025);
- a pair whose valid BOMs all have an inactive component lists no proposals, and its components get no demand from it (LFC-026);
- a plan with `NO_FEASIBLE_BOM` keeps its proposals, so "any exception but `INSUFFICIENT_TRANSFER_STOCK` means `proposals: []`" no longer holds for it. A daily lot-for-lot pair can list up to 90 such rows;
- `plans[].exceptions` may carry two new codes, in run order:
  - `MISSING_USABLE_BOM`: "This material is made at this location, but every BOM valid on the planned finish date has an inactive component, so MRP proposes no production." `params`: `material`, `location`, `date`, `inactive`.
  - `NO_FEASIBLE_BOM`: "No usable BOM of this material can be supplied from stock and dependable supply on the proposal's planned start, so the proposal can't be produced as planned; its components are planned through the highest-priority usable BOM." `params`: `material`, `location`, `date` (the proposal's need date), `missing`, and `inactive` when a valid BOM had an inactive component.

```json
{ "code": "NO_FEASIBLE_BOM", "message": "No usable BOM of this material …",
  "params": { "material": "00000001", "location": "00000001", "date": "2026-11-05",
              "missing": "00000004/1: 00000011 6.000000 5.000000 1.000000; 00000005/1: 00000012 6.000000 3.000000 3.000000" } }
```

The accept endpoint, its freshness rule (kind, quantity and planned finish) and `executable` are unchanged.

## 📝 UI/UX

No screen change. The proposals table already shows each proposal's BOM line (#281). Rejections, exceptions and provisional plans are presented by E18-S03. The help topic changes (`app/src/help/topics.ts`, the MRP topic, EN and PL):

- The proposal paragraph's "through the BOM with the highest priority that is valid on its planned finish" becomes: "through the BOM with the highest priority that is valid on its planned finish, whose components are all active and can all be supplied on its planned start. Supply here means stock and dependable supply (purchase orders, open production orders and transfers, never requisitions or other proposals), less what existing documents and earlier proposals need from that day to the end of the horizon. The quantity is rounded by the lot rules first. A BOM with an inactive component, or with a component that can't be supplied, is passed over for the next one."
- A new sentence after it: "When every valid BOM has an inactive component, the material gets a no usable BOM exception and no production proposal. When no usable BOM can be supplied, the proposal still plans its components through the highest-priority usable BOM, and it gets a no feasible BOM exception listing each BOM's missing components."

The glossary guards apply (BOM, not recipe). Prototype: none.

## 📝 Edge Cases & Failure Scenarios

- **Two valid BOMs of equal priority:** impossible among active alternatives (R04). If stored data has them, the BOM code decides.
- **A component on hand today, needed later by an open production order:** it can't be given to a new proposal starting earlier (Q1). If no other BOM qualifies, the proposal is provisional and the order keeps its components.
- **A purchase order arriving before the parent's start:** counted from its day, so the BOM is feasible (PRD-002, the MRP half).
- **A requisition only:** tentative, never counted, so the BOM is rejected as a shortage (MRP-041).
- **A component also sold, with its own forecast:** its forecast lowers its dependable balance, so a parent can take only what is left after it.
- **A provisional parent sharing a component with a feasible one:** the provisional needs drive the component's proposals, but never make the other parent infeasible (Q4).
- **A late or Beyond Horizon parent:** it is tested from its planned start, today for a late one, and from inside the horizon for a Beyond Horizon one, as it is exploded (#281 Q2).
- **A BOM valid on a later proposal's finish but not an earlier one's:** each proposal has its own candidates, so two proposals of one pair may plan through different BOMs.
- **A component with no pair at the site:** it gives 0, and no plan is created for it unless a chosen BOM needs it.
- **A component with an unreadable row:** it gives 0 (Q9), and its own exception names the row.
- **A cycle member:** it never reaches the choice, because BOM Cycle stops its Make pairs (#281 Q7).
- **Huge quantities:** sums are `bigint`, as in #277 and #281.

## 📝 Risks & Impact Review

- **Contract:** the documented rule "A plan with any exception but `INSUFFICIENT_TRANSFER_STOCK` has `proposals: []`" (`BACKWARD_COMPATIBILITY.md`, E16-S03) gains a second exception: a plan with `NO_FEASIBLE_BOM` keeps its proposals, one row per provisional proposal. Also two new exception codes with protected messages and params, other BOMs on the same data, and no proposal (with no exploded demand) for a pair whose valid BOMs all have an inactive component. `BACKWARD_COMPATIBILITY.md` gains the entry. During a deploy, an old image reading a stored new code shows the fallback message (#280 Q7). Accepting across images is unaffected, because the freshness rule compares kind, quantity and planned finish, never the BOM.
- **Interim state until E17-S03:** a provisional proposal is stored and listed like a feasible one, apart from its No Feasible BOM exception, and its receipt still covers the parent's shortage in `projectedAfter`. Nothing can accept a Make proposal meanwhile (Q10). E17-S03's issue already plans the stored distinction and the balance change.
- **Product behaviour:** Q1's measure is conservative. A component that later existing demand already needs can't be given to a new proposal, even when it is on hand today. That includes the component's own forecast, which E16-S02 ranks last: a forecast on day 50 can make a proposal starting on day 5 infeasible. That is the issue's proposal, and only `lowestDependableBalance`'s window would change if the owner prefers otherwise.
- **Seam rule:** this story edits `mrp-inputs.ts` (one field), `replenish-pair.ts` (one rule), `explode-proposal.ts` (its choice moves out), `project-buckets.ts` (one function) and `plan-mrp.ts` (the level's passes). Many existing Make fixtures in `plan-mrp.test.ts`, the run service's tests and the integration tests have no stock for their components. Their proposals now raise No Feasible BOM, so assertions of empty exception lists change. Each changed expectation is either given component stock, keeping the test's intent, or asserts the new row, and the PR explains which. A test that relied on #281's inactive-component fallback now asserts Missing Usable BOM.
- **Performance:** no new read. The engine adds Q5's sort and the walks above. `mrp-run-timing.test.ts` runs under its unchanged budgets, 1,000 ms realistic and 5,000 ms at ten times, with a second BOM per top-level output so every proposal tests two candidates. The figures go in the PR (lesson 2026-11-01).
- **Test dataset:** its Make materials may now choose other BOMs or raise No Feasible BOM, so Test-tenant runs change. Tests that pin a dataset run's figures need new values, each one explained.

## 📝 Decisions in play

This design honours, and supersedes none of:

- R03: the requirement is the lot-rounded quantity times each line, rounded up once.
- R04: priority orders alternatives fully on a date.
- R10: no document is written or rewritten.
- D04: the simplest consistent behaviour for Q4 to Q9 and Q12.
- N04: no reservation. A claim lives only inside one run's plan.

Q1 needs Piotr12's confirmation before merge.

## 📋 Phasing

One phase, one implementation PR, as the issue scopes it. The choice, the claim order and the exceptions are useless apart. Storing and showing rejections and provisional plans are E17-S03 and E18-S03.

## 📋 Implementation Plan

1. **Usable revision.** `isUsableRevision` in `domain/boms/bom-validity.ts`, with tests for a valid revision with all components active, one with an inactive component, and one outside its dates. `resolveProductionOptions` keeps its date filter before loading components, so invalid revisions are never loaded. After `componentSets` it replaces the `components.some(({ active }) => !active)` skip with `!isUsableRevision(recipe, components.every(({ active }) => active), input.plannedFinish)`. Its existing tests pass unchanged.
2. **Inputs.** `MrpBom.inactiveComponents` replaces `componentsActive`. `readBoms` lists the codes in code order, and `compareRecipes` reads `inactiveComponents.length === 0` until step 5 removes it. Update every `MrpBom` fixture. The snapshot test asserts the codes of two inactive lines and an empty list.
3. **Types and codes.**
   - `MrpBomRejection`, `MrpComponentShortfall`, and `MrpProposalRecipe` gains `feasible` and `rejectedBoms`. `MrpPlannedComponentDemand` gains `provisional`.
   - `MrpMissingUsableBom` and `MrpNoFeasibleBom` join `MrpException`. Both codes go into `exceptions/codes.ts` at their ranks, with their messages, and into `toStoredException` with the notation.
   - Tests: the codes order, the messages, both stored shapes, with `inactive` present and absent, and their order in `compareExceptions`.
   - Until step 7, `planMrp` sets `feasible: true` and `rejectedBoms: []` on production-order proposals, and `null`/`[]` on requisitions.
4. **Availability.** `lowestDependableBalance` with tests:
   - the minimum from `fromDay`, never an earlier day's;
   - tentative supply and proposed receipts are never counted;
   - `excluded` added back on its days;
   - equal to `dependableBalance(ledger, 89)` when the balance only falls.
5. **Choice and explosion.** `explosion/choose-bom.ts`, and `explodeProposal` takes the chosen BOM and `provisional`. Tests on `chooseBom`, one per criterion:
   - MRP-024: priority 1 feasible is chosen, with `rejected` empty.
   - MRP-046: a proposal of 6 needing 1 A per unit, with 5 A, is `feasible: false` with A 6 required, 5 available, 1 shortage. 4.1 A would fit, so the test fails if the choice used the unrounded need.
   - MRP-025: priority 1 is rejected with that shortage, and priority 2 is chosen only when its full requirement of B is available. With 5.9 B for a need of 6, both are rejected and the result is infeasible through priority 1.
   - BOM-010: a higher-priority BOM missing two components lists both, by code.
   - MRP-050: priority 1 with an inactive R is rejected as inactive-component, and priority 2 is chosen.
   - BOM-011: both BOMs short gives `feasible: false` through priority 1, with both rejections.
   - Negative availability is clamped at zero.
   - The throw when no candidate is usable.
6. **`replenishPair`.** The Missing Usable BOM rule. Tests:
   - LFC-026: F's only valid BOM has inactive R. F gets the exception dated at the first proposal's finish, with `inactive`, and no proposal.
   - It is checked after Missing BOM.
   - A usable BOM valid only on a later proposal's finish still raises it for an earlier one.
   - #281's inactive-component fallback test is replaced by these.
7. **The level loop.** `planMrp` (Architecture). In `plan-mrp.ts`'s tests, one per criterion, asserting on `planMrp`'s result:
   - MRP-041: a requisition of 50 R, and a priority-1 BOM needing those 50, gives a fallback to priority 2. With no priority 2, the result is a No Feasible BOM exception and a provisional proposal.
   - PRD-002 (the MRP half): priority 1's components arrive on a purchase order before the parent's start, so priority 1 is chosen.
   - Issue criterion 12: two parents competing for 10 C, starting on days 3 and 5, needing 8 each. The day-3 one is feasible and the day-5 one isn't, whatever the material codes. Swapping the codes keeps the result.
   - Q1: a later open production order's need for C makes an earlier-starting proposal infeasible.
   - Q12: a level-0 proposal starting on day 60 keeps its C when a level-1 proposal starting on day 5 is tested, and the level-1 one is infeasible.
   - Q4: a provisional parent's needs are in its component's `dependentDemand` and drive its proposal. A feasible parent tested after it isn't affected.
   - MRP-026 and BOM-011: F is infeasible because I has no stock. I is still planned from F's provisional need. A lower-level proposal for its own independent demand (a customer order of I, with R in stock) is feasible.
   - LFC-025 (the MRP half): F never plans through a BOM while its R is inactive.
   - LFC-026: F gets Missing Usable BOM, R gets no proposal, and an unrelated material still plans.
   - Q9: an unreadable component gives 0.
   - A candidate BOM's component with no pair at the site gives 0, and no plan is created for it when that BOM isn't chosen.
   - The shuffled-snapshot test is extended to the new fields.
8. **Service and storage.** In `mrp-run.service.test.ts`, against a real SQLite file:
   - LFC-025 and LFC-026: deactivate R through `MaterialService`, run, and assert the stored `MISSING_USABLE_BOM` row and its `params`;
   - a No Feasible BOM run: the stored row, `params.missing`, and the provisional `bom` on the recommendation.
   - In `mrp-acceptance.service.test.ts`, the freshness rule is unchanged by a fallback.
9. **Benchmark.** `mrp-run-timing.test.ts` gives each top-level output a second, lower-priority BOM. It runs under the unchanged budgets and prints pairs, proposals, candidates tested and No Feasible BOM rows beside the timings, so the per-proposal row volume is visible. The figures go in the PR.
10. **Integration test.** The two Q11 cases in `tests/integration/mrp-run-api.test.ts`, each with its own materials, BOMs and parameters. Run `npm run test:integration -- tests/integration/mrp-run-api.test.ts`.
11. **Copy, docs, catalogue.**
    - The help paragraphs in EN and PL (UI/UX), and the `topics.test.ts` assertions they move.
    - `isExecutableProposal`'s doc comment (Q10), and `replenishPair`'s doc comment.
    - `BACKWARD_COMPATIBILITY.md`: the amended "any exception but `INSUFFICIENT_TRANSFER_STOCK` has `proposals: []`" rule; the two codes, messages and params; the other BOMs on the same data; no proposal for an output with only inactive-component BOMs; and the old image's fallback message.
    - `.ai/docs/engineering-standards.md`, MRP bullets:
      - `chooseBom` is the only BOM choice, and `isUsableRevision` the only eligibility rule;
      - feasibility reads `lowestDependableBalance` and never counts provisional needs;
      - a level's proposals claim in E16-S02's order, and a higher level claims first (Q12).
    - `CPG-acceptance.md`: the Evidence lines of MRP-024, MRP-025, MRP-041, MRP-046, MRP-050, BOM-010, LFC-026 and the MRP halves of LFC-025 and PRD-002, citing the tests. BOM-011 and MRP-026 stay partial: their provisional and automatic halves are E17-S03, E18-S03 and E19-S03. A status moves only when every clause, channel included, is asserted (lesson 2026-10-21).
    - Move this spec to `implemented/` with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

- **Implementation PR** #329, from `main`. The spec PR #328 stays design-only.
- **Availability.** `lowestDependableBalances(ledger, excluded)` returns each day's lowest balance to the horizon's end in one backward pass. `planMrp` caches it per component pair, and drops the cache only when a feasible choice claims from that component. A provisional need is added to the component's demand and to its exclusion alike, so it leaves the cache valid. Without the cache, every candidate line cost a 90-day walk.
- **Candidates.** `validBoms(boms, date)` (`choose-bom.ts`) is the one candidate order, by priority then BOM code. `chooseBom` and Missing Usable BOM's `inactive` list both use it.
- **The run yields after `planMrp` and after its deletes.** The worst-case benchmark found the engine, the deletes of the previous run's rows (now about 18,000 more exception rows) and the run's insert running as one synchronous stretch on better-sqlite3 (lesson 2026-10-24). Two `yieldToEventLoop` calls split it.
- **Benchmark** (`mrp-run-timing.test.ts`, fastest of three, run locally). Every top-level output has a second, priority-2 BOM.

  | Run | `main` stall | This PR stall | `main` `planMrp` | This PR `planMrp` | Exception and warning rows |
  | --- | --- | --- | --- | --- | --- |
  | Realistic | 33 ms | 33 ms | 6 ms | 7 ms | 454 → 781 |
  | Ten times | 134 ms | 97 ms | 56 ms | 69 ms | 9,389 → 11,712 |
  | Worst case, ten times | 213 ms | 171 ms | 134 ms | 162 ms | 9,497 → 27,466 |

  Runs take 251 ms realistic and 2,673 ms at ten times, under the unchanged 1,000 ms and 5,000 ms budgets.
- **Benchmark finding, for the owner (Q1).** In the fixture every material also has its own forecast and orders, so each component's dependable balance falls below zero later in the horizon. Under Q1's lowest-balance rule **no** Make proposal is feasible: all 327 (realistic) and 2,323 (ten times) are provisional, and none falls back. The test asserts that. On data where components are only consumed by production, the rule behaves as the criteria describe. Where components also carry independent demand that existing supply doesn't cover, it marks every new production provisional. Changing the window, for example to the component's own lead time, is a change to `lowestDependableBalances` only.
- **Changed expectations.** #281's explosion tests had no component stock, so their parents are now provisional. They assert `provisional: true` and the `NO_FEASIBLE_BOM` rows rather than empty exception lists. The integration test of the three levels lists F's and I's `NO_FEASIBLE_BOM` with their `missing`. #281's inactive-component fallback test is replaced by the Missing Usable BOM tests.
- **Acceptance.** `mrp-acceptance.service.test.ts` accepts the requisition a provisional parent's need drives: the replan repeats the choice.
- **Integration.** Docker was unavailable locally, so the files ran against a standalone build (lesson 2026-10-23). `mrp-run-api` passed (15 tests). `mrp-accept`, `mrp-accept-api`, `mrp-report`, `mrp-report-api`, `mrp-run` and `production-orders` passed (38 tests).

