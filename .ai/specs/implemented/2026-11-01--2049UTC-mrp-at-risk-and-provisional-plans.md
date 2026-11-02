# MRP at-risk production and provisional plans: an open order pinning an inactive component is at-risk supply that blocks its demand, and an infeasible parent's whole hypothetical chain is a provisional plan, never supply

**Status:** implemented. The inactive materials come from `readCodes`, and a provisional action's components are listed by material code (Implementation notes).
**Created:** 2026-11-01 20:49 UTC
**Issue:** #283 (E17-S03, epic #269) · **Depends on:** BOM choice (`implemented/2026-11-01--1918UTC-mrp-bom-choice.md`, #282), BOM explosion (`implemented/2026-11-01--1107UTC-mrp-bom-explosion.md`, #281), production and transfer supply (`implemented/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`, #277), all merged · **Design authority:** `.ai/specs/product-brief.md` (R03, R10, D04, N04), `research/CPG-prd001.pdf` §04 "Supply pipeline and overdue", "Multilevel explosion", "Reruns and duplicate avoidance", `research/CPG-acceptance.md` MRP-026, MRP-027, MRP-047, MRP-051, LFC-027, BOM-011

## 📝 TLDR

Two gaps remain after E17-S02. An open production order whose pinned revision has a component deactivated later (allowed by E10-S05) is still counted as dependable output, although it can't be completed as planned. And a Make proposal no BOM can supply (No Feasible BOM) is stored and listed like an executable proposal, its receipt covers the parent's shortage in `projectedAfter`, and the intermediate proposals its needs drive look executable too.

After this change:

- Such an order is **at risk**. It stays unchanged. Its unproduced balance moves from dependable to **at-risk supply** (the `atRiskSupply` figure, zero until now), it is out of every balance and feasibility test, and its inactive components get no demand from it. The run raises **`AT_RISK_PRODUCTION`** on it. The demand that balance was to cover is **blocked**: it stays a visible shortage, and MRP proposes no replacement for it until the user closes or cancels the order or reactivates the component.
- Every Make action that can't execute is a **provisional action** in a list of its own, never a proposal. That is a proposal no BOM can supply, or one sized only for a provisional parent's need. Each lists its quantity, dates, BOM, component quantities and blockers. Its output is never in a balance, so the shortage it was meant to cover stays visible. Requisitions are never provisional, so the purchased level of the chain stays executable.

## 📝 Problem Statement

