# MRP proposal timing and demand priority: calendar-day back-scheduling, Late Supply, Beyond Horizon, and customer orders before forecast before safety stock

**Status:** implemented. Two defaults await the owner's confirmation (Q2, Q4); either answer only adds work.
**Created:** 2026-11-01 07:38 UTC
**Issue:** #279 (E16-S02, epic #268) · **Depends on:** the MRP engine (`implemented/2026-10-27--0525UTC-mrp-engine-projection.md`, #273), MRP runs (`implemented/2026-10-27--0556UTC-mrp-runs.md`, #274), MRP demand (`implemented/2026-10-31--0902UTC-mrp-forecast-safety-demand.md`, #275), production and transfer supply (`implemented/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`, #277), replenishment proposals (`implemented/2026-10-31--2054UTC-mrp-replenishment-proposals.md`, #278), all merged · **Design authority:** `.ai/specs/product-brief.md` (R03, R10, D04, D08, N04), `research/CPG-prd001.pdf` §04 "Overdue demand and priority", "Component timing and execution", "Overdue and late starts" and the closure defaults, `research/CPG-prd-datamodel.pdf` ("MRP run", "MRP recommendation / exception"), `research/CPG-acceptance.md` MAT-018, MRP-004, MRP-037, MRP-038, MRP-044, MRP-049, DEM-018 to DEM-022

## 📝 TLDR

