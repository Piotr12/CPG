# Backlogs

The tracker (GitHub, `Piotr12/CPG`) is the authority; this file keeps the source-to-issue map and reserved ids per `om-backlog`. One section per `Backlog source:`. Never fill a gap in the ids: a retired or moved item keeps its row.

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-26 (slice 3, E14–E20). The E01–E13 rows were first recorded on 2026-10-20 on a branch that never merged (`1f7a9073`) and are restored here; E01–E06 had been recovered from the tracker, since no record was kept when they were filed on 2026-10-19.

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | #9 | Sign-in, users and API tokens | — | — | no |
| E01-S01 | #15 | The admin can sign in with the environment password, and CPG refuses to start without it | #9 | — | no |
| E01-S02 | #16 | The admin can create, reset and deactivate normal users, and a reset or deactivation cuts off their sessions at once | #9 | E01-S01 (#15) | no |
| E01-S03 | #17 | A user can create named API tokens in the UI, then use, list and revoke them through the API | #9 | E01-S02 (#16) | no |
| E01-S04 | #18 | A user can choose English or Polish and light or dark mode, and every page shows the exact footer and a help entry | #9 | E01-S01 (#15) | no |
| E02 | #10 | Tenants, audit and the API contract | — | — | no |
| E02-S01 | #19 | A user can work in Test or Prod, always sees which one is active, and data never crosses between them | #10 | E01-S01 (#15) | no |
| E02-S02 | #20 | Every change is kept in an append-only tenant or Global audit that any user can read | #10 | E01-S02 (#16) | no |
| E02-S03 | #21 | API writes are safe to retry and stale edits are rejected | #10 | E01-S03 (#17) | no |
| E02-S04 | #25 | The admin can make a tenant read-only, which stops every business write, the admin's and the API's included | #10 | E02-S03 (#21), E03-S01 (#22) | no |
| E03 | #11 | Master data | — | — | no |
| E03-S01 | #22 | The admin can create and maintain materials and their unit conversions, and every user can view them | #11 | E02-S01 (#19), E02-S02 (#20) | no |
| E03-S02 | #23 | The admin can maintain locations, customers and suppliers | #11 | E03-S01 (#22) | no |
| E03-S03 | #24 | The admin can set each material's planning parameters per location and its effective-dated safety-stock targets | #11 | E03-S02 (#23) | no |
| E04 | #12 | BOMs | — | — | no |
| E04-S01 | #26 | The admin can define BOMs with alternatives, and every real edit is kept as an immutable revision | #12 | E03-S01 (#22) | no |
| E05 | #13 | Spreadsheet import | — | — | no |
| E05-S01 | #27 | The admin can import master data and BOMs from a workbook, with a full dry run before an atomic commit | #13 | E03-S03 (#24), E04-S01 (#26), E02-S04 (#25) | no |
| E06 | #14 | Later (parked; slice 2 filed as E07–E13 on 2026-10-20, slice 3 as E14–E20 on 2026-10-26) | — | — | no |
| E07 | #73 | Stock ledger, corrections, stock import and transfers | — | — | no |
| E07-S01 | #80 | A user can see physical stock per material and location, post a reasoned correction, and every movement sits in a signed ledger with its source | #73 | E03-S01 (#22), E03-S02 (#23) | no |
| E07-S02 | #81 | A user can import desired physical stock from a workbook, as opening balances or corrections, with a dry run and an atomic commit | #73 | E07-S01 (#80), E05-S01 (#27) | no |
| E07-S03 | #82 | A user can transfer one material between two locations: dispatches move stock into transit, receipts land it, and losses are written off with a reason | #73 | E07-S01 (#80) | no |
| E08 | #74 | Customer orders, forecasts, shipments and goods issues | — | — | no |
| E08-S01 | #83 | A user can create and maintain customer orders with one location and dated lines, and a new order starts Open | #74 | E03-S02 (#23) | no |
| E08-S02 | #84 | A user can ship against one customer order and post goods issues that reduce stock and fulfil its lines, and the exact final issue completes the order | #74 | E08-S01 (#83), E07-S01 (#80) | no |
| E08-S03 | #85 | A user can maintain forecasts per material, location and day, without a customer, as the demand MRP will net against orders | #74 | E03-S02 (#23) | no |
| E09 | #75 | Purchase requisitions, purchase orders and goods receipts | — | — | no |
| E09-S01 | #86 | A user can create purchase requisitions and purchase orders, directly or by converting a requisition into one or more orders | #75 | E03-S01 (#22), E03-S02 (#23) | no |
| E09-S02 | #87 | A user can post goods receipts against one purchase order, partially, repeatedly or in excess, and stock rises atomically with the order's progress | #75 | E09-S01 (#86), E07-S01 (#80) | no |
| E10 | #76 | Production orders and completions | — | — | no |
| E10-S01 | #88 | A user can create a production order for one output material at one location that pins a BOM revision, with the planned start derived from the lead time | #76 | E04-S01 (#26), E03-S03 (#24), E07-S01 (#80) | no |
| E10-S02 | #89 | A user can post partial production completions with actual consumption, and finished output and component usage are posted atomically with the variance recorded | #76 | E10-S01 (#88) | no |
| E11 | #77 | Reversals and the four-state lifecycle | — | — | no |
| E11-S01 | #90 | A user can cancel an unprocessed document or close a partially processed one early, and every header's state follows its lines | #77 | E08-S02 (#84), E09-S02 (#87), E10-S02 (#89), E07-S03 (#82) | no |
| E11-S02 | #91 | A user can reverse a goods receipt line, a goods issue line or a stock correction once, today, with a reason, and the document's state and quantities recalculate | #77 | E07-S01 (#80), E08-S02 (#84), E09-S02 (#87) | no |
| E11-S03 | #92 | A user can reverse a production completion or a transfer dispatch, receipt or write-off, in full and once, and the order or transfer recalculates | #77 | E10-S02 (#89), E07-S03 (#82), E11-S02 (#91) | no |
| E12 | #78 | The atomic Test reset | — | — | no |
| E12-S01 | #93 | The admin can reset Test into a fresh dataset generation in one atomic operation: demo data reseeded, Test IDs restart, Test audit cleared, Prod and Global untouched | #78 | E02 (#10) | no |
| E13 | #79 | Stock, variance and audit reports | — | — | no |
| E13-S01 | #94 | A user can open the current stock report with physical and in-transit quantities per material and location, drill into the ledger and source documents, and fetch the same through the API | #79 | E07-S03 (#82) | no |
| E13-S02 | #95 | A user can open the production variance report comparing each order's target and pinned-BOM expected consumption with actual output and inputs, including extra components and zero-output waste | #79 | E10-S02 (#89) | no |
| E13-S03 | #96 | A user can trace one record's history in the tenant and Global audit, filtered by record, with the business date beside the audit timestamp and linked original/reversal entries, in both languages | #79 | E02-S02 (#20); E11-S02 (#91) for the reversal link | no |
| E14 | #266 | MRP run foundation: the run, its stored 90-day projection and the engine contract | — | — | no |
| E15 | #267 | The full projection: every demand and supply the documents hold, counted once | — | — | no |
| E16 | #268 | Single-level replenishment proposals: lot sizing, priority, timing and planning exceptions | — | — | no |
| E17 | #269 | BOM explosion and recipe choice: multilevel demand, feasibility, fallback, at-risk and provisional plans | — | — | no |
| E18 | #270 | The last-MRP report: daily and weekly views, markers and explanations, with API parity | — | — | no |
| E19 | #271 | Acting on the plan: one-click acceptance, reruns and automatic creation | — | — | no |
| E20 | #272 | End-to-end journeys and the slice 3 closing pass | — | — | no |
| E14-S01 | #273 | The MRP engine projects 90 daily buckets per material and location from today's physical stock and open customer-order demand, and may show a negative projected balance while physical stock stays put | #266 | E07-S01 (#80), E08-S01 (#83) | no |
| E14-S02 | #274 | A user can run MRP for every location of the tenant from the UI or the API, the run is stored with its ID, time and account, a read-only tenant refuses it, and a Test reset clears it | #266 | E14-S01 (#273), E12-S01 (#93), E02-S04 (#25) | no |
| E15-S01 | #275 | MRP nets forecasts against customer orders by calendar month, moves overdue order demand to today, expires past forecast residual and adds each day's safety-stock target | #267 | E14-S01 (#273), E08-S03 (#85), Demand review (#240), E14-S02 (#274) for the snapshot loader | no |
| E15-S02 | #276 | MRP counts open purchasing supply once: requisitions as tentative, purchase orders as dependable, overdue receipts today, and nothing cancelled, closed early, converted or already received | #267 | E14-S01 (#273), E09-S02 (#87), E11-S01 (#90), E14-S02 (#274) for the snapshot loader | no |
| E15-S03 | #277 | MRP projects open production orders (output on the finish day, pinned-BOM components on the start day, only the unproduced balance) and transfers by stage, overdue ones today | #267 | E14-S01 (#273), E10-S02 (#89), E07-S03 (#82), E11-S04 (#144), E14-S02 (#274) for the snapshot loader | no |
| E16-S01 | #278 | MRP proposes a purchase requisition for Buy and a production order for Make wherever projected stock falls below demand or the safety target, rounded up to six decimals, the minimum lot and the lot multiple | #268 | E14-S01 (#273), E03-S03 (#24), E14-S02 (#274) for the snapshot loader, E15-S01 (#275) for the safety-target scenarios (MRP-009, DEM-023); the sizing itself can be built and tested against firm demand first | no |
| E16-S02 | #279 | MRP serves customer orders by earliest original date before forecast and forecast before safety stock, back-schedules by calendar-day lead time, and flags Late Supply and Beyond Horizon proposals | #268 | E16-S01 (#278), E15-S01 (#275) for the typed demand the priority scenarios rank (DEM-018…022, MRP-044) | no |
| E16-S03 | #280 | A material with missing planning parameters, no BOM for Make or a unit that does not convert gets its own MRP exception and no guessed proposal, while every other material is still planned | #268 | E16-S01 (#278) | no |
| E17-S01 | #281 | MRP explodes every Make proposal through its BOM level by level, so intermediates and raw materials get their own dependent demand on the parent's start date, shared components are netted once and cycles are refused | #269 | E16-S01 (#278), E15-S03 (#277), E16-S02 (#279) for the parent start date | no |
| E17-S02 | #282 | MRP picks the highest-priority valid BOM that is feasible after lot rounding against physical stock and dependable supply only, falls back with an explanation of each rejected BOM, and raises a parent exception when none is feasible | #269 | E17-S01 (#281), E15-S02 (#276) | no |
| E17-S03 | #283 | An open production order whose pinned BOM uses a deactivated component is reported At-Risk and not counted as dependable, and an infeasible parent's complete multilevel plan is shown as provisional, never as supply | #269 | E17-S02 (#282) | no |
| E18-S01 | #284 | A user can open the last MRP run's daily report per material and location, filter it, and read the same through the API, in a read-only tenant too | #270 | E14-S02 (#274) | no |
| E18-S02 | #285 | A user can switch the MRP report to weeks, which sum flows but show the week-end balance and the week's lowest balance and peak shortage, and every overdue, late or beyond-horizon date is marked | #270 | E18-S01 (#284), E16-S02 (#279), E15-S02 (#276) and E15-S03 (#277) for overdue purchase orders and transfers (UX-018) | no |
| E18-S03 | #286 | The MRP report explains every rejected BOM and its exact shortages, lists at-risk orders and exceptions, and shows provisional multilevel plans apart from executable proposals | #270 | E18-S01 (#284), E17-S03 (#283), E16-S03 (#280) for the planning exceptions | no |
| E19-S01 | #287 | A user can accept an MRP proposal in one click after confirmation, creating a purchase requisition for Buy or a production order for feasible Make tagged with the run, and a proposal gone stale is refused | #271 | E14-S02 (#274), E16-S01 (#278), E17-S02 (#282) for the Make half (RUN-006), E09-S01 (#86), E10-S01 (#88) | no |
| E19-S02 | #288 | A rerun recalculates from scratch: it never duplicates accepted documents, adds only the new need when demand grows, shows excess without cancelling anything when demand falls, and never edits an existing document | #271 | E19-S01 (#287) | no |
| E19-S03 | #289 | A user can start a run in automatic mode, which creates every executable proposal in one all-or-nothing batch, one at a time per tenant, safely repeatable over the API, and never creates provisional parent orders | #271 | E19-S01 (#287), E17-S03 (#283), E19-S02 (#288) for the automatic halves of RUN-008, RUN-010 and RUN-013, E12-S01 (#93) | no |
| E20-S01 | #290 | A user editing a production-order or master-data quantity sees a tooltip explaining the field's unit and how it converts to the base unit | #272 | E10-S01 (#88), E03-S01 (#22) | no |
| E20-S02 | #291 | The twelve cross-domain journeys run end to end through the UI and the API, from demand to MRP to documents to postings, and core planning works with no price or accounting module | #272 | E14-S01 (#273), E14-S02 (#274), E15-S01 (#275), E15-S02 (#276), E15-S03 (#277), E16-S01 (#278), E16-S02 (#279), E16-S03 (#280), E17-S01 (#281), E17-S02 (#282), E17-S03 (#283), E18-S01 (#284), E18-S02 (#285), E18-S03 (#286), E19-S01 (#287), E19-S02 (#288), E19-S03 (#289), E05-S01 (#27), E07-S02 (#81), E11-S02 (#91), E11-S03 (#92) | no |
| E20-S03 | #292 | The acceptance catalogue shows all 535 scenarios passing, the brief marks slices 2 and 3 done, and E06 (#14) closes | #272 | E20-S02 (#291), E20-S01 (#290) | no |