- **At-risk supply is counted as dependable.** `productionMovements` (`domain/mrp/supply/production-orders.ts`) books every open order's remainder as `dependableSupply`, whatever its pinned lines hold. With R deactivated after F's order pinned a revision using it (LFC-015, LFC-027), F's projection counts output that can't be produced. A higher parent's BOM choice relies on it (E17-S02 Q1), and the order's need for inactive R is still demand on R, which can get a requisition proposal for a material nobody may buy. MRP-051's "Not executed" status says it.
- **A provisional proposal looks executable.** E17-S02 keeps an infeasible proposal (Q4) in `proposals`, stored in `mrp_recommendation` like a feasible one. Its receipt counts in its own pair's `proposedReceipts`, so `projectedAfter` hides the shortage it can't cover. Its interim limit (E17-S02 Q4, comment on #283) is also live: an intermediate proposal that exists only because of a provisional parent's need is sized, tested and claims like a real one. MRP-047 is "Not executed". MRP-026 and MRP-027 are partial on this half.

## Resolved assumptions (autonomous defaults)

The issue's two open questions, plus the gaps between its notes and the shipped engine, each answered with the most reversible choice. **There is no schema change:** at-risk orders and provisional actions are stored in `mrp_run_exception`, as E18-S02's warnings are. The contract change is one new exception code, a new `provisional` list per plan, and the provisional proposals leaving `proposals`.

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Do an at-risk order's active components still count as dependent demand on its start day (issue open question 1)? | **Yes**: the order is kept unchanged (R10), so its commitment stays in its active components' projections, as today. Its **inactive** components get **no** demand from it, so they get no proposal from it (as in LFC-026). | It is the issue's proposal. Leaving the inactive need in would make R short and, with a Buy set, propose a requisition for an inactive material. A deactivation is only allowed with no stock, transit or unfinished direct R document, so there is nothing to net it against. |
| Q2 | How much demand is blocked rather than replanned (issue open question 2)? | **The at-risk unproduced balance.** Sizing reads each day's balance with every at-risk output up to that day added back, so no proposal replaces it. The projection doesn't count it, so the shortage stays visible before and after proposals. Demand beyond it is planned normally, through the pair's usable BOMs. When the order's inactive component is in every BOM valid on that proposal's finish (the common LFC-027 case: the order pins the current revision), that excess raises Missing Usable BOM, as E17-S02 decided, and the pair keeps no proposal. | It is the issue's proposal, and the PRD's "no duplicate F auto-order until user resolves existing order" (MRP-051). It changes one input of `replenishPair`, never the balances stored. |
| Q3 | When is an order at risk? | An **open** order with an unproduced balance (`outstandingMicro`) whose pinned revision has **any inactive component**, read like `MrpBom.inactiveComponents` (E17-S02). Only that balance is at risk. Output already posted is physical stock (PRD §04 "Supply pipeline and overdue"). An inactive output material or BOM doesn't make it at risk. | The issue's criteria and MRP-051 name the component only. An inactive BOM doesn't stop a pinned order (E10-S05). |
| Q4 | What does the run record for an at-risk order? | One **`AT_RISK_PRODUCTION`** exception per order whose output lands inside the horizon, at its output pair, dated at its own `plannedFinish`, with `order`, `quantity` (the at-risk balance) and `inactiveComponents` (component codes, in code order, comma-separated). Its output counts on that day's `atRiskSupply`, today when overdue. An order finishing after day 89 names no pair and blocks nothing inside the horizon (#277's day rule), so it raises nothing, as its dependable output was in no bucket either. A material with an unreadable row reports none, like Insufficient Transfer Stock (#316). It stops nothing else: the pair keeps its proposals for the demand beyond it. | It is the issue's flag, one per order like Insufficient Transfer Stock's per transfer, with the figures a client needs to resolve it. No new column: `mrp_run_exception` takes any code (#280 Q6). An overdue at-risk order gets no Overdue Supply warning, which is for supply the plan counts. |
| Q5 | Which Make actions are provisional? | Two kinds, both in **`MrpResult.provisional`** and never in `proposals`: a proposal sized for real demand that no usable BOM can supply (blocker `no-feasible-bom`, its `NO_FEASIBLE_BOM` exception as today), and one **sized only for provisional demand** (blocker `provisional-demand`, plus `no-feasible-bom` when its own BOM can't be supplied either). `NO_FEASIBLE_BOM` is raised for the first kind only. The second kind carries its own `missing` and `inactive` (the exception's notation) on the action, so one pair never gets two `NO_FEASIBLE_BOM` rows on one date. Every provisional action with the `no-feasible-bom` blocker carries them. Every component need of a provisional action is provisional, so the mark carries down the chain. **A requisition is never provisional**: a Buy pair is sized on all its demand, provisional included, and its requisitions stay executable. | It is MRP-047's "only feasible R PR may be executable" and the comment on #283 (carry the mark down). Buying a raw material a hypothetical chain needs is a real action. Making an intermediate for a parent that can't run isn't. |
| Q6 | How is a Make pair sized with and without its provisional demand? | **Twice, in `replenishPair`.** The executable sizing reads the balance without the pair's provisional dependent demand. The provisional sizing reads the full balance with every executable-sizing proposal carried in from its need date, so it covers only what the provisional needs add. Both apply Q2's at-risk add-back and the same lot rules and timing. The exception rules (Missing Planning Parameters, Missing BOM, Missing Usable BOM, …) read the full balance and both lists, as today. So a pair needed only provisionally still raises Missing Planning Parameters when it has no set. | The comment on #283 says carrying the mark down "needs each pair sized with and without its provisional demand". Carrying the executable proposals into the second sizing keeps them unchanged and lists each provisional need once, never again on each later day of the same shortage. |
| Q7 | Does a provisional action choose a BOM and claim components? | It **chooses** through `chooseBom`, after every executable proposal of its level has claimed, so its BOM and blockers are explained. It **never claims**: its needs go into the components' dependent demand and `provisionalOf`, like E17-S02's provisional needs. Its receipt is **never** in `proposedReceipts`, so no balance and no feasibility test counts its output. | It is the issue's "never netted as supply" and "does not make another action feasible in the same run". A hypothetical order taking real components would undercut feasible choices. |
| Q8 | Where are provisional actions stored? | In **`mrp_run_exception`**, after the warnings, code **`PROVISIONAL_PRODUCTION`**, `date` = need date, `details`: `quantity`, `leadTimeDays`, `bom`, `bomRevision`, `components` (`00000011 6.000000, 00000012 3.000000`), `blockers` (`no-feasible-bom,provisional-demand`). The read lists them in the plan's `provisional`, never among its exceptions, as E18-S02 did for warnings. **They are no longer stored in `mrp_recommendation`**, so nothing can accept one. | No migration, and the accept endpoint can't reach them by construction. The issue's own note proposed a kind column only "if the stored recommendation can't tell them apart". Moving them out answers that with no column. The table is already covered by `tests/tenant-ownership.test.ts` and the Test reset. |
| Q9 | Integration test? | Two cases in `tests/integration/mrp-run-api.test.ts`, each with its own materials. **Provisional chain.** F (Make) needs I (Make), I needs R (Buy), with no stock and a customer order of F. The latest run lists F's and I's provisional actions with their components and blockers, and only R's requisition in `proposals`. **At risk.** G (Make) has one BOM needing raw S. An open G order of 10 pins it, S is deactivated through the materials API, and a customer order of 10 G is due after the order's finish. The run lists `AT_RISK_PRODUCTION` for G, G's `atRiskSupply` on the order's finish day, a shortage after proposals, and no G proposal. The demand equals the order, so no excess raises Missing Usable BOM. | The production image is the only proof that the new list, code and figure reach a client. The rerun criteria (cancel, reactivate) are proved in the service test, against a real SQLite file. |

The issue's Q05 (the showcase) doesn't bear on this design.

## 📝 Proposed Solution

```
domain/mrp/
  mrp-inputs.ts                MrpProductionOrder + inactiveComponents (codes)
  mrp-result.ts                MrpResult + provisional; MrpPlan + atRiskOutput; + MrpProvisionalAction,
                               MrpProvisionalBlocker; + MrpAtRiskProduction in MrpException
  supply/production-orders.ts  an at-risk order's output → atRisk, its active lines only → components
  sizing/sizing-balance.ts     sizingBuckets(buckets, provisional, carried) (new)
  sizing/replenish-pair.ts     + provisional: TimedProposal[], sized as Q6
  plan-mrp.ts                  at-risk output → atRiskSupply; per level: executable makes claim, infeasible ones
                               and provisional makes go to `provisional`, never to proposedReceipts
  exceptions/codes.ts          + AT_RISK_PRODUCTION, its message and rank
  exceptions/compare-exceptions.ts  ties broken by transfer, then order
  exceptions/stored-exception.ts    + AT_RISK_PRODUCTION → details { order, quantity, inactiveComponents }
  provisional/stored-provisional.ts  toStoredProvisional, isMrpProvisionalCode, the read's parser (new)
services/mrp/
  snapshot/production-orders.ts  the pinned revision's inactive component codes
  snapshot/inactive-materials.ts one read of the tenant's inactive materials, shared with readBoms (new)
  mrp-run.service.ts           write `provisional` after warnings; read it into each plan's `provisional`
  mrp-run-view.ts              MrpPlanView + provisional: MrpProvisionalView[]
```

**Alternatives considered.**
- *A `provisional` column on `mrp_recommendation`.* A migration, a unique key `(run, material, location, needDate)` that one pair's executable and provisional actions on the same day would break, and an accept endpoint that would have to refuse it (E19-S01). Storing them apart avoids all three (Q8).
- *Size a Make pair once and mark the proposals its provisional demand caused.* A lot-sized proposal can cover real and provisional demand at once, so no rule splits it. Sizing twice does (Q6).
- *Leave an at-risk order's output dependable and only flag it.* MRP-051 and LFC-027 require excluding it from dependable planning.
- *Drop an at-risk order's demand cover and let MRP replan.* That would silently replace an existing order (LFC-027's "never silently auto-replaces it"), contrary to R10's spirit (Q2).
- *Store the at-risk order as a warning.* A warning "stops nothing", and this blocks a replacement. It is an exception the planner must act on.