Today a proposal (E16-S01, #278) carries only the day its stock is needed, and its receipt counts on that day, even when the lead time makes that impossible. After this change every proposal gets a planned start: its need date minus the pair's lead time in calendar days, but never before today. A proposal that cannot finish by its need date starts today, finishes today plus the lead time, and is flagged **Late Supply** by the days between. Its receipt counts on that feasible finish day, so the days in between keep their shortage. A proposal whose finish falls after day 89 is flagged **Beyond Horizon** and raises no daily bucket. Each plan also lists its **uncovered requirements by type**. Where stock, existing supply and the proposals received so far can't cover every requirement of a day, they go first to customer orders by earliest original due date, then to the forecast residual, then to the safety target. The run stores each proposal's lead time, and the latest-run API returns each proposal's planned start, planned finish, lateness and Beyond Horizon flag.

## 📝 Problem Statement

#278 sized every proposal and counts its receipt on its need date (`MrpProposal.date === needDate`, `plan-mrp.ts`). Its `leadTimeDays` is carried "for E16-S02's back-scheduling" and read by nothing. The gaps that follow:

- **An impossible plan looks fine.** A need in 3 days with a 7-day lead time shows a covered balance from day 3, though nothing can arrive before day 7. PRD §04 "Overdue and late starts" says to "plan earliest start today and feasible finish, flag Late Supply and quantify lateness without changing original demand date".
- **Nothing says when to start.** MAT-018 asks for a start of 8 October for a need on 15 October with a 7-day lead time. Production orders already back-schedule that way (`plannedStart`, E10-S01), but MRP doesn't.
- **The horizon leaks.** A Buy lead time of 120 days would credit day 20 with stock that arrives on day 120. PRD §04 keeps "exactly 90 daily buckets" and requires later finishes to "remain visible separately with Beyond Horizon dates/warnings and do not increase stock inside the 90 days" (MRP-049).
- **Scarce stock has no owner.** When stock and supply can't cover a day, nothing says whether the customer order, the forecast or the safety buffer goes short. The PRD's priority is customer orders by earliest original due date, then forecast residual, then the safety target gap. Orders on the same date are equal, and a stable-ID tie-breaker only keeps the result deterministic (DEM-018 to DEM-022, MRP-044).

## Resolved assumptions (autonomous defaults)

The issue's two open questions, plus the gaps between its notes and the shipped code, each answered with the most reversible choice. The one schema change is an additive column (Q6). The one contract change is four additive fields on each listed proposal (Q7).

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Does priority apply across days (issue open question 1)? | Stock is consumed day by day. Each day, that day's receipts join the available stock, that day's requirements join the outstanding queue, and the queue is served in priority order: rank, then original date, then stable ID. A requirement left unserved on its own day is reported short on that day. It stays in the queue, so a later receipt serves it before a later requirement of the same or a lower rank. A later customer order never takes stock from an earlier day. | It is the issue's proposal, and it keeps a day's after-proposal deficit equal to what the queue still holds (Architecture, invariant). The global alternative would let a later order reserve stock ahead of an earlier forecast, and the issue rejects it. |
| Q2 | Answered on #382 (was ⚠ NEEDS HUMAN CONFIRMATION). A customer-order line due on day 90 (the issue's MRP-004 criterion): does it get a Beyond Horizon proposal? | **No.** Demand dated day 90 or later is in no bucket and gets no proposal in this run (MRP-004's horizon half, as #273 ships it). **Beyond Horizon** marks a proposal for an in-horizon need whose earliest feasible finish, today plus the lead time, falls after day 89. With every need inside the horizon, that happens exactly when the lead time is 90 days or more (MRP-049). | PRD §04 defines Beyond Horizon by the *finish*: "recommendations whose earliest feasible finish lies later remain visible separately". MRP-004 asks for "independently justified" later recommendations and says demand on day 90 is "not silently included". The snapshot already holds the line itself: Open lines are read through the end of day 89's month, so the 30 December line of a 1 October run is loaded. It holds nothing else past day 89, though: forecasts, purchasing, production and transfers are read only to day 89. Netting that line would credit none of the supply due by then, and the cover would depend on where day 89 falls in its month: 30–31 December for a run on 1 October, nothing for one on 3 October. This drops half of an issue criterion, so the owner confirms it, and MRP-004 stays "Not executed". Saying yes later is additive. The bounded option is a Beyond Horizon proposal for the snapshot's firm lines after day 89, netted against day 89's `projectedAfter`. The full option is a tail projection with every seam in it.<br>**Answered (#382, 2026-11-05):** the owner left the call to the run, so this answer stands: no proposal and no mark for demand on day 90 or later. MRP-004 is Passed (automated) under an erratum in `research/CPG-acceptance.md`. The bounded option would be a story in E16 (#268). |
| Q3 | Which balance does priority divide? | The balance **after** proposals, with each received on its planned finish day. Stock, tentative and dependable supply, transfer receipts and the proposals received by that day form the available stock; at-risk supply never counts (#277). A pair with no proposals divides its balance before proposals. | Priority answers "which demand gets stock that cannot be replenished in time". That is what the plan still can't cover: a late or Beyond Horizon proposal, a pair without parameters, a raw material set to Make. Dividing the before-proposals balance would report a shortage the plan's own on-time proposal already covers. |
| Q4 | ⚠ NEEDS HUMAN CONFIRMATION. Where are the typed shortages reported? | `MrpPlan.shortages` holds one `MrpShortage` per uncovered requirement and day, in the engine result only. It is not stored and not in the API, so no user sees it in this story. E16-S03 (#280) turns it into exceptions and E18-S02 (#285) marks it in the report. DEM-018 to DEM-022 and MRP-044 ("Channel: Both") stay "Not executed", and their Evidence lines cite the engine tests. | It follows #276, whose Overdue flags live on `MrpPlan.supply` and aren't stored. The issue puts exceptions and report marks out of scope. A user-visible channel means a stored table and an API field. That is a contract, and its shape belongs with the exceptions (#280) that read it. The issue's "shown against O2" reads as a channel, so the owner confirms it. Saying "store and list them now" adds a table and a field and changes no engine code. |
| Q5 | Where do existing documents' needs rank: open production orders' components (`MrpPlan.componentDemand`) and planned transfer dispatches (`transferOut`)? | **Rank 0**, served before customer orders. Each is reported with its own kind (`component`, `transfer`) when short. Rank 0 covers only the needs of open documents. The components of Make proposals that E17-S01 (#281) explodes must rank by the requirement at their root, not here. | PRD §04 ranks only independent demand and the target. Released documents are commitments MRP never rewrites (R10). A transfer dispatch is already capped by the source's dependable balance after its own demand (#277 Q2), so it rarely competes. Reporting their kinds keeps every unit of the deficit accounted for. MRP-044's multi-level case (a raw shortage reaching a parent's order and forecast) needs E17's root ranking; this story proves its single-pair case. |
| Q6 | What does the run store for timing? | One additive column, `mrp_recommendation.lead_time_days` (`integer not null default 0`). The latest-run read derives the planned start, planned finish, lateness and Beyond Horizon flag through the engine's own `scheduleProposal`, from `needDate`, the lead time and the run's `startDate` and `horizonDays`. | The fields are derived, so one rule serves the engine and the read. An `ALTER TABLE … ADD COLUMN` rebuilds nothing (lesson 2026-10-23). A previous image that writes during a deploy omits the column and gets 0. That is the receipt timing it planned with (receipt on the need date), but its `plannedStart` reads as the need date rather than the real start, until the next run replaces those rows. The compatibility entry says so. A nullable column would avoid that, but it would put a null into four API fields forever, for one deploy window. |
| Q7 | API shape? | Each proposal of `GET …/mrp/runs/latest` gains `plannedStart` and `plannedFinish` (ISO dates), `lateDays` (an integer, zero or more) and `beyondHorizon` (boolean). It stays in the plan's one `proposals` list, ordered by `needDate`. The list is not split in two. | Additive (`BACKWARD_COMPATIBILITY.md`). A Beyond Horizon proposal is still the same proposal with the same need. The flag lists it "separately" for any client in one filter, and a second list would move a proposal between lists as its lead time changes. |
| Q8 | The engine's `MrpProposal`, and which files change? | `date` (the receipt's bucket, "`needDate` until E16-S02") is replaced by `plannedStart`, `plannedFinish`, `lateDays` and `beyondHorizon`. `sizeProposals` returns a `SizedProposal` (the proposal without timing), and the only change to #278's file is dropping `date`. `planMrp` schedules each proposal through `scheduleProposal`. Beyond Horizon proposals stay in `MrpResult.proposals`, and `planMrp` adds only the others to `proposedReceipts`, on `plannedFinish`. Priority gets its own seam folder, `priority/`. | The issue's notes suggested a separate list in `MrpResult`. One list with a flag means one storage loop and one order, and the 90 buckets stay exactly 90 either way. Nothing outside the engine reads `date` (the service stores `needDate`). Scheduling in `planMrp` keeps the seam rule ("a story … edits no other story's files"). The one exception is the field #278 left as an explicit placeholder for this story. Priority is not sizing, so it is a seam of its own. |
| Q9 | Does lateness change sizing? | No. Sizing still nets each day's need against the balance after earlier proposals, counting each proposal from its need date, so a late proposal never triggers a second proposal for the days before it arrives. Timing is applied afterwards and moves only the receipt. Priority changes no quantity either: it only decides which requirement a deficit falls on. | One proposal per need (#278's carried surplus) is the sized plan. Re-sizing against late arrivals would stack proposals that all arrive on the same feasible day and over-buy. |
| Q10 | MRP-038: a "production need yesterday"? | E15-S01 has already moved overdue demand to today, so the need date is today and the start is clamped to today. `scheduleProposal` also clamps any need date before today, so no proposal of a run starts before its today, whatever the input. | The guarantee holds by construction. A unit test asserts it on every proposal of a mixed fixture. |
| Q11 | UI? | No new screen element: the MRP page lists no proposals (#278 Q7). The MRP help topic's proposal paragraph and API paragraph (EN, PL) gain the timing rule, Late Supply, Beyond Horizon and the four API fields. | "Projected after proposals" now counts a late proposal on its finish day. The help must say so, or the column reads as wrong. |
| Q12 | Integration tests? | Two new cases in `tests/integration/mrp-run-api.test.ts`. A Late Supply proposal: lead time 7 for an order due on day 3 starts on day 0, finishes on day 7, is 4 days late, and `projectedAfter` stays negative on days 3 to 6. A Beyond Horizon proposal: Buy lead time 120 for an order due on day 20 finishes on day 120, and `proposedReceipts` is 0 and `projectedAfter` negative on every day from 20 to 89. The #278 case's `toEqual` gains the four fields. | The production image is the only proof that the migration, the stored lead time and the derived fields reach the API. |

The issue's second open question, about E15-S01 being merged, is settled: #275 merged on 2026-10-31. If the owner answers Q2 or Q4 differently, the answer adds work on top of this design and rewrites none of it.

## 📝 Proposed Solution

One timing rule, one priority pass, one column:

```
domain/demand/
  demand-buckets.ts            + daysBetween(from, to)
domain/mrp/
  mrp-result.ts                MrpProposal: date → plannedStart, plannedFinish, lateDays, beyondHorizon;
                               + MrpShortage, MRP_SHORTAGE_KINDS; MrpPlan + shortages
  plan-mrp.ts                  schedules each sized proposal; receipts on plannedFinish, Beyond Horizon skipped;
                               + rankShortages after the final projection
  sizing/
    schedule-proposal.ts       scheduleProposal(needDate, leadTimeDays, today, horizonDays)          (new)
    size-proposals.ts          returns SizedProposal: `date` dropped, nothing else
  priority/                                                                                          (new seam)
    rank-shortages.ts          rankShortages(pair): MrpShortage[]                                   (new)
services/mrp/
  mrp-run.service.ts           stores leadTimeDays; latest() derives the timing fields
  mrp-run-view.ts              MrpProposalView + plannedStart, plannedFinish, lateDays, beyondHorizon
db/entities/mrp/
  mrp-recommendation.entity.ts + leadTimeDays
db/migrations/                 + Migration…_mrp_recommendation_lead_time                            (new)
```

**Alternatives considered.**
- *Re-size against late arrivals*, proposing again on each day before a late proposal lands. This stacks proposals that can't arrive sooner anyway (Q9).
- *Divide the balance before proposals.* This would report shortages that on-time proposals cover (Q3).
- *Store the derived dates.* This means four columns where one suffices, and two copies of the rule (Q6).
- *Plan a tail past day 89 for Beyond Horizon demand.* That is a second projection with every seam in it, beyond the PRD's definition by finish (Q2).

## 📝 Architecture

### Timing: `sizing/schedule-proposal.ts`

```ts
/** When a proposal for `needDate` can start and finish, given the pair's lead time (PRD §04, MAT-018, MRP-037/038/049). */
export function scheduleProposal(needDate: string, leadTimeDays: number, today: string, horizonDays: number): MrpProposalTiming
interface MrpProposalTiming { plannedStart: string; plannedFinish: string; lateDays: number; beyondHorizon: boolean }
```

- `plannedStart(needDate, leadTimeDays)` from `domain/production-orders/production-planning.ts`: the calendar-day rule production orders use, weekends included (N04).
- **On time:** the back-scheduled start is today or later. Then the start is that date and the finish is `needDate`, with `lateDays` 0.
- **Late Supply:** the start would fall before today. Then the start is today, the finish is `addDays(today, leadTimeDays)`, and `lateDays = daysBetween(needDate, plannedFinish)`, above zero. A need date before today, which E15-S01 never produces, is late by the same rule.
- **Beyond Horizon:** `daysBetween(today, plannedFinish) >= horizonDays`, so the finish is after day 89. Such a proposal is always late as well, since its need is inside the horizon.
- `daysBetween(from, to)` joins `demand-buckets.ts` beside `addDays`, built on its private `dayNumber`.

`planMrp` calls it on each proposal `sizeProposals` returns, as `{ ...sized, ...scheduleProposal(sized.needDate, sized.leadTimeDays, today, MRP_HORIZON_DAYS) }`. Sizing itself is unchanged (Q9): `SizedProposal` is `Omit<MrpProposal, keyof MrpProposalTiming>`, and `sizeProposals` only stops setting `date` (Q8). `MrpProposal` becomes:

```ts
export interface MrpProposal {
  kind: MrpProposalKind; material: string; location: string;
  needDate: string;          // unchanged: the day the balance after earlier proposals falls below target
  plannedStart: string;      // never before today (MRP-038)
  plannedFinish: string;     // the receipt day: needDate when on time, today + lead time when late
  lateDays: number;          // plannedFinish − needDate in calendar days; 0 when on time (MRP-037)
  beyondHorizon: boolean;    // plannedFinish after day 89: shown, never in a bucket (MRP-049)
  quantity: bigint; leadTimeDays: number;
}
```

`planMrp` adds `proposal.quantity` to the `proposedReceipts` of `dayOf.get(proposal.plannedFinish)` for every proposal that isn't Beyond Horizon, then projects again as today. `projectedBefore` and `shortage` don't change. `projectedAfter` stays negative from the need date until a late proposal's finish.

### Priority: `priority/rank-shortages.ts`

```ts
export const MRP_SHORTAGE_KINDS = ["component", "transfer", "customer-order", "forecast", "safety-target"] as const;
export interface MrpShortage {
  kind: (typeof MRP_SHORTAGE_KINDS)[number];
  /** The bucket the requirement counts in. */
  date: string;
  /** Its priority date: the line's required date, the forecast's own date, the order's start, the transfer's planned dispatch; the day itself for the target. */
  originalDate: string;
  /** The order, production order or transfer business ID; null for a forecast and the target. */
  document: string | null;
  /** The order line's position; null otherwise. */
  position: number | null;
  /** What the requirement needs that day: the outstanding quantity, or the target in force. */
  required: bigint;
  /** What the day leaves uncovered: above zero, at most `required`. */
  uncovered: bigint;
}
export function rankShortages(plan: RankedPair): MrpShortage[]
```

`RankedPair` is the plan after the final projection: `physical`, the buckets (receipts and `safetyTarget`), and the `firmDemand`, `forecastDemand`, `componentDemand` and `transfersOut` lists `planMrp` already builds. The pass, per pair:

1. `available = physical`; `queue` = the outstanding requirements. Existing documents' needs come first (rank 0, Q5), then customer orders (1), then forecast residuals (2). The queue is ordered by this key: rank, then `originalDate`, then the kind's index in `MRP_SHORTAGE_KINDS`, then `document`, then `position`. Dates and codes compare with `compareCodes`, never `localeCompare`. Within one kind, either both `document`s are set or both are null, and so are both `position`s. Two forecasts of a pair never share a date (the forecast unique key), so the key is total, and the result never depends on list or sort stability.
2. For each day: add that day's `tentativeSupply + dependableSupply + transferIn + proposedReceipts` to `available`, and put that day's requirements into the queue. Serve the queue in order: each takes `min(available, outstanding)`.
3. Each requirement of this day still outstanding gives one `MrpShortage` with `uncovered` = what is left. An earlier day's requirement served late is not reported again.
4. Where `safetyTarget > available`, one `safety-target` shortage with `required = safetyTarget` and `uncovered = safetyTarget − available`. The target is a level and consumes nothing (#273 Q4).
5. Drop fully served requirements.

Overdue customer-order lines all count today, and they take today's stock in order of their original due dates (DEM-020). Same-date lines are ordered only by order code and position, a stable ID, so two runs give the same result (DEM-021). The current month's residual carried to today ranks after every customer order of today (D08).

**Invariant**, tested: on every day, the queue's outstanding total equals `max(0, −projectedAfter)` and `available` equals `max(0, projectedAfter)`. A `safety-target` shortage is `min(safetyTarget, safetyGap({ safetyTarget, projectedBefore: projectedAfter }))`. Priority decides only *which* requirement a deficit falls on, never its size.

`planMrp` calls `rankShortages` for every pair, with or without parameters, after the final projection. Its result is `MrpPlan.shortages`, ordered by date, then rank, original date and ID, with the safety target last on its day. The run service ignores the list (Q4).

### Storage and read

- `MrpRecommendation` gains `leadTimeDays: p.integer().default(0)`. `writeResults` stores the proposal's `leadTimeDays`, and Beyond Horizon proposals are stored like the rest.
- `proposalsOf` adds `leadTimeDays` to its `fields`. Each `MrpProposalView` is `{ kind, needDate, quantity, ...scheduleProposal(needDate, leadTimeDays, run.startDate, run.horizonDays) }`. The read's plan doesn't change: same index, same filter, one more column read from the row.

## 📝 Data Model

`mrp_recommendation`, one new column, through an additive migration (`npm run db:migration:create -- mrp_recommendation_lead_time`). The generated SQL must be a single `alter table \`mrp_recommendation\` add column \`lead_time_days\` integer not null default 0;`. If MikroORM emits a table rebuild instead, hand-edit it to the `ALTER` (lesson 2026-10-23), and `down()` drops the column. Existing rows read 0, so they stay on time with their finish on their need date, the timing the run that wrote them used. No backfill.

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest`: each element of `plans[].proposals` gains:

```json
{ "kind": "purchase-requisition", "needDate": "2026-10-04", "quantity": "10.000000",
  "plannedStart": "2026-10-01", "plannedFinish": "2026-10-08", "lateDays": 4, "beyondHorizon": false }
```

Additive. The order (by `needDate`), paging, filters and `MRP_RUN_SUPERSEDED` are unchanged. `plannedStart` is never before the run's `startDate`. `beyondHorizon` is true exactly when `plannedFinish` is after the run's `endDate`.

## 📝 UI/UX

No new screen element. In `packages/app/src/help/topics.ts` the MRP topic changes in EN and PL.

The proposal paragraph gains: "Each proposal starts its lead time, in calendar days, before the day it is needed, and never before today. One that can't finish in time starts today, finishes today plus the lead time and is late by the days between: its stock counts in the balance after proposals only from that day. One that would finish after the last of the 90 days is beyond the horizon, and no day's balance counts it."

The API paragraph gains: "…need date and quantity, its planned start and finish, how many days late it is, and whether it finishes beyond the horizon."

## 📝 Edge Cases & Failure Scenarios

- **Lead time 0:** the start and finish are the need date. A need today is on time.
- **Lead time 90 or more:** every proposal of the pair is Beyond Horizon. `projectedAfter` equals `projectedBefore`, and every shortage stays in `shortages`.
- **Several late proposals:** they finish on the same day, today plus the lead time, and their quantities add up in that day's `proposedReceipts`. Their `lateDays` differ by need date. Each was sized by #278's rule, so two lots of minimum 10 for needs of 3 and then 9 more arrive together as 20, where one lot of 12 would have done. Merging lots that land on the same day is a sizing rule, not timing; it is left to the sizing rules (Risks).
- **Lateness and its start:** on time, `plannedStart` is `needDate − lead` and is never before today. Late, it is today. `plannedFinish` never comes before `needDate`.
- **A pair without parameters, or a raw material set to Make:** no proposals. `shortages` reports every uncovered requirement from stock and existing supply.
- **A zero target:** never a `safety-target` shortage. With a target and a negative balance, `uncovered` is the whole target, and the deficit itself belongs to the queued requirements.
- **A previous image during a deploy:** it inserts recommendations without the column and gets 0. The new image's read shows them on time, as that image planned them. An old image's read ignores the column.
- **Determinism:** the result depends on the snapshot's content only. A shuffled snapshot gives identical proposals and shortages.

## 📝 Risks & Impact Review

- **Contract:** four additive fields (`BACKWARD_COMPATIBILITY.md` gains the line). `projectedAfter` now counts a late proposal on its finish day instead of its need day. That is its documented meaning ("every proposed receipt up to this day"), but a client that compared it with the need day sees the difference. It is noted in the compatibility entry.
- **Schema:** one additive column with a default. Rollback is `down()`. Update the migration count and lists (lesson 2026-10-23, line 131), and run `smoke.test.ts`.
- **Performance:** one extra pass per pair, O(days + requirements · log requirements), with no I/O. Re-run `mrp-run-timing.test.ts` under its unchanged budgets and record the figures.
- **Product direction:**
  - Q2, marked ⚠, drops the issue's day-90 proposal.
  - Q4, marked ⚠, keeps the typed shortages in the engine only, out of any user channel.
  - Q5's rank 0 for open documents is a reversible default the PRD doesn't rule on.
- **Over-buy of late lots:** late proposals sized as separate lots arrive together (Edge Cases). That is #278's sizing made visible, not changed. Merging lots that land on the same day would be a sizing change of its own.

## 📝 Decisions in play

R03 (exact quantities; priority changes none), R10 (no document written or rewritten), D04 (the simplest consistent behaviour for Q1 and Q3 to Q12), D08 (the carried residual ranks as forecast on today) and N04 (calendar-day lead times, no working-day calendar) are honoured. None is superseded. Q2 reads PRD §04 and MRP-004 against the issue's criterion, and Q4 decides the channel for the typed shortages; both need Piotr12's confirmation. Q2 was answered on #382 (2026-11-05): the answer above stands.

## 📋 Phasing

One phase, one implementation PR, as the issue scopes it. Timing, the column and the API fields could ship alone: they are useful through the API, and they correct `projectedAfter`. Priority depends on the corrected after-proposal balance and adds only engine code with its tests. Splitting it out would leave the issue half-done for one small pure module. If the owner answers Q4 with "store and list them", that work fits a follow-up beside #280.

## 📋 Implementation Plan

1. **Date helper.** `daysBetween(from, to)` in `domain/demand/demand-buckets.ts`, with tests across a month and a year boundary and a negative span.
2. **Timing.** `sizing/schedule-proposal.ts` with tests, each citing its scenario. MAT-018: need 15 October, lead 7, today 1 October, so start 8 October, on time. MRP-037: today 1 October, need 4 October, lead 7, so start 1 October, finish 8 October, 4 days late. MRP-038: need before today is clamped. MRP-049: need day 20, lead 120, so finish day 120, 100 days late, Beyond Horizon. Also lead 0, a finish exactly on day 89 (not Beyond Horizon) and on day 90 (Beyond Horizon).
3. **Types and sizing.** `MrpProposal` loses `date` and gains the four fields. `SizedProposal` is what `sizeProposals` returns, and it no longer sets `date`. Update `size-proposals.test.ts` (its full-shape assertion) and every fixture that builds a proposal.
4. **`planMrp` timing.** Schedule each sized proposal, put receipts on `plannedFinish`, and skip Beyond Horizon. In `plan-mrp.test.ts`, one test per timing criterion asserting on `planMrp`'s result:
   - MRP-037: `projectedAfter` negative on days 3 to 6 and raised on day 7.
   - MRP-038: overdue demand gives a start of today and a finish on day 4, and no proposal of a mixed fixture starts before today.
   - MRP-049: `proposedReceipts` 0 and `projectedAfter` below zero on every day from 20 to 89, with the Beyond Horizon proposal finishing on day 120. Asserting only `shortage` would pass without the fix.
   - The late-proposal criterion (receipt on the feasible finish, not the need date).
   - MRP-004's horizon half, under Q2: a line due on day 90 gives no proposal and no bucket.
5. **Priority.** `priority/rank-shortages.ts` (`MrpShortage`, `MRP_SHORTAGE_KINDS`, `rankShortages`) with unit tests:
   - DEM-019 / MRP-044: firm 10 and forecast 20 on one day with 15 available give the order 10, the forecast 5, and a forecast shortage of 15.
   - DEM-020: O1 Monday, O2 Tuesday, O2 short. Overdue O1 and O2 on today are ordered by their original dates.
   - DEM-021: same-date lines tie-broken by order code, and two runs are identical.
   - DEM-022: forecast 40 before a safety top-up of 20.
   - DEM-018: the order served and the target reported short.
   - A backlog served by a later receipt before a later forecast.
   - Rank 0 components and transfers, including a component and a transfer with the same code on the same date, ordered by kind.
   - The invariant on a mixed fixture.
6. **`planMrp` shortages.** Wire `rankShortages` after the final projection into `MrpPlan.shortages`. `plan-mrp.test.ts`: DEM-019 end to end without parameters, a late proposal that leaves the customer order short on its need day, and the shuffled-snapshot test extended to `shortages`.
7. **Column.** `MrpRecommendation.leadTimeDays` with `default(0)`, then `npm run db:migration:create -- mrp_recommendation_lead_time`, and review the SQL (Data Model). Update the migration lists and counts. Add a migration test: upgrade on a populated `mrp_recommendation` (the existing rows read 0), an old-style insert without the column after it, `getUpdateSchemaSQL()` not mentioning the table, and `down()`.
8. **Run write and read.** `writeResults` stores `leadTimeDays`, and `proposalsOf` reads it and derives the view fields through `scheduleProposal`. `MrpProposalView` gains the four fields. Tests in `mrp-run.service.test.ts`: a late and a Beyond Horizon proposal stored and read back with their fields, and an on-time proposal unchanged. Re-pin the read in `mrp-report-reads.test.ts` (same plan). Update the route test and the app's `MrpPlanView` fixtures (`app/src/app/admin/[tenant]/mrp/page.test.tsx`, `app/src/components/mrp/mrp-report.test.tsx`) where they list proposals.
9. **Benchmark.** Re-run `mrp-run-timing.test.ts` under its unchanged budgets and record the figures in the PR.
10. **Integration test.** In `tests/integration/mrp-run-api.test.ts`, the two Q12 cases, each with its own material and Buy parameters, plus the four fields on the #278 case. Run `npm run test:integration -- tests/integration/mrp-run-api.test.ts tests/integration/smoke.test.ts`.
11. **Copy, docs, catalogue.**
    - The help paragraphs in EN and PL (UI/UX).
    - `BACKWARD_COMPATIBILITY.md`:
      - the four fields;
      - `projectedAfter` counting a late proposal on its finish day;
      - during a deploy, a previous image's rows reading as on time, with `plannedStart` equal to the need date, until the next run.
    - `.ai/docs/engineering-standards.md`: MRP bullets.
      - The seam list gains `priority/`.
      - `scheduleProposal` is the only timing rule, applied in `planMrp`.
      - `rankShortages` is the only priority. It divides the after-proposal balance, ranks open documents' needs first and changes no quantity. E17-S01 ranks exploded components by their root.
      - Timing moves receipts, not sizing.
    - `CPG-acceptance.md`: the Evidence lines of MAT-018, MRP-037, MRP-038, MRP-049, and of DEM-018 to DEM-022 and MRP-044, which cite the engine tests. A status moves only when every clause, channel included, is asserted (lesson 2026-10-21). DEM-018 to DEM-022 and MRP-044 keep "Not executed" under Q4. MRP-004 is unchanged under Q2.
    - Move this spec to `implemented/` with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

Implemented on #317, branched from `main` (the spec PR #315 stays design-only), as written, with these details:
- `sizing/schedule-proposal.ts` (`scheduleProposal`) and `domain/demand/demand-buckets.ts` (`daysBetween`). `planMrp` schedules what `sizeProposals` returns (`SizedProposal`), so the only edit to #278's sizing file drops `date`. `MrpProposalTiming` lives in `mrp-result.ts`, and `MrpProposalView` extends it.
- `priority/rank-shortages.ts` (`rankShortages`) keeps one queue per rank, sorted because each day's batch is appended in `compareRequirements` order. It adds the requirements lowest priority first, so the order never comes from the input lists, and a test fails without each tie-break key. `MRP_SHORTAGE_KINDS` and `MrpShortage` live in `mrp-result.ts`.
- Migration `Migration20261101075645_mrp_recommendation_lead_time` is one `ALTER TABLE … ADD COLUMN`, as generated. `mrp-recommendation-lead-time-migration.test.ts` covers four cases: an upgrade on populated rows, an insert by an older image, the table altered in place (its SQL gains only the column) and `down()`.
- Benchmark (`mrp-run-timing.test.ts`), fastest of three, budgets unchanged (1,000 ms and 5,000 ms, stall 250 ms):

| Run | Run | Longest stall | `planMrp` alone |
|---|---|---|---|
| Realistic | 219 ms | 35 ms | 5 ms |
| Realistic, worst case | 275 ms | 38 ms | — |
| Ten times | 2,237 ms | 112 ms | 49 ms |
| Ten times, worst case | 2,891 ms | 175 ms | — |

`CPG-acceptance.md`:
- MRP-037, MRP-038 and MRP-049 move to "Partially verified". They are "Both"-channel scenarios, and no screen lists proposals yet (E19-S01).
- MAT-018 cites the MRP half.
- DEM-018 to DEM-022 and MRP-044 keep "Not executed", with Evidence lines that cite the engine tests (Q4).
- MRP-004 is unchanged (Q2).

**After merging `main` with #280 (MRP planning exceptions, #316).** `replenishPair` now decides each pair, so it also times the sized proposals with `scheduleProposal`, and `planMrp` places their receipts. #280 checked Missing BOM on the need date. Its spec (Q3) chose that day as "its planned finish until E16-S02 back-schedules", so that an accepted proposal passes the production order's own BOM check on `plannedFinish`. The check now uses `plannedFinish`, so a late Make proposal is judged on the day its order would be. `MISSING_BOM`'s `date` is that day, and its message says "valid on the planned finish date". On-time proposals are unchanged.