### Ids taken by other sources (reserved, not managed by this section)

Stories added at epic closures or at the owner's request carry their own `Backlog source:` line, so this section never rewrites them, but their ids are taken: E07-S04 #139, E07-S05 #190; E08-S04 #140, E08-S05 #147, E08-S06 #188; E09-S03 #141, E09-S04 #142, E09-S05 #186, E09-S06 #187; E10-S03 #143, E10-S04 #153, E10-S05 #191; E11-S04 #144; E12-S02 #126, E12-S03 #185, E12-S04 #189; E13-S04 #145, E13-S05 #152.

### Suggested implementation sequence for slice 2 (2026-10-20)

Stories in different concept folders can run in parallel; the shared stock posting service (E07-S01) is the one contention point, so the first document posting after it (E09-S02) should fix the "post a movement group and update the source document" shape before the others start.

1. Finish slice 1 first: E04-S01 (#26, PR #70) and E05-S01 (#27). E10-S01 and E07-S02 build on them.
2. E07-S01 (#80) is the keystone. In parallel: E12-S01 (#93), E08-S01 (#83), E09-S01 (#86), E08-S03 (#85), which need only master data.
3. After E07-S01: E09-S02 (#87) first, then E08-S02 (#84), E07-S03 (#82) and E10-S01 (#88) in parallel.
4. Then E10-S02 (#89), E07-S02 (#81) and E13-S01 (#94) in parallel.
5. Then E11-S02 (#91) and E11-S01 (#90) in parallel; finally E11-S03 (#92), E13-S02 (#95) and E13-S03 (#96) in parallel.

### Suggested implementation sequence for slice 3 (2026-10-26)

E14 fixes the engine's input and output types and its seams (`domain/mrp/projection`, `demand`, `supply`, `sizing`, `exceptions`, `explosion`), so later stories own separate modules. The snapshot loader is E14-S02's; every story that loads a new input extends it.

1. E14-S01 (#273) → E14-S02 (#274): the critical path. E20-S01 (#290) has no MRP dependency and can run alongside.
2. After E14: E15-S01 (#275), E15-S02 (#276), E15-S03 (#277), E16-S01 (#278) and E18-S01 (#284) in parallel. E16-S01's safety-target scenarios close after E15-S01.
3. Then E16-S02 (#279, after E15-S01) and E16-S03 (#280) in parallel; E18-S02 (#285) after E16-S02, E15-S02 and E15-S03; E19-S01 (#287) Buy half after E16-S01.
4. Then E17-S01 (#281) → E17-S02 (#282) → E17-S03 (#283); E19-S01's Make half and E19-S02 (#288) alongside.
5. Then E18-S03 (#286) and E19-S03 (#289) in parallel.
6. Last E20-S02 (#291), then E20-S03 (#292), which closes E06 (#14).