## 📝 Architecture

### Inputs: `MrpProductionOrder.inactiveComponents`

The codes of the pinned revision's inactive component materials, in code order, empty when all are active. `readInactiveMaterials(em)` reads the tenant's inactive material IDs once (the read `readBoms` does today). `readProductionOrders` and `readBoms` both take its set, so the snapshot gains no read. An unreadable line's material counts too: the order is at risk whatever its other lines.

### Supply: `supply/production-orders.ts`

`productionMovements` returns `{ output, atRisk, components }`. An order with an `inactiveComponents` entry puts its remainder in `atRisk` (the same `MrpProductionOutput` shape, the same day rule) instead of `output`. Its components are its lines whose material isn't in `inactiveComponents` (Q1). Every other order is unchanged.

### The figure and the exception: `plan-mrp.ts`

- Each `atRisk` item adds to its day's `atRiskSupply` and to the pair's new `atRiskOutput` list. `projectBuckets` and `dependableChange` already leave `atRiskSupply` out, so no balance, Missing Parameters date or feasibility test counts it.
- Each `atRisk` item of a readable material raises `{ code: "AT_RISK_PRODUCTION", material, location, date: plannedFinish, order, quantity, inactiveComponents }`, so only orders whose output lands inside the horizon raise it (Q4).

