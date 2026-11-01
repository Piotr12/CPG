# MRP replenishment proposals: a purchase requisition for Buy, a production order for Make, sized to the target and the lot rules

**Status:** implemented
**Created:** 2026-10-31 20:54 UTC
**Issue:** #278 (E16-S01, epic #268) · **Depends on:** the MRP engine (`implemented/2026-10-27--0525UTC-mrp-engine-projection.md`, #273), MRP runs and the snapshot loader (`implemented/2026-10-27--0556UTC-mrp-runs.md`, #274), planning parameters (`implemented/2026-10-20--0532UTC-planning-parameters-safety-stock.md`, #24), safety targets in the projection (`implemented/2026-10-31--0902UTC-mrp-forecast-safety-demand.md`, #275), the last MRP report (`implemented/2026-10-31--0907UTC-mrp-report.md`, #284) · **Design authority:** `.ai/specs/product-brief.md` (R02, R03, R10, D04, N04, N06), `research/CPG-prd001.pdf` §04 "Projection and safety stock", "Parameters/precision", "Manual/auto creation", `research/CPG-prd-datamodel.pdf` ("MRP recommendation", "Material-location parameters"), `research/CPG-acceptance.md` MAT-016, MAT-025, MAT-026, MRP-009, MRP-030, MRP-032, MRP-033, MRP-045, DEM-023, TRF-018

## 📝 TLDR

Today an MRP run projects every demand and supply the documents hold, and shows a shortage without saying what to buy or make. The planning parameters stored since E03-S03 (Make or Buy, lead time, minimum lot, lot multiple) feed nothing. After this change each run will also size replenishment. For every planned pair with parameters, each day whose balance after earlier proposals falls below that day's safety target (zero when none) gets one proposal: a purchase requisition for Buy, a production order for Make. Its quantity is the exact net need, raised to the minimum lot, then rounded up to a whole lot multiple. The surplus carries into later days. The run stores its proposals as MRP recommendations, `proposedReceipts` and `projectedAfter` stop being copies of zero and of `projectedBefore`, and the latest-run API lists each plan's proposals. Planning still writes no document, movement or master (R10).

## 📝 Problem Statement