### Sizing balance: `sizing/sizing-balance.ts`

```ts
/**
 * The balance sizing reads (E17-S03): each day's `projectedBefore`, plus every at-risk output up to that
 * day (blocked demand, Q2), plus the pair's provisional dependent demand up to that day when `provisional`
 * is given (`projectedBefore` already subtracts it, so adding it back sizes without it), plus every
 * `carried` proposal whose need date is on or before that day (Q6).
 */
export function sizingBuckets(buckets, provisional: readonly bigint[] | null, carried: readonly Pick<SizedProposal, "needDate" | "quantity">[]): SizedPair["buckets"]
```

### Two sizings: `sizing/replenish-pair.ts`

`replenishPair(pair, context)` gains `context.provisional`, the pair's provisional dependent demand by day, and returns `{ proposals, provisional, exception }`:

- The exception rules 1 to 6 are unchanged. `firstNeed` reads `sizingBuckets(buckets, null, [])`, the full balance with blocked demand added back.
- A Buy pair is sized once on that balance. Its `provisional` is empty (Q5).
- A Make pair is sized on `sizingBuckets(buckets, provisional, [])` (executable), then on `sizingBuckets(buckets, null, executable)` (provisional). Both lists are timed by `scheduleProposal`. Rules 5 and 6 (Missing BOM, Missing Usable BOM) test the proposals of both lists, so a provisional need for a material no usable BOM can make still stops the pair.

### The level loop: `plan-mrp.ts`

```ts
for (const level of byLevel) {
  const sized = level.sort(comparePairs).map((draft) => ({ draft, replenished: replenishPair(…, { …, provisional: provisionalOf.get(key) ?? noProvisional }) }));
  // Requisitions: as today, receipts booked. Executable makes: claim in Q5's order (unchanged).
  for (const proposal of makes) {
    const choice = chooseBom(…);
    if (choice.feasible) { book its receipt; proposals.push(…); explode, claiming; }
    else { provisional.push({ …proposal, bom, bomRevision, components, blockers: ["no-feasible-bom"], rejectedBoms }); explode provisionally; NO_FEASIBLE_BOM as today; }
  }
  // Provisional makes, in the same order, after every claim of the level: choose, explode provisionally, never book.
  for (const proposal of provisionalMakes) {
    const choice = chooseBom(…);
    provisional.push({ …, blockers: choice.feasible ? ["provisional-demand"] : ["no-feasible-bom", "provisional-demand"], rejectedBoms }); // no exception (Q5)
  }
  // Exceptions, projection, ranking: unchanged.
}
```

- A proposal's receipt is booked in `proposedReceipts` only once it is known to be executable: a requisition, or a feasible Make proposal. A provisional action's receipt is never booked (Q7).
- `explodeProposal(proposal, bom, true)` gives each provisional action's `components`, the same items its components' `plannedComponentDemand` get.
- `MrpResult.provisional` is sorted like proposals (pair, then need date), then a `no-feasible-bom`-only action before a `provisional-demand` one on the same day.
- **Determinism and cost.** Both orders are total. A Make pair with provisional demand is sized twice, and each provisional action costs one `chooseBom`. At #282's ten-times benchmark, where every Make proposal was provisional, that is at most twice the sizing. `mrp-run-timing.test.ts` measures it.

### Exceptions and storage