E14-S01 (#273) left `MrpResult.proposals` empty and two bucket figures for this story: `proposedReceipts` ("proposals received this day") and `projectedAfter` ("`projectedBefore` plus every proposed receipt up to this day"). E14-S02 (#274) stores both and the API returns them. The gaps that follow:

- **A shortage has no answer.** The report (#284) shows −15 on day 5 and stops there. PRD §04 asks MRP to "replenish to at least target applying minimum quantities and lot-size multiples". The parameters it needs have been stored per material and location since #24, and nothing reads them (MAT-016 is "Partially verified" for that reason).
- **Later stories have nothing to build on.** E16-S02 (#279) back-schedules proposals by lead time. E16-S03 (#280) adds the exceptions for pairs without proposals, E17-S01 (#281) explodes Make proposals through their BOMs, and E19-S01 (#287) accepts them. All four need a proposal with a fixed kind, quantity and need date, sized in one module.

## Resolved assumptions (autonomous defaults)

The issue's two open questions, plus the gaps between its notes and the shipped code, each answered with the most reversible choice. The one schema change is a new table (Q3). The one contract change is one additive field per plan in the latest-run API (Q4).

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Lot rule when the minimum is not a multiple of the lot multiple (minimum 10, multiple 6, need 2)? | `lotQuantity(need, minimum, multiple) = roundUpToMultiple(max(need, minimum), multiple)`: raise to the minimum first, then round up to a whole multiple. Need 2 gives 12, need 11 gives 12. The demo generator's `lotFor` stays as it is. | MAT-026 asks for a result that "satisfies both constraints". Only the minimum-then-multiple order does, and it is never below the need. The generator's lots are realistic documents, not MRP proposals, and changing it would change the realistic Test dataset every QA run relies on. No consumer needs the two to agree. |
| Q2 | Which module turns the safety target into a requirement, so E15-S01 and this story don't both add one? | `sizing/size-proposals.ts`, and only there. It reads each bucket's `safetyTarget`, which E15-S01 already fills, and measures the need with E15-S01's `safetyGap`, applied to the balance after earlier proposals: `safetyGap({ safetyTarget, projectedBefore: projectedBefore + carried })`. The target never enters a balance (#273 Q4), and `shortage` stays below zero only. | E15-S01 shipped the target as a level and `safetyGap` "for E16-S01" (#275 Q2), so one rule measures the gap. Reusing it rules out a second formula. |
| Q3 | Where does the run store its proposals? | A new tenant-owned table, `MrpRecommendation` (`mrp_recommendation`), named after the data model's "MRP recommendation". It holds one row per proposal: run, material, location (codes), `kind`, `needDate`, `quantity` (six-decimal text). Only the latest run keeps its rows, which are deleted with its daily rows (#274 Q1). The Test reset clears them through its metadata sweep (`testResetEntities`). Lead time is carried on the in-memory proposal only. | Created by an additive `create table` migration, so no table is rebuilt (lesson 2026-10-23). The issue asks the latest-run API to list proposals, and the daily rows hold only a per-day sum. E16-S02 adds the start-date and timing columns it needs, and E19-S01 the acceptance state. |
| Q4 | API shape of the listed proposals? | Each plan of `GET …/mrp/runs/latest` gains `proposals: { kind, needDate, quantity }[]`, ordered by `needDate`. The plan carries the material and location. `kind` is `"purchase-requisition"` or `"production-order"`. The proposals page with their plans, so the filters and `MRP_RUN_SUPERSEDED` apply unchanged. | Additive, and it travels with the 90 buckets it explains. A separate route or a top-level list would need its own paging and superseded check. The kind names the document a proposal would create, so it says `purchase-requisition` in full. The engine's internal `MrpSupply.kind` (`"requisition"`, never in the API) names an existing document's role in a pair's supply, and stays as it is. |
| Q5 | A pair with no parameters, or a raw material whose stored set says Make? | No proposal, and nothing guessed. The pair is still projected, with `projectedAfter = projectedBefore`. E16-S03 (#280) raises the Missing Planning Parameters exception for the first case and reports the second as an exception too. A raw material with Buy gets requisitions (MRP-030). | MAT-017 and the issue's last criterion forbid guessed supply, and R02 forbids a raw production order. The exceptions are E16-S03's scope, so this story only guarantees the absence. `isProcurementAllowed` is the guard. |
| Q6 | Proposals for an inactive material or location? | Sized like any other: runs plan every material and location, active or not (#274 Q5). Refusing to create a document for an inactive record is acceptance-time work (MAT-029, E19-S01's stale-proposal refusal). | Smallest scope. Hiding a need because a master was deactivated would hide a real shortage, and the PRD says nothing about it. |
| Q7 | Does the MRP page change? | No screen element is added. The day table's existing "Projected after proposals" column now differs from the column before it, so the MRP help topic gains one paragraph (EN, PL) explaining proposals and the lot rule. A proposal list or a "Proposed" column is left to the report and acceptance stories (E18, E19-S01). | The issue lists the run result and the API as the outcome, and puts the report columns out of scope. The help would otherwise leave the after-proposals balance unexplained. |
| Q8 | What does "rounded up to six decimals" round in this story? | Nothing yet. Every input is already an exact micro-unit `bigint` and every sum is exact, so the net need is exact. The proposal is never below it (MAT-025: 1.000001 with multiple 0.000001 stays 1.000001). Upward rounding happens where a need is scaled: E15-S03's `scaledMicro` for components, and E17-S01 for exploded proposals. | R03 holds by construction. A rounding call on an exact value would be dead code under the 100% coverage rule. |
| Q9 | Where does `roundUpToMultiple` live? | It moves from `domain/demo/supply-plan.ts` to `domain/quantities/decimal.ts`, with its two assertions moved from `supply-plan.test.ts` to `decimal.test.ts`. The demo generator imports it from there, with no re-export. `largerOf` stays in the demo module. | The issue names it as the right primitive. MRP importing from the demo generator would make planning depend on test-data code. |
| Q10 | Integration tests? | Two. One in `tests/integration/mrp-run-api.test.ts` reads a Buy and a Make proposal back from the latest run through the API. One assertion in `tests/integration/mrp-report.test.ts` checks the day table's "Projected after proposals" for a pair with parameters. | The production image is the only proof that the loader's new read, the migration and the stored rows reach the API. The day table's figures change on screen, and every user-visible change gets a browser check. |

## 📝 Proposed Solution

One engine seam, one loader read, one table:

```
domain/quantities/
  decimal.ts                 + roundUpToMultiple (moved from demo/supply-plan.ts)
domain/mrp/
  mrp-inputs.ts              + planningParameters: MrpPlanningParameters[]
  mrp-result.ts              MrpProposal gains kind, needDate, leadTimeDays; + MrpProposalKind
  plan-mrp.ts                + sizing after planTransfers, then the final projection
  sizing/                                                                          (new folder)
    lot-quantity.ts          lotQuantity(need, minimum, multiple): bigint
    size-proposals.ts        sizeProposals(plan, parameters): MrpProposal[]
services/mrp/
  snapshot/codes.ts          + the materials' type
  snapshot/planning-parameters.ts   readPlanningParameters                         (new)
  mrp-snapshot.service.ts    + one line in load()
  mrp-run.service.ts         stores recommendations; latest() lists each plan's
  mrp-run-view.ts            + MrpProposalView, MrpPlanView.proposals
db/entities/mrp/
  mrp-recommendation.entity.ts                                                     (new)
db/migrations/               + Migration…_mrp_recommendations                      (new)
```

**Alternatives considered.**
- *Sizing inside `projectBuckets`.* Rejected: the balance formula stays in one place and knows nothing of parameters. Sizing reads its output and feeds `proposedReceipts` back through the same function, so `projectedAfter` keeps its one definition.
- *One proposal per pair covering the whole horizon.* Rejected: PRD §04 sizes day by day, and E16-S02 schedules each proposal from its own need date.
- *Storing proposals in the daily rows.* Rejected (Q3): `proposedReceipts` is already there as a day's sum, and a list of kinds and dates doesn't fit one row per day.
- *A gross-to-net pass with a single cumulative need.* Equivalent for one lot rule, but it hides the carried surplus that the "no second proposal" criterion asserts.

## 📝 Architecture

### Inputs (`mrp-inputs.ts`)

```ts
export interface MrpInputs {
  // …existing lists…
  /** E16-S01: every planning parameter set of the tenant, one per material and location. */
  planningParameters: readonly MrpPlanningParameters[];
}

/** How one material is planned at one location (E03-S03), with the material's type for R02. */
export interface MrpPlanningParameters {
  material: string;
  location: string;
  materialType: MaterialType;
  procurement: ProcurementMode;
  /** Whole calendar days (MAT-018); carried to the proposal for E16-S02. */
  leadTimeDays: number;
  /** At least zero, in micro-units. */
  minimumQuantity: bigint;
  /** Above zero, in micro-units. */
  lotMultiple: bigint;
}
```

The validators guarantee `minimumQuantity ≥ 0` and `lotMultiple > 0` on every user entry path (form, API, import: `planning-parameter-create.schema.ts`). The one other writer, the demo seed (`PlanningParameterService.seedDemo`), skips the schemas, so a generator test asserts that every generated set has a multiple above zero and a minimum of zero or more. The engine relies on both and has no defensive branch.

### Result (`mrp-result.ts`)

```ts
/** What a proposal would create: never a transfer (N06, TRF-018), and never a purchase order (MRP-030). */
export type MrpProposalKind = "purchase-requisition" | "production-order";

export interface MrpProposal {
  kind: MrpProposalKind;
  material: string;
  location: string;
  /** The day the balance after earlier proposals falls below that day's target: what the receipt must cover. */
  needDate: string;
  /** The bucket the receipt counts in: `needDate` until E16-S02 schedules late supply. */
  date: string;
  quantity: bigint;
  /** The pair's lead time, for E16-S02's back-scheduling. */
  leadTimeDays: number;
}
```

`MrpResult.proposals` lists every proposal by material, location, then `needDate` (`compareCodes`).

### Lot quantity (`sizing/lot-quantity.ts`)

`lotQuantity(need, minimum, multiple) = roundUpToMultiple(need > minimum ? need : minimum, multiple)` for `need > 0n`. Each acceptance criterion's figures:

| Need | Minimum | Multiple | Proposal | Criterion |
|---|---|---|---|---|
| 3 | 10 | 5 | 10 | MAT-016 (L1) |
| 3 | 0 | 1 | 3 | MAT-016 (L2) |
| 1.000001 | 0 | 0.000001 | 1.000001 | MAT-025 |
| 11 | 10 | 6 | 12 | MAT-026 |
| 2 | 10 | 6 | 12 | Q1 |
| 4.000001 | 0 | 2 | 6 | MRP-045 |
| 6 | 0 | 1 | 6 | MRP-009 |
| 12 | 10 | 5 | 15 | DEM-023 |

### Sizing (`sizing/size-proposals.ts`)

`sizeProposals({ material, location, buckets }, parameters)` returns `[]` when the set says Make and `isProcurementAllowed(materialType, "make")` is false (R02, MRP-033). Otherwise, with `kind` from `procurement` (`buy` gives `purchase-requisition`, `make` gives `production-order`):

```ts
let carried = 0n;
for (const bucket of buckets) {
  const need = safetyGap({ safetyTarget: bucket.safetyTarget, projectedBefore: bucket.projectedBefore + carried });
  if (need === 0n) continue;
  const quantity = lotQuantity(need, minimumQuantity, lotMultiple);
  proposals.push({ kind, material, location, needDate: bucket.date, date: bucket.date, quantity, leadTimeDays });
  carried += quantity;
}
```

The target is never negative, so a gap above zero means the balance after proposals is below the target, or below zero when the target is zero. A proposal of 15 that leaves 3 above the target carries those 3. A later day 2 lower is still at or above the target, so it gets no proposal (PRD §04). The balance before proposals includes tentative supply, so an open requisition already covering a need suppresses a duplicate proposal (PRD §04: "PR is tentative: prevents duplicate PR").

### `planMrp`

After `planTransfers`, which needs only dependable figures (PRD §04: new suggestions are never dependable):

1. Index `inputs.planningParameters` by `pairKey`.
2. For each planned pair: `buckets = projectBuckets(physical, flows)`. When the pair has parameters, `proposals = sizeProposals(…)`, and each proposal's quantity is added to `flows[dayOf(date)].proposedReceipts`. Then `projectBuckets` runs again for the final buckets: `projectedBefore` and `shortage` are unchanged, and `projectedAfter` adds the cumulative proposals.
3. `proposals` is the concatenation, already in material, location and date order, because the plans are sorted.

Parameters name no pairs. A set for a pair with no stock, demand or supply plans nothing. Each pair is sized alone, so a surplus at A never covers B, and no transfer proposal exists (TRF-018, N06).

### Snapshot loader

- `readCodes` also reads each material's `type` (same single partial read, `fields: ["code", "type"]`), exposed as `codes.materialTypes` (id → type).
- `readPlanningParameters(em, codes)` (new, `snapshot/planning-parameters.ts`): one partial read of the tenant's sets, `fields: ["material", "location", "procurement", "leadTimeDays", "minimumQuantity", "lotMultiple"]`, `disableIdentityMap`. There is one set per pair, about as many rows as the run has pairs. Quantities go through `parseDecimal`.

### Storage and the run

```mermaid
flowchart LR
  L[readPlanningParameters, new] --> I[MrpInputs]
  I --> P[planMrp]
  P --> PB1[projectBuckets, existing] --> S[sizing/size-proposals, new] --> PB2[projectBuckets again]
  PB2 --> D[(MrpDailyResult, existing: proposedReceipts, projectedAfter)]
  S --> R[(MrpRecommendation, new)]
  R --> A[GET …/mrp/runs/latest: plans[].proposals]
```

`MrpRunService.run` deletes the earlier run's recommendations together with its daily rows (`nativeDelete(MrpRecommendation, {})`), then writes the recommendations through the same chunked writer as the daily rows. They count toward the 500-row flush, the run is re-loaded after each `em.clear()`, and the writer yields between chunks. Quantities are stored with `formatDecimal(quantity, { fixed: true })`, so they read "10.000000", never "10". A proposal is above zero, so `formatSignedQuantity` isn't needed. The run still writes only its own tables and its one audit entry (R10).

`latest()` reads, inside its existing transaction and after the page's rows, the page's recommendations: `{ run, material: { $in: pageMaterials }, …location filter }`, ordered by material, location and `needDate`, with partial fields. It keeps only the page's pairs in code. The page is contiguous in (material, location) order, so every pair of an interior material is on it, and only the first and last material can have pairs off the page. The read therefore hydrates at most (the page's 25 pairs plus the other locations of its two edge materials) × 90 rows, a few thousand on any real tenant. The unique `(tenant, run, material, location, need_date)` index serves it, and a plan test pins the seek (lesson 2026-10-25).

## 📝 Data Model

```ts
export const MrpRecommendation = defineEntity({
  name: "MrpRecommendation",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    run: () => p.manyToOne(MrpRun).deleteRule("cascade"),
    material: p.string().length(8),
    location: p.string().length(8),
    kind: p.enum(MRP_RECOMMENDATION_KINDS), // "purchase-requisition" | "production-order"
    needDate: p.string().length(10),
    quantity: p.string(),                   // six-decimal BUoM text, above zero
  },
  uniques: [{ properties: ["tenant", "run", "material", "location", "needDate"] }],
});
```

One proposal per pair and day holds by construction, and the unique index enforces it. The FK to `mrp_run` cascades on delete. A Test reset run by the previous image during a deploy knows nothing of this table: it deletes Test's `mrp_run` rows, and the cascade removes their recommendations. Without the cascade, the deferred FK check would fail that reset at commit (lesson 2026-10-21, "migrations must tolerate the previous image"). The migration only creates `mrp_recommendation` with its indexes. Its `down()` drops the table. No existing table is touched, so no populated-upgrade test is needed beyond the usual up/down. Registered in `db/src/entities/index.ts`. The kinds constant lives in `@cpg/db` with the entity, and core's `MrpProposalKind` is pinned equal to it by a type test.

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest` (additive): each plan adds `proposals`, ordered by `needDate`:

```json
{ "kind": "purchase-requisition", "needDate": "2026-11-05", "quantity": "10.000000" }
```

`kind` is `purchase-requisition` or `production-order`. `quantity` is a six-decimal BUoM string above zero. `needDate` is a horizon date. Since this story, `proposedReceipts` holds each day's proposed quantity, and `projectedAfter` is `projectedBefore` plus every proposal up to that day. Both were the fields' documented meaning from the start. `POST …/mrp/runs` is unchanged. `BACKWARD_COMPATIBILITY.md` gets an "Additive since E16-S01" bullet.

## 📝 UI/UX

No screen element changes (Q7). The day table's "Projected after proposals" column now shows the balance after proposals. The MRP help topic (`packages/app/src/help/topics.ts`) gains one paragraph per language. Proposed EN, with PL to match:

> Where planning parameters exist for a material and location, the run also proposes supply: a purchase requisition when the material is bought there, a production order when it is made there. A day whose balance, after the proposals of earlier days, falls below zero or below that day's safety-stock target gets one proposal. Its quantity covers the gap, raised to the minimum lot and rounded up to a whole lot multiple: with minimum 10 and multiple 6, a gap of 11 becomes 12. Whatever a proposal brings above the target carries into later days. "Projected after proposals" shows that balance. A proposal creates no document; a raw material is never proposed for production.

Say BOM, never recipe (`tests/api-messages-glossary.test.ts`).

## 📝 Edge Cases & Failure Scenarios

All with today fixed in the tests:

- **Two sites, own parameters (MAT-016).** M at L1 Buy (minimum 10, multiple 5) and L2 Make (minimum 0, multiple 1), shortfall 3 at each: L1 gets a requisition of 10, L2 a production order of 3. Swapping the sets swaps the results.
- **Safety target (MRP-009, DEM-023).** A projection of 4 against 10 gives a proposal of 6 and an after-proposal balance of 10. An ending stock of 8 against 20, with minimum 10 and multiple 5, gives a need of 12, a proposal of 15 and a balance of 23.
- **Carried surplus.** After that 15, a later day with 2 more demand (after-balance 21 ≥ 20) gets nothing. A day that takes it to 19 gets a proposal sized from a need of 1.
- **Target rise inside the horizon.** The after-balance is compared with each day's own target, so a rise from 20 to 40 on day 30 proposes on day 30.
- **Supply arriving after the need.** A purchase order due on day 4 doesn't cover a shortage on day 3, so day 3 gets a proposal and the balance runs above target from day 4. Showing that excess is E19-S02's job, and nothing is cancelled.
- **Open requisition.** A tentative requisition already covering the need: no proposal.
- **Overdue demand.** A shortage today gives a proposal with today's `needDate`. E16-S02 marks it Late Supply.
- **No parameters, or raw with Make (Q5).** The pair is projected with `projectedAfter = projectedBefore` and has no proposal. With the raw material's set changed to Buy, a requisition (MRP-030). A finished product with Buy gets a requisition (MRP-032).
- **Surplus at A, deficit at B (TRF-018).** B gets its own proposal, A's figures are unchanged, and no kind is a transfer.
- **Nothing written (R10).** The run's "changes nothing else" test (every tenant table, from metadata) allows only `mrp_run`, `mrp_daily_result`, `mrp_recommendation` and the audit entry.
- **Determinism.** A shuffled snapshot gives an equal result, proposals included.
- **Very large need.** A proposal is derived, not entered, so `MAX_QUANTITY` doesn't bound it. The text column holds any `formatDecimal` value, and E19-S01 validates on creation.
- **Rerun.** Proposals are recalculated from scratch, and the earlier run's rows are deleted in the run's own transaction.
- **Test reset.** Clears Test's recommendations through the metadata sweep, as `test-reset.service.test.ts` asserts for daily rows.

## 📝 Risks & Impact Review

- **Schema.** One new table, additive. Rollback is the migration's `down()`. An older image ignores the table. During a deploy overlap:
  - an old container's run deletes daily rows but not recommendations. The next new run deletes every recommendation (`nativeDelete(MrpRecommendation, {})`, not by run), so stale rows don't outlive it, and until then the API reads proposals by run, so an older run's rows are never listed under the latest run;
  - an old container's Test reset deletes `mrp_run` and the FK cascade removes the recommendations (Data Model). A test deletes a run with plain SQL, as the old image's sweep would, and finds its recommendations gone.
- **Meaning of two stored figures.** `proposedReceipts` and `projectedAfter` were zero and a copy of `projectedBefore`. They now carry real values. `BACKWARD_COMPATIBILITY.md` documented that meaning from the start. The report's summary (`lowestProjectedBefore`, `firstShortageDate`) stays on the before-proposals balance (#284 Q7), so it doesn't change.
- **Realistic dataset.** The seed stores planning parameters (`generate-dataset.ts`), so realistic runs now produce proposals. The integration tests that compare a run's stored output byte for byte (`mrp-run-api.test.ts`, the report tests) assert their own pairs only (lesson 2026-10-22). Check the ones that assert `projectedAfter` equals `projectedBefore`.
- **Run time.** Sizing is one pass over each pair's 90 buckets and a second projection: linear and small. The cost is the extra rows written. The worst case is one proposal on every day of every pair, which a set with minimum 0 and multiple 0.000001 gives under demand every day. That doubles the rows: at ten times, about 430 pairs × 90 = 38,700 recommendation rows beside as many daily rows. The benchmark (`mrp-run-timing.test.ts`) seeds that worst-case set on every pair, so each day in deficit gets a proposal, and prints the daily-row and recommendation-row counts beside the run time and the longest stall. Budgets unchanged: 1 s realistic, 5 s at ten times, 250 ms per stall. If the ten-times run misses its budget, make the chunk smaller or write the recommendations in a second chunked pass before shipping, never by raising the budget.
- **Migration counts.** The lists in `orm.test.ts` and `core/src/database.test.ts`, the counts in `system-status.service.test.ts` and `smoke.test.ts`, and one more `down()` in each rollback-by-count test (lesson 2026-10-23).

## 📝 Decisions in play

R02 (raw is Buy-only: `isProcurementAllowed` before a Make proposal), R03 (exact six-decimal quantities, never below the need: Q8), R10 (planning writes no document), D04 (simplest consistent behaviour: Q1, Q6), N04 (no capacity or working-day calendars: lead time is only carried), N06 (no transfer proposals: the closed kind union). None is superseded.

## 📋 Phasing

One phase, one PR: the lot primitive, the sizing seam, the loader read, the table and its migration, the run's write and read, the benchmark, an API and a report integration test, the help copy and the docs. No new screen element.

## 📋 Implementation Plan

1. **`roundUpToMultiple` moved.** Into `domain/quantities/decimal.ts`, moving its two assertions from `supply-plan.test.ts` to `decimal.test.ts`. `demo/supply-plan.ts` imports it (no re-export). Add the generator test that every generated planning parameter set has a lot multiple above zero and a minimum of zero or more (Architecture, Inputs).
2. **Types.** Add `MrpPlanningParameters` and `MrpInputs.planningParameters`, plus `MrpProposalKind`. `MrpProposal` gains `kind`, `needDate` and `leadTimeDays`. Pass `planningParameters: []` from `MrpSnapshotService.load` and every fixture, so the suite stays green.
3. **Lot quantity.** `sizing/lot-quantity.ts` with tests: the table above, a need equal to the minimum, and a need already on a multiple.
4. **Sizing.** `sizing/size-proposals.ts` with tests: Buy and Make kinds, raw with Make (none), the carried surplus with no second proposal, a second proposal when the surplus runs out, a target rise, a zero target with a negative balance, a balance exactly at the target (none), lead time carried, and `needDate === date`.
5. **`planMrp`.** Wire sizing after transfers and re-project. In `plan-mrp.test.ts`, one test per #278 criterion asserting on `planMrp`'s result: MAT-016, MAT-025, MAT-026, MRP-045, MRP-009, DEM-023, the carried surplus, MRP-030, MRP-032, MRP-033 / R02, TRF-018, and R03/R10 (every proposal quantity a `bigint` above zero, and the snapshot unchanged). Also: `projectedBefore` and `shortage` unchanged by proposals, an open requisition suppressing a proposal, a pair with no parameters, a set for an unplanned pair planning nothing, and a shuffled snapshot.
6. **Loader.** Extend `readCodes` with types, add `snapshot/planning-parameters.ts` and its line in `load`. Tests in `mrp-snapshot.service.test.ts` on a real SQLite file: both tenants seeded with only the scope's read, quantities parsed, the material's type attached. The empty-tenant test expects `planningParameters: []`. Add a plan test for the new read.
7. **Table.** `MrpRecommendation` entity with the cascading run FK, registration (and `db/src/index.test.ts`'s entity lists), `npm run db:migration:create -- mrp_recommendations`, then review the generated SQL: create only, `on delete cascade` on `run_id`. Update the migration lists and counts (Risks). Add an up/down test, and a test that deleting an `mrp_run` row with plain SQL inside a deferred-FK transaction removes its recommendations and commits.
8. **Run write and read.** `MrpRunService.run` deletes and writes recommendations in chunks. `latest()` reads the page's proposals, and `MrpPlanView.proposals` / `MrpProposalView` go in `mrp-run-view.ts`. Tests in `mrp-run.service.test.ts`: stored rows per proposal and replaced by the next run, `proposedReceipts` and `projectedAfter` stored, proposals per plan with and without filters and across a page edge, the "changes nothing else" table list, and the Test reset clearing them. Pin the read's plan in `mrp-report-reads.test.ts`. Update the route test for the new field, and add `proposals: []` to the `MrpPlanView` literals in `app/src/app/admin/[tenant]/mrp/page.test.tsx` and `app/src/components/mrp/mrp-report.test.tsx`.
9. **Benchmark.** Extend `mrp-run-timing.test.ts` with the worst-case Buy set (minimum 0, multiple 0.000001) on every pair. Print the daily-row and recommendation-row counts beside the timings. Keep the budgets (Risks) and record the figures in the PR.
10. **Integration test.** In `tests/integration/mrp-run-api.test.ts`: an intermediate material and two locations of its own, sets L1 Buy (minimum 10, multiple 5) and L2 Make (minimum 0, multiple 1), and an order of 3 at each, due on a fixed day offset inside the horizon. Run MRP, read the latest run filtered by the material, and assert L1's `proposals` `[{ kind: "purchase-requisition", quantity: "10.000000", needDate }]` with `projectedAfter` "7.000000" that day, and L2's production order of "3.000000" with "0.000000". In `tests/integration/mrp-report.test.ts`, add one test with its own Buy pair (minimum 10, multiple 5, an order of 3) that filters the MRP page to that pair and reads "Projected after proposals" as 7 on the order's day, beside "Projected before proposals" of −3. Run `npm run test:integration -- tests/integration/mrp-run-api.test.ts tests/integration/mrp-report.test.ts`, plus `smoke.test.ts` for the migration count.
11. **Copy, docs, catalogue.**
    - The help paragraph in EN and PL (UI/UX).
    - `BACKWARD_COMPATIBILITY.md`: the additive `proposals` field and the two figures.
    - `.ai/docs/engineering-standards.md`: an MRP bullet. `sizing/` is the only place a target becomes a requirement (through `safetyGap`), the lot rule is minimum-then-multiple, and sizing runs after transfers and re-projects through `projectBuckets`.
    - `CPG-acceptance.md`: the Evidence lines of MAT-016, MAT-025, MAT-026, MRP-009, MRP-030, MRP-032, MRP-033, MRP-045, DEM-023 and TRF-018. A status moves only when every clause, channel included, is asserted (lesson 2026-10-21).
    - Move this spec to `implemented/` with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

Implemented on #313, branched from `main` (the spec PR #312 stays design-only), as written:
- `packages/core/src/domain/mrp/sizing/`: `lot-quantity.ts` and `size-proposals.ts`, wired last in `planMrp`. `MrpProposal` carries `kind`, `needDate`, `date` and `leadTimeDays`, and `MRP_PROPOSAL_KINDS` is the closed kind list. `roundUpToMultiple` moved to `domain/quantities/decimal.ts`.
- `services/mrp/snapshot/planning-parameters.ts` reads every set in one partial read. `readCodes` adds the materials' type.
- `MrpRecommendation` (`db/src/entities/mrp/`, migration `Migration20261101053705_mrp_recommendations`) has a cascading run reference. A test deletes a run with plain SQL under deferred foreign keys, as a previous image's Test reset would.
- `MrpRunService` writes recommendations in the same 500-row chunks as the daily rows. `latest()` lists each plan's `proposals` through one read, pinned in `mrp-report-reads.test.ts`, which seeks `(tenant_code, run_id, material)` with no sort.

One deviation, in the benchmark (step 9). The seeded worst-case set (minimum 0, multiple 0.000001) proposes on only about a tenth of each material's days: the fixture's stock and receipts keep most balances above target. A second measurement therefore adds an Open line of 1,000 per material per horizon day, which forces a proposal on every day but, where overdue receipts land, today. The budgets are unchanged. Fastest of three, run alone:

| Run | Daily rows | Recommendations | Run | Longest stall |
|---|---|---|---|---|
| Realistic | 3,870 | 378 | 210 ms | 34 ms |
| Realistic, worst case | 3,240 | 2,700 | 257 ms | 35 ms |
| Ten times | 39,330 | 3,342 | 2,162 ms | 96 ms |
| Ten times, worst case | 32,940 | 26,969 | 2,684 ms | 127 ms |

Every #278 acceptance criterion has its own test in `plan-mrp.test.ts`. `CPG-acceptance.md` cites them in the rows' Evidence lines. MAT-025, MAT-026, MRP-009, MRP-030, MRP-032, MRP-033, MRP-045, DEM-023 and TRF-018 move from "Not executed" to "Partially verified": they are "Both"-channel scenarios, and no screen lists proposals yet (E19-S01). TRF-018's automatic-creation half is E19-S03.