- `MRP_EXCEPTION_CODES` gains `AT_RISK_PRODUCTION` after `NO_FEASIBLE_BOM`. Message: "An open production order of this material pins a BOM revision with an inactive component, so its unproduced output is at risk: MRP doesn't count it as supply, and proposes no replacement for the demand it was to cover until the order is closed or cancelled or the component is reactivated." `compareExceptions` breaks a tie on the transfer, then on the order, so two at-risk orders finishing on one day keep a total order.
- `toStoredException`: `date` = `plannedFinish`, `details` = `{ order, quantity, inactiveComponents }`, the quantity as a six-decimal text, the components joined with `, `. The name differs from `inactive`, whose notation names BOMs.
- `toStoredProvisional(action)`: `{ code: "PROVISIONAL_PRODUCTION", material, location, date: needDate, details: { quantity, leadTimeDays, bom, bomRevision, components, blockers, missing?, inactive? } }`, `missing` and `inactive` in `NO_FEASIBLE_BOM`'s notation, given with the `no-feasible-bom` blocker. The run writes these after its warnings, so each exception and warning keeps the position it had. `isMrpProvisionalCode` keeps them out of the read's exceptions and warnings.

## 📝 Data Model

No change. `MrpDailyResult.atRiskSupply` (#273) gets its first non-zero values. `MrpRunException` stores `AT_RISK_PRODUCTION` and `PROVISIONAL_PRODUCTION` in its existing columns (`exceptionCode` is a plain string, #280 Q6). `MrpRecommendation` now holds executable proposals only: requisitions and feasible Make proposals.

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest`. Each plan gains `provisional`, its provisional actions by need date:

```json
{ "kind": "production-order", "needDate": "2026-11-05", "quantity": "6.000000",
  "plannedStart": "2026-11-03", "plannedFinish": "2026-11-05", "lateDays": 0, "beyondHorizon": false,
  "bom": "00000004", "bomRevision": 1,
  "components": [{ "material": "00000011", "quantity": "6.000000" }],
  "blockers": ["no-feasible-bom", "provisional-demand"],
  "missing": "00000004/1: 00000011 6.000000 0.000000 6.000000" }
```

On the same data:

- A plan's `proposals` no longer list a Make proposal no usable BOM can supply. It is in `provisional` with the blocker `no-feasible-bom`, and its `NO_FEASIBLE_BOM` exception is unchanged. Its receipt is no longer in `proposedReceipts` or `projectedAfter`, so the shortage it was to cover shows after proposals.
- A Make pair whose demand is partly provisional lists the provisional part in `provisional` (`provisional-demand`), and only its executable part in `proposals`. Such an action raises no `NO_FEASIBLE_BOM`, even when its own BOM can't be supplied: its `missing` says so (Q5). Before, an intermediate proposal driven by a provisional parent raised one.
- The provisional demand stays in the component's projection, so a Make component's `projectedAfter` shows the shortage no executable action covers, and the shortage ranking lists it. A Buy component's requisition covers it.
- `atRiskSupply` may be above zero. That output is not in `dependableSupply`, and `projectedBefore` and `projectedAfter` don't count it.
- `plans[].exceptions` may carry `AT_RISK_PRODUCTION`. `params`: `material`, `location`, `date` (the order's planned finish), `order`, `quantity`, `inactiveComponents`. Like `NO_FEASIBLE_BOM` and `INSUFFICIENT_TRANSFER_STOCK`, it keeps the plan's proposals for demand beyond the at-risk quantity.

The accept endpoint is unchanged, and a provisional action has no `id` to accept.

## 📝 UI/UX

No screen change: the report's day table already shows `atRiskSupply`, and showing at-risk orders and provisional plans is E18-S03. The report's Proposals table loses the provisional rows it showed until now, and with them their Late Supply and Beyond Horizon marks, which `planMarks` builds from stored proposals. The help topic (`app/src/help/topics.ts`, the MRP topic, EN and PL) replaces the sentence "When no usable BOM can be supplied, the proposal still plans its components through the highest-priority usable BOM, and it gets a no feasible BOM exception listing each BOM's missing components." with:

- EN: "When no usable BOM can be supplied, the run doesn't propose that production. It makes a provisional plan instead: the production it would need, with its quantities, dates and components, through the highest-priority usable BOM, and a no feasible BOM exception listing each BOM's missing components. The components' own production for that plan is provisional too. Purchase requisitions for what it needs are still proposed. A provisional plan's output is never counted in a balance, so the shortage stays visible. An open production order whose BOM has a component deactivated after it was created is at risk: its remaining output is shown apart and not counted, the run raises an at-risk production exception, and no replacement is proposed for the demand it was to cover until the order is closed or cancelled or the component is reactivated."
- PL: "Gdy żadnego używalnego BOM-u nie da się dostarczyć, przebieg nie proponuje tej produkcji. Tworzy zamiast niej plan tymczasowy: potrzebną produkcję z ilościami, datami i składnikami według używalnego BOM-u o najwyższym priorytecie oraz wyjątek braku wykonalnego BOM-u, wymieniający brakujące składniki każdego BOM-u. Produkcja składników na potrzeby tego planu też jest tymczasowa. Zapotrzebowania zakupowe na to, czego plan potrzebuje, są nadal proponowane. Produkcja z planu tymczasowego nigdy nie liczy się w stanie, więc brak pozostaje widoczny. Otwarte zlecenie produkcyjne, którego BOM ma składnik zdezaktywowany po utworzeniu zlecenia, jest zagrożone: jego pozostała produkcja jest pokazana osobno i nie jest liczona, przebieg zgłasza wyjątek zagrożonej produkcji, a dla zapotrzebowania, które miało pokryć, nie jest proponowane zastępstwo, dopóki zlecenie nie zostanie zamknięte lub anulowane albo składnik ponownie aktywowany."

The glossary guards apply (BOM, not recipe). Prototype: none.

## 📝 Edge Cases & Failure Scenarios

- **An at-risk order partly completed:** only `quantity − produced − abandoned` is at risk. Posted output is physical stock.
- **An at-risk order overdue:** its output counts on today's `atRiskSupply`, with no Overdue Supply warning, and its exception keeps its own `plannedFinish`.
- **An at-risk order finishing after the horizon:** no bucket, no blocking and no exception inside the horizon, as its output named no pair before (Q4).
- **The order is cancelled, closed, or the component reactivated:** the next run reads no at-risk order. In the first two cases the demand is planned again: a replacement proposal through a usable BOM, or Missing Usable BOM when every valid BOM still has the inactive component. In the third the output is dependable again (PRD §04 "Reruns and duplicate avoidance").
- **At-risk F is a component of G:** F's at-risk output is out of F's dependable balance, so G's BOM test can't rely on it.
- **Demand beyond the at-risk quantity:** planned normally, through an executable proposal when a usable BOM can supply it.
- **A provisional chain three levels deep:** F (no-feasible-bom) → I (provisional-demand, maybe no-feasible-bom) → J (provisional-demand) → R (requisition, executable).
- **A pair with real and provisional demand on one day:** an executable proposal for the real part and a provisional action for the rest, both with that need date. They are stored apart, so no key clashes.
- **A provisional-only Make pair with no planning parameters:** Missing Planning Parameters, `no-set`, as today, dated at its first provisional need (Q6).
- **A provisional action whose BOM is feasible:** blocker `provisional-demand` only. It still claims nothing, so a later executable proposal isn't undercut.
- **An old image during a deploy:** it lists a stored `AT_RISK_PRODUCTION` or `PROVISIONAL_PRODUCTION` row among the plan's exceptions with the fallback message (#280 Q7). A run it writes stores provisional proposals in `mrp_recommendation` again until the next new run. Only the latest run is kept, so the next run makes the data consistent again.

## 📝 Risks & Impact Review

- **Contract:** provisional Make proposals leave `proposals` for the new `provisional` list. `projectedAfter` no longer counts them, and `atRiskSupply` gets real values. There is one new exception code, and one stored row code that the read never lists as an exception. `BACKWARD_COMPATIBILITY.md` gains the entry. It amends E16-S03's "A plan with any exception but `INSUFFICIENT_TRANSFER_STOCK` has `proposals: []`" (now also `AT_RISK_PRODUCTION`), E17-S02's "such a proposal names the highest-priority usable BOM … Its receipt still counts in `projectedAfter` until E17-S03", and the `NO_FEASIBLE_BOM` row that an intermediate driven by a provisional parent no longer raises. It also records the provisional rows' lost marks.
- **Product behaviour:** a Make pair now proposes only what it can make. On the Test dataset, where #282 found most Make proposals provisional, the Proposals table will list far fewer production rows, and more shortages show after proposals. That is the intended honesty, not a regression, and the PR explains it.
- **Seam rule:** this story edits `production-orders.ts`, `replenish-pair.ts` and `plan-mrp.ts`, the files #281 and #282 last changed. Many tests assert a provisional proposal in `proposals` or its receipt in `projectedAfter`. Each changed expectation asserts the provisional action instead, and the PR explains which. The timing test counts rows by code, never by exclusion (lesson 2026-11-01).
- **Performance:** no new read (the inactive materials read is shared). The engine sizes some Make pairs twice. `mrp-run-timing.test.ts` runs under its unchanged budgets and prints the provisional action count beside the timings.
- **Rollback:** reverting the image restores the old behaviour at the next run. Stored rows of the new codes show with the fallback message until then.

## 📝 Decisions in play

This design honours, and supersedes none of:

- R03: quantities are exact six-decimal base-unit decimals, and component needs are rounded up once.
- R10: no document is written or rewritten. An at-risk order is kept as it is.
- D04: the simplest consistent behaviour for Q1 to Q8.
- N04: no reservation. A claim lives only inside one run's plan.

No assumption needs the owner's confirmation before merge.

## 📋 Phasing

One phase, one implementation PR, as the issue scopes it. The two halves could ship apart, but they meet in `replenishPair`'s sizing balance and the level loop, and their tests share fixtures, so one PR avoids a second seam (lesson 2026-11-01, "Two features merged together need a check at their seam"). Showing both is E18-S03, and refusing provisional actions in acceptance and the automatic batch is E19-S01 and E19-S03.

## 📋 Implementation Plan

1. **Inputs.** `readInactiveMaterials` (one read, shared). `MrpProductionOrder.inactiveComponents` filled by `readProductionOrders`, and `readBoms` takes the shared set. Update every `MrpProductionOrder` fixture. The snapshot test asserts an order pinning two inactive lines, in code order, and one with none.
2. **Types and codes.** `MrpProvisionalAction`, `MrpProvisionalBlocker`, `MrpAtRiskProduction`, `MrpResult.provisional`, `MrpPlan.atRiskOutput`. `AT_RISK_PRODUCTION` in `codes.ts` with its message and rank (and the header comment's list of codes that keep proposals), in `toStoredException`, and the order tie in `compareExceptions`. `toStoredProvisional` and `isMrpProvisionalCode`. Tests: the code order, the message, the stored shapes, and the tie.
3. **At-risk supply.** `productionMovements`' `atRisk` list and active-only components. `planMrp` books `atRiskSupply` and `atRiskOutput`, and raises the exception (Q4). Tests, asserting `planMrp`'s result:
   - MRP-051: F's order pins R, which is inactive. The order's balance is in `atRiskSupply`, not `dependableSupply`, F's shortage shows before and after proposals, there is no F proposal for that quantity, and `AT_RISK_PRODUCTION` names the order. F's demand equals the order's balance, so no excess reaches rule 6.
   - Q2: with a second, usable F BOM (no R), demand beyond the at-risk balance gets a proposal for the excess only. With R in every valid BOM, the excess raises Missing Usable BOM.
   - Partly completed: only the unproduced balance is at risk.
   - Q1: the order's active component keeps its demand, and inactive R gets none, so R gets no requisition proposal.
   - F as G's component: G's BOM choice can't rely on F's at-risk output.
   - Rerun: the same data with the order cancelled proposes the replacement through the usable BOM, and with R active counts the output as dependable.
   - An unreadable material raises no `AT_RISK_PRODUCTION`. An overdue at-risk order counts today, with no Overdue Supply warning.
4. **Sizing.** `sizingBuckets` with tests for the at-risk add-back, the provisional removal and the carried proposals. `replenishPair`'s two sizings, with tests:
   - a Make pair with real and provisional demand gets an executable proposal and a provisional one;
   - a Buy pair is sized once on all its demand;
   - a provisional-only pair without a set raises Missing Planning Parameters;
   - Missing BOM covers a provisional proposal.
5. **The level loop.** `planMrp`, as in Architecture. Tests, one per criterion:
   - MRP-047: F needs I, I needs R, all stock and receipts zero, R Buy. `provisional` lists F (`no-feasible-bom`) and I (`no-feasible-bom`, `provisional-demand`) with their quantities, dates and components down to R. `proposals` holds only R's requisition. No `proposedReceipts` or `projectedAfter` of F or I counts them.
   - Issue criterion 6: F's provisional plan doesn't suppress F's shortage, doesn't make another proposal feasible, and is listed once per need, not on each later day of the shortage.
   - MRP-026 (updated from #282): a lower-level proposal for I's own demand is executable, and the part of I's need driven by F is provisional.
   - A provisional action with a feasible BOM claims nothing: a later executable proposal on the same component keeps its BOM.
   - The shuffled-snapshot test covers `provisional` and `atRiskSupply`.
   - The #281 and #282 tests that asserted a provisional proposal in `proposals`, or its receipt in `projectedAfter`, assert the provisional action instead.
6. **Service and storage.** `mrp-run.service.ts` writes provisional rows after warnings and reads them into `provisional`. The read keeps them out of exceptions and warnings. `mrp-run-view.ts` gains `MrpProvisionalView`. In `mrp-run.service.test.ts`, against a real SQLite file:
   - LFC-027 and MRP-051: deactivate R through `MaterialService` after F's order pinned it, as `production-order.service.test.ts`'s LFC-015 case does. Run, and assert the order unchanged (BOM, revision, quantity, status, version), the stored `AT_RISK_PRODUCTION` row and its params, and F's stored `atRiskSupply`.
   - Rerun: give F a second, usable BOM first. Cancel the order, run, and a replacement F proposal is stored. Reactivate R instead, run, and the output is dependable again.
   - MRP-047: the stored provisional rows, their view, and no `mrp_recommendation` row for F or I.
   - In `mrp-acceptance.service.test.ts`, the requisition a provisional chain drives can still be accepted.
7. **Benchmark.** `mrp-run-timing.test.ts` under the unchanged budgets, printing provisional actions and at-risk orders beside the timings. It counts rows by code. The figures go in the PR.
8. **Integration test.** The Q9 case in `tests/integration/mrp-run-api.test.ts`. Run `npm run test:integration -- tests/integration/mrp-run-api.test.ts`, and the integration files of the screens whose figures move (`mrp-report`, `mrp-report-api`, `mrp-accept`, `mrp-accept-api`).
9. **Copy, docs, catalogue.**
   - The help sentence in EN and PL (UI/UX), and the `topics.test.ts` assertions it moves.
   - `isExecutableProposal`'s doc comment: provisional actions are no longer stored as proposals. The Make half of E19-S01 still waits on its own story.
   - `BACKWARD_COMPATIBILITY.md` (Risks).
   - `.ai/docs/engineering-standards.md`, MRP bullets:
     - `atRiskSupply` is never counted;
     - a Make pair is sized with and without its provisional demand;
     - a provisional action never books a receipt or claims a component.
   - `CPG-acceptance.md`: MRP-047 and MRP-051 to Partially verified (the screen is E18-S03). Add evidence to MRP-026, MRP-027, BOM-011 and LFC-027, whose screen and automatic-batch halves stay open.
   - Move this spec to `implemented/` with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

- **Implementation PR** #331, from `main`. The spec PR #330 stays design-only.
- **Inputs.** `readCodes` already reads every material, so it now reads `active` too and returns `inactiveMaterials`. `readBoms` and `readProductionOrders` share that set, so the snapshot loses one read rather than gaining a `readInactiveMaterials` file.
- **Polish help terms.** The PL copy says "zdezaktywowany" and "ponownie aktywowany", the UI's own terms, where the spec draft said "wyłączony" and "ponownie włączony" (one term per concept).
- **Components by code.** A provisional action lists its components by material code, not line order, so the result depends on the snapshot's content only (the shuffled-snapshot test reverses BOM lines).
- **One sizing when there is nothing provisional.** `replenishPair` takes `provisional: null` for a pair without provisional demand and sizes it once. `sizingBuckets` returns the days themselves when nothing is added. Most pairs take that path.
- **Changed expectations.** #281's and #282's tests that listed a provisional proposal in `proposals`, or its receipt in `projectedAfter`, now assert the provisional action, its blockers and the shortage after proposals. An intermediate driven by a provisional parent no longer raises its own `NO_FEASIBLE_BOM` (Q5), so the three-level tests list F's only. Tests that needed a feasible Make proposal (the Buy-and-Make storage test, the acceptance refusal, the page's BOM line) now stock the component.
- **Benchmark** (`mrp-run-timing.test.ts`, fastest of three, run locally). The fixture gives each bottom-third revision, which only production orders pin, a fifth line of a retired material, so 10 orders are at risk in the realistic run and 100 at ten times. The `main` figures come from `main`'s source and fixture on the same machine, the same hour.

  | Run | `main` stall | This PR stall | `main` `planMrp` | This PR `planMrp` |
  | --- | --- | --- | --- | --- |
  | Realistic | 33 ms | 33 ms | 6 ms | 6 ms |
  | Ten times | 76 ms | 78 ms | 63 ms | 67 ms |
  | Worst case, ten times | 164 ms | 236 ms | 163 ms | 212 ms |

  The worst case adds daily demand to every material, so every Make proposal is provisional. The middle third then plans an executable and a provisional action for each day where `main` merged them into one proposal, about a third more Make actions (Q6's cost). It stays under the 250 ms stall budget. Runs take 243 ms realistic and 2,573 ms at ten times, under the unchanged 1,000 ms and 5,000 ms budgets. At ten times, 2,872 provisional actions, 958 of them for a provisional parent.

