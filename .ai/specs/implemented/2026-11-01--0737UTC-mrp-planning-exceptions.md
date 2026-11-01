# MRP planning exceptions: missing planning parameters, missing BOM and invalid unit conversion, with no guessed proposal

**Status:** implemented
**Created:** 2026-11-01 07:37 UTC
**Issue:** #280 (E16-S03, epic #268) · **Depends on:** MRP replenishment proposals (`implemented/2026-10-31--2054UTC-mrp-replenishment-proposals.md`, #278), MRP runs and the snapshot loader (`implemented/2026-10-27--0556UTC-mrp-runs.md`, #274), production and transfer supply (`implemented/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`, #277), the last MRP report (`implemented/2026-10-31--0907UTC-mrp-report.md`, #284) · **Design authority:** `.ai/specs/product-brief.md` (R02, R03, R04, R10, D04), `research/CPG-prd001.pdf` §04 "Parameters/precision" and "Invocation", `research/CPG-prd-datamodel.pdf` ("MRP recommendation / exception"), `research/CPG-acceptance.md` MAT-017, MAT-023, MRP-033, MRP-034, MRP-035, MRP-036, RUN-016

## 📝 TLDR

Today a run handles bad planning data in one of three ways:

- a pair with no planning parameter set, or a raw material whose stored set says Make, silently gets no proposal;
- a Make pair is proposed production whether a BOM could make it or not;
- a stored quantity, factor or date that doesn't read correctly makes the whole run fail.

After this change three exceptions are raised, each with a stable code, structured `params` and a fixed message: Missing Planning Parameters, Missing BOM and Invalid UoM Conversion. A pair with one of them gets no proposal. Its projection is still shown, built from its readable data, and every unrelated material is planned as if the failing one were absent. A run stores all its exceptions beside its proposals, #277's Insufficient Transfer Stock included, and the latest-run API lists them per plan. Listing them on screen is E18-S03 (#286).

## 📝 Problem Statement

PRD §04 "Parameters/precision" says missing or invalid data creates an MRP exception, no defaults are guessed, and unrelated materials still plan. #278 left three gaps, each a guess or a crash:

- **Silent absence.** `sizeProposals` returns `[]` for a raw Make set, and `planMrp` skips a pair with no set. Nothing tells the planner why a shortage has no proposal (MAT-017, MRP-034, MRP-033's exception half).
- **A guessed Make.** A Make pair is proposed a production order even when no active BOM's current revision is valid on its date. `resolveProductionOptions` would then refuse that proposal with `PRODUCTION_NO_USABLE_BOM` when E19-S01 accepts it (MRP-035).
- **One bad row fails every material.** Every snapshot seam reads `parseDecimal(text)!` and indexes buckets by the stored date. Corrupt text written around the services, by a legacy import or a hand edit, puts a `null` or an `undefined` day into the engine, and the run throws for the whole tenant (MRP-036, MAT-023's MRP half).
- **Exceptions vanish.** `MrpResult.exceptions` has carried Insufficient Transfer Stock since #277, but the run stores none of it. E18-S03 needs the exceptions stored, and the issue's last criterion asks that two runs on the same data store the same exceptions in the same order.

## Resolved assumptions (autonomous defaults)

These answer the issue's three open questions (Q1–Q3) and the gaps between its notes and the code, each with the most reversible choice. A fresh-context review shaped Q2, Q4, Q5 and Q6. The one schema change is a new table (Q6). The one contract change is an additive field on each plan in the latest-run API (Q7).

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | Which pairs get Missing Planning Parameters? | Every planned pair whose set is **stored but unusable** (Q5), whatever its need. A pair with **no set** only when it has a positive net need: some day whose balance before proposals is below that day's safety target (`safetyGap > 0`; the target is zero when none is set). `params.date` is the first such day, and is absent when the pair has no need. | The issue's proposal for the absent set: a pair with stock and no demand needs no parameters, and raising one there is noise. A stored set that is wrong is a defect in the data whether it is needed today or not (MRP-033's "reported", with no condition), just as Invalid UoM is. |
| Q2 | Which stored records does the Invalid UoM Conversion check cover? | Every row the snapshot already reads, after its own date cut-off. Each base-quantity text it uses must parse with `parseDecimal`, each date it uses must pass `isCalendarDate`, and where the row stores a factor (`numerator`/`denominator`: order lines, requisitions, purchase-order lines, production orders, transfers, BOM lines) both must parse and be above zero. The `MaterialConversion` table is not read, because MRP never converts. The issue's "conversion with denominator 0" is the factor stored on such a row. Planning parameter sets are checked too, but a bad set is Missing Planning Parameters (Q5). | The issue's proposal. MRP computes in base units only, so the factor behind a stored quantity is the conversion a run depends on. A corrupt date fails the run exactly as a corrupt quantity does. Reading the conversions table would add a read and flag materials whose planning data is sound. |
| Q3 | Which date makes a BOM valid for Missing BOM? | The proposal's `needDate`, which is its planned finish until E16-S02 back-schedules. A Make pair with any sized proposal that has no eligible BOM on its `needDate` gets Missing BOM, dated at the first such proposal, and **no proposals at all**. Eligible: an active `Bom` of the output whose current revision has `validFrom ≤ date ≤ validThrough` (open-ended when `null`). Inactive components are E17-S02's (LFC-026). | The issue's proposal, so an accepted proposal passes the production order's own check. "No proposal" for the whole pair matches the issue's "none of them gets a proposal" and never leaves a partial plan sized against an assumed BOM. E17-S02 chooses a BOM per proposal and can narrow this. |
| Q4 | How far does an unreadable row reach, and which exception wins? | **Invalid UoM Conversion is per material.** A row that can't be read is left out, and every planned pair of each material it names gets the exception at every location, needed or not. A production order names its output and its components; a transfer, its material. Each pair then has at most one of the three, checked in order: Invalid UoM Conversion, Missing Planning Parameters, Missing BOM. Insufficient Transfer Stock is independent. | The issue says "that material gets an Invalid UoM Conversion exception". It is also the only scope that keeps isolation simple: transfers check a source's balance against later transfers, so a dropped row at one site changes other sites of the same material (review finding). An unreadable row makes the figures incomplete, so nothing after it can be trusted. Without a usable set, Make or Buy is unknown, so a BOM can't be missing. |
| Q5 | Is a stored raw Make set, or a set with bad lot data, Missing Planning Parameters? | Yes. A set is **usable** when it exists, `isProcurementAllowed(materialType, procurement)`, its minimum parses, and its lot multiple parses and is above zero. `params.reason` is `no-set`, `raw-make` or `invalid-set`. | MAT-014 and the validators refuse both at entry, so either can only be legacy data. MRP-034 calls absent lot data missing parameters. The PRD's exception list (E18-S03) has no separate kind. `reason` tells the admin which record to fix. |
| Q6 | Where does the run store its exceptions? | A new tenant-owned table, `MrpRunException` (`mrp_run_exception`), one row per exception, with these columns: run (FK, cascade on delete), `position` (its index in `MrpResult.exceptions`), `code` (a string, **not** an enum), `material`, `location`, `date` (nullable) and `details` (JSON of the code's other params, nullable). Every code is stored, Insufficient Transfer Stock included. Only the latest run keeps its rows; they are deleted with its daily rows and recommendations, and the Test reset clears them through its metadata sweep. | It is #278's `MrpRecommendation` again, created by an additive `create table` migration. A `p.enum` becomes a SQLite `CHECK`, so each code E17 adds would rebuild the table (lesson 2026-10-23). A string column lets core own the list. JSON `details` holds E17-S02's rejected BOMs later. The name avoids a clash with core's `MrpException` type. |
| Q7 | API shape? | Each plan of `GET …/mrp/runs/latest` gains `exceptions: { code, message, params }[]`, in run order. `params` holds strings only: `material`, `location`, `date` when the exception has one, and the code's extras. Missing Planning Parameters adds `reason`. Invalid UoM Conversion adds `record` and `document` (Q8). Insufficient Transfer Stock adds `transfer`, `destination`, `planned` and `available` (six-decimal texts). A transfer's exception sits on its source's plan. A code this image doesn't know, written by a newer one before a rollback, is listed with `MRP_EXCEPTION_FALLBACK_MESSAGE`. | Mirroring `proposals` keeps paging, the filters and `MRP_RUN_SUPERSEDED` unchanged, and every exception names a planned pair. It is the `AppError` refusal shape screens already translate by code and params (lesson 2026-10-23). |
| Q8 | Does Invalid UoM point at the bad record? | Yes: `record` is its kind (`stock-balance`, `customer-order-line`, `forecast`, `safety-stock-target`, `purchase-requisition`, `purchase-order-line`, `production-order`, `bom-line`, `transfer`), and `document` is its business ID when it has one: the order, requisition, transfer or BOM code, with `/position` for a line. When a material has several bad rows, it names the first by `record`, then `document`. | "The admin fixes the master data", and corrupt rows are, by definition, invisible on the screens that refuse them. The loader already holds these IDs, so naming the row costs nothing now and avoids a later contract change. |
| Q9 | RUN-016: how is B's proposal "marked executable"? | Every entry of `MrpResult.proposals` is executable; this story adds no flag. E17-S03's provisional plans live apart, never in `proposals`. The engine has no mode, so a manual and an automatic run plan alike. The test asserts B's proposal beside A's Missing BOM in one result; E19-S03 asserts the batch. | No new surface. A flag that is always true would be dead weight under 100% coverage. |
| Q10 | The exception's discriminator? | `code`, with the API's SCREAMING_SNAKE values, exported from `domain/mrp/exceptions/codes.ts`. #277's in-memory `kind: "insufficient-transfer-stock"` becomes `code: "INSUFFICIENT_TRANSFER_STOCK"`. | One name per thing, in the repo's error-code style. The kind was never stored or sent, so renaming it breaks no contract. |
| Q11 | Exception order? | `MrpResult.exceptions` sorts through `compareCodes` by: material; location (a transfer's source); code, in a fixed rank (Invalid UoM, Missing Planning Parameters, Missing BOM, Insufficient Transfer Stock); date (none first); then transfer ID. | Deterministic whatever the snapshot's order (PRD §04 "Invocation"), and grouped by pair, as the API lists them. |
| Q12 | Where does the BOM eligibility rule live? | `domain/boms/bom-validity.ts`: `isRevisionValidOn({ validFrom, validThrough }, date)`. `resolveProductionOptions` reads current revisions without its two date terms and filters them with this rule, so MRP and the production dialog can't drift. | The issue's note. Each active BOM has one current revision, so filtering in code hydrates at most the output's BOMs. |
| Q13 | Does a screen change? | No. The MRP page and its help stay as they are. E18-S03 lists the exceptions on screen, translates them and adds their EN/PL texts. | The issue puts the report's exception list out of scope. |
| Q14 | Integration tests? | One, in `tests/integration/mrp-run-api.test.ts`. A material with an order and no set at one location, and a Make set with no BOM at another, are run and read back from the latest run, filtered by the material. The first gets `MISSING_PLANNING_PARAMETERS`, the second `MISSING_BOM`; neither has proposals, and both keep their demand in the buckets. Invalid UoM needs rows written around the services, so its proof is the service test on a real SQLite file. | Only the production image proves that the migration, the stored rows and the API meet. The issue's proposed `mrp-api.test.ts` already exists under this name. |

## 📝 Proposed Solution

```
domain/boms/
  bom-validity.ts            isRevisionValidOn                                  (new)
domain/mrp/
  mrp-inputs.ts              + boms: MrpBom[], unreadable: MrpUnreadableRow[]
  mrp-result.ts              MrpException gains three codes; kind → code
  exceptions/                                                                    (new folder)
    codes.ts                 the four codes, their fixed messages, their rank, the fallback
    compare-exceptions.ts    the Q11 order
  sizing/
    replenish-pair.ts        one pair's proposals or its one exception           (new)
    size-proposals.ts        loses its raw-Make guard to replenish-pair.ts
  plan-mrp.ts                replenishPair instead of sizeProposals; plans the unreadable pairs
  supply/transfers.ts        code instead of kind
services/mrp/snapshot/
  readable.ts                readQuantities, readableFactor, readableDates       (new)
  boms.ts                    readBoms                                            (new)
  every other seam           unreadable rows left out and reported, never `!`
services/mrp/
  mrp-run.service.ts         stores exceptions; latest() lists each plan's
  mrp-run-view.ts            + MrpExceptionView, MrpPlanView.exceptions
services/production-orders/
  production-recipes.ts      filters current revisions with isRevisionValidOn
db/entities/mrp/
  mrp-run-exception.entity.ts                                                    (new)
db/migrations/               + Migration…_mrp_run_exceptions                     (new)
```

**Alternatives considered.**
- *Fail the run on unreadable data.* Rejected: that is today's behaviour, and MRP-036 forbids it.
- *Default a missing set to Buy, or a corrupt factor to 1:1.* Rejected: MAT-017 and MAT-023 forbid guessing.
- *Invalid UoM per pair, spread along transfers.* Rejected (Q4). It is more precise, but it needs a fixed-point walk over the transfer graph: a dropped row changes a source's balance, which changes what later transfers deliver. Per material is what the issue asks, and it is trivially isolated, because no balance links two materials.
- *Drop only the Make proposals without an eligible BOM.* Rejected for now (Q3): the remaining proposals would be sized as if the dropped ones arrived.
- *A top-level `exceptions` list in the API.* Rejected (Q7): it needs its own paging and filters.

## 📝 Architecture

### Inputs (`mrp-inputs.ts`)

```ts
export interface MrpInputs {
  // …existing lists…
  /** E16-S03: the current revision of every active BOM, by output, for the Missing BOM check. */
  boms: readonly MrpBom[];
  /** E16-S03: every stored row the loader couldn't read, left out of the lists above. */
  unreadable: readonly MrpUnreadableRow[];
}

/** The validity of one active BOM's current revision (R04). */
export interface MrpBom { output: string; validFrom: string; validThrough: string | null }

/** A row that failed `snapshot/readable.ts`, at one pair it would feed. */
export interface MrpUnreadableRow extends MrpPair {
  record: MrpRecordKind | "planning-parameter-set";
  /** The business ID, `order/position` for a line; absent for a balance, a forecast or a target. */
  document?: string;
}
```

`MrpPair` is `projection/pairs.ts`'s. A row that feeds several pairs, like a production order and its components, gives one entry per pair. Each entry names a plan, as a stock row does, so a pair known only from a corrupt row is still planned from zero and carries its exception. A `planning-parameter-set` entry names no plan: parameters never do.

### Exceptions (`mrp-result.ts`, `exceptions/codes.ts`)

```ts
export const MRP_EXCEPTION_CODES = ["INVALID_UOM_CONVERSION", "MISSING_PLANNING_PARAMETERS", "MISSING_BOM", "INSUFFICIENT_TRANSFER_STOCK"] as const; // rank order (Q11)

export interface MrpInvalidUomConversion { code: "INVALID_UOM_CONVERSION"; material: string; location: string; record: string; document?: string }
export interface MrpMissingPlanningParameters { code: "MISSING_PLANNING_PARAMETERS"; material: string; location: string; date?: string; reason: "no-set" | "raw-make" | "invalid-set" }
export interface MrpMissingBom { code: "MISSING_BOM"; material: string; location: string; date: string }
// #277's MrpInsufficientTransferStock, with `code: "INSUFFICIENT_TRANSFER_STOCK"` instead of `kind`.
export type MrpException = MrpInvalidUomConversion | MrpMissingPlanningParameters | MrpMissingBom | MrpInsufficientTransferStock;
```

The fixed English messages live in `codes.ts` (`MRP_EXCEPTION_MESSAGES`, plus `MRP_EXCEPTION_FALLBACK_MESSAGE`). They say BOM, never recipe (`tests/api-messages-glossary.test.ts`):

- `INVALID_UOM_CONVERSION`: "A stored quantity, unit factor or date of this material isn't valid, so MRP proposes no supply for it."
- `MISSING_PLANNING_PARAMETERS`: "This material has no usable planning parameters at this location, so MRP proposes no supply for it there."
- `MISSING_BOM`: "This material is made at this location, but no active BOM has a current revision valid on the need date, so MRP proposes no production."
- `INSUFFICIENT_TRANSFER_STOCK`: "The source can't supply this transfer's undispatched quantity on its dispatch day, so only the available part is planned."
- Fallback: "MRP raised an exception for this material at this location."

### One pair (`sizing/replenish-pair.ts`)

```ts
export function replenishPair(
  pair: SizedPair,
  context: { unreadable: MrpUnreadableRow | undefined; parameters: MrpPlanningParameters | undefined; invalidSet: boolean; boms: readonly MrpBom[] },
): { proposals: MrpProposal[]; exception: MrpException | null }
```

1. If the material has an unreadable row (`unreadable`, the first for the material per Q8), the result is no proposals and `INVALID_UOM_CONVERSION`.
2. If the pair's set is stored but unusable (an `invalidSet` entry, or a set failing `isProcurementAllowed`), the result is no proposals and `MISSING_PLANNING_PARAMETERS` with `reason` `invalid-set` or `raw-make`. Its `date` is the first day with `safetyGap > 0`, when there is one.
3. If the pair has no set, a bucket with `safetyGap > 0` gives no proposals and `MISSING_PLANNING_PARAMETERS` with `reason: "no-set"`, dated at that bucket. Without one, nothing is raised.
4. Otherwise `sizeProposals(pair, parameters)` runs. For Make, if any proposal's `needDate` is covered by no BOM of the output (`isRevisionValidOn`), the result is no proposals and `MISSING_BOM`, dated at the first such proposal.
5. Otherwise the result is the proposals, with no exception.

`sizeProposals` stays the only place a target becomes a proposal. Its raw-Make guard moves into step 2, together with its test. The need check in steps 2 and 3 reuses `safetyGap` and creates no requirement.

### `planMrp`

`inputs.unreadable` names its plans through `pairOf` (except set entries) and is indexed twice. Rows go by material, keeping the first by `record`, then `document`. Set entries go by pair. In the sizing map, `replenishPair` replaces the direct `sizeProposals` call; its proposals fill `proposedReceipts` as today. `exceptions` is `[...pairExceptions, ...transfers.exceptions]`, sorted by `compareExceptions`.

Isolation holds by construction. No figure of one material depends on another's balance: component demand comes from the order's own quantity, and a transfer moves one material. Planning without a material's rows therefore leaves every other material's plans and proposals unchanged. The isolation tests use fixtures where none of A's rows names B; a production order of A that consumes B would name both.

### Snapshot loader

- `snapshot/readable.ts`:
  - `readQuantities(texts)` returns the parsed `bigint`s, or `null` when any text fails `parseDecimal`;
  - `readableFactor(numerator, denominator)` is true when both parse and are above zero;
  - `readableDates(texts)` is true when every text passes `isCalendarDate` (`validators/dates/calendar-date.schema.ts`).
- Every seam checks a row **after** its own date cut-off, so a corrupt row that would count nowhere flags nothing. A row that fails is left out, and one `MrpUnreadableRow` per pair it would feed is added to the collector `load` passes in. Seams add `numerator`/`denominator` to their partial `fields` where the row has them.

  | Row | Pairs it names |
  |---|---|
  | stock balance, forecast, safety target | its material at its location |
  | customer-order line, purchase-order line | its material at its order's location |
  | requisition | its material at its location |
  | production order (quantity, produced, abandoned, factor, both dates) | its output and every pinned component at its location; the order is left out |
  | BOM line of a pinned revision (quantity, factor) | the component at each pinning order's location; only the line is left out |
  | transfer (five quantities, factor, both dates) | its material at the source and at the destination |
  | planning parameter set (minimum, multiple above zero) | `record: "planning-parameter-set"`; the set is left out |

  A row whose date is corrupt can fail the seam's own cut-off comparison. Every seam's comparison is a string comparison, so such a row is either filtered out or reaches the check, and never throws.
- `snapshot/boms.ts`, `readBoms(em, codes)`, makes two partial reads. The first reads the active `Bom`s (`fields: ["output", "revision"]`). The second reads their current revisions in chunks of 100 BOMs, with `resolveProductionOptions`' `$or: [{ bom, number: bom.revision }]` shape and `fields: ["bom", "validFrom", "validThrough"]`, then yields. Its plan, and the production dialog's after step 1, must seek `bom_revision`'s `(bom_id, number)` unique index once per term (`MULTI-INDEX OR` / `SEARCH … (bom_id=? AND number=?)`), never `SCAN` the tenant's revisions through `tenant_code`. `mrp-report-reads.test.ts` pins it with the index name stripped (lesson 2026-10-31). If SQLite walks the tenant, fall back to one `bom: { $in: chunk }` read per chunk with `number` matched in code, measure it, and record the figures in the PR.

### Storage and the run

`MrpRunService.run` adds `nativeDelete(MrpRunException, {})` beside the other two deletes. It writes `result.exceptions` after the recommendations, through the same chunked `created()` writer:

- `position` is the exception's index;
- quantities go through `formatDecimal(…, { fixed: true })`;
- a transfer's source goes in `location`, and the code's other params go in `details`.

`latest()` reads the page's exceptions the way `proposalsOf` reads proposals, through the unique `(tenant, run, material, location, position)` index, ordered by those columns. Each row becomes `{ code, message, params }`, with the message from `MRP_EXCEPTION_MESSAGES` or the fallback. A run still writes only its own tables and its one audit entry (R10).

## 📝 Data Model

```ts
export const MrpRunException = defineEntity({
  name: "MrpRunException",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    run: () => p.manyToOne(MrpRun).deleteRule("cascade"),
    position: p.integer(),
    code: p.string().length(40),            // core's MRP_EXCEPTION_CODES; a string, so new codes need no rebuild
    material: p.string().length(8),
    location: p.string().length(8),         // a transfer's source
    date: p.string().length(10).nullable(), // none for INVALID_UOM_CONVERSION, and for an unneeded invalid set
    details: p.json<Record<string, string>>().nullable(),
  },
  uniques: [{ properties: ["tenant", "run", "material", "location", "position"] }],
});
```

The migration only creates `mrp_run_exception` with its indexes, and its `down()` drops the table. The FK cascade lets a Test reset run by the previous image commit, as explained in #278's Data Model.

## 📝 API Contracts

`GET /api/tenants/{tenant}/mrp/runs/latest` (additive): each plan adds `exceptions`, in run order:

```json
{ "code": "MISSING_PLANNING_PARAMETERS", "message": "This material has no usable planning parameters at this location, so MRP proposes no supply for it there.",
  "params": { "material": "00000042", "location": "00000003", "date": "2026-11-05", "reason": "no-set" } }
```

A plan with any exception other than Insufficient Transfer Stock has `proposals: []`. `BACKWARD_COMPATIBILITY.md` gets an "Additive since E16-S03" bullet. It lists the four codes, their params, the record kinds and the fixed messages, as protected texts.

## 📝 Edge Cases & Failure Scenarios

All with today fixed in the tests:

- **No set, demand (MAT-017).** An order of 5 on day 3 and no set give `MISSING_PLANNING_PARAMETERS` (`no-set`, day 3) and no proposal. Firm demand shows 5 and `projectedBefore` −5 from day 3, with `projectedAfter` equal to it.
- **No set, no need.** Stock 10 and an order of 4 raise nothing. **No set, target only:** a target of 10 above a stock of 6 raises on day 0.
- **Raw Make (MRP-033), and an invalid set.** Each is raised with `raw-make` or `invalid-set`, needed or not, with no production proposal. Without a need, the exception has no date. The cases cover a multiple of `0`, and a minimum that isn't a decimal.
- **Isolation (MRP-034, MRP-035, MRP-036).** B's plans and proposals are deep-equal to those of a run without A's rows. None of A's rows names B.
- **Missing BOM (MRP-035).** Each of these Make variants raises `MISSING_BOM` at the first proposal's date, with no proposal:
  - no BOM;
  - only inactive BOMs;
  - a current revision that ends before the need;
  - a current revision that starts after it.

  A non-current revision valid on the date counts for nothing, and the loader never reads it. A BOM valid on every proposal date leaves the proposals unchanged. A BOM valid for the first proposal but not a later one gives no proposals, dated at the later one. A Buy pair with no BOM is proposed as before.
- **Invalid UoM (MRP-036, MAT-023).** Each corrupt shape raises `INVALID_UOM_CONVERSION` on every planned pair of each material it names, needed or not, with no proposal, `record` and `document` set. The shapes:
  - an unparseable quantity;
  - a negative text (`parseDecimal` refuses a sign);
  - a denominator of `0`;
  - a corrupt date;
  - a production order whose `produced` is corrupt, which flags its output and its components.

  The material's pairs are planned from their readable rows. A pair known only from a corrupt row is planned from zero. A corrupt Open line due after the cut-off flags nothing.
- **Material-wide.** A corrupt stock row at S, with an open transfer S→D, flags the material at S and at D, and neither gets a proposal.
- **RUN-016.** A's Missing BOM and B's Buy proposal are in one result, with B's proposal in `proposals`.
- **Order.** Within one pair, Invalid UoM wins. Across the run, Q11's order holds. A shuffled snapshot gives a deep-equal `exceptions`, and two runs on the same data store equal rows in equal positions.
- **Transfer exceptions stored.** #277's case is now stored and listed on the source's plan, with `planned` and `available` as six-decimal texts.
- **Unknown code.** A stored row with a code core doesn't list is served with the fallback message.
- **Rerun and Test reset.** The next run replaces the exceptions and the reset clears them, as for recommendations.
- **The production dialog.** `resolveProductionOptions`' existing tests stay green after the extraction, including revisions outside their window.

## 📝 Risks & Impact Review

- **Schema.** One new table, additive; rollback is the migration's `down()`. During a deploy overlap:
  - an old container's run doesn't delete exception rows, but the API reads them by run, and the next new run deletes them all;
  - an old container's Test reset cascades;
  - after a rollback, an older image reading a newer image's code serves the fallback message.
- **Realistic dataset.** Its seed gives every supply pair a set and every made output an open-ended active BOM, and its factors come from `formatDecimal`. A run may still raise Missing Planning Parameters where demand meets a pair without a set. Step 9 records what a realistic run raises in the PR. The generator is not changed: such exceptions are true statements about the data, and changing it would move every QA fixture.
- **Run time.** The snapshot adds two BOM reads and a few partial fields, and the engine a per-pair check. The run writes at most one exception per pair, plus the transfer ones: far fewer rows than the 90 daily rows each pair writes. `mrp-run-timing.test.ts` keeps its budgets and prints the exception count.
- **Migration counts.** Update the lists in `orm.test.ts` and `core/src/database.test.ts`, the counts in `system-status.service.test.ts` and `smoke.test.ts`, and add one more `down()` to each rollback-by-count test (lesson 2026-10-23).
- **Protected texts.** The five messages become API texts. They are listed in `BACKWARD_COMPATIBILITY.md` and kept on exported constants (lesson 2026-10-25).

## 📝 Decisions in play

- R02: raw is Buy-only, so a raw Make set is Missing Planning Parameters.
- R03: quantities are exact six-decimal values, never a 1:1 or zero guess.
- R04: only a current, date-valid revision is a BOM to make with.
- R10: planning writes no document.
- D04: the simplest consistent behaviour (Q1, Q3, Q4).

None is superseded.

## 📋 Phasing

One phase, one PR. It holds:

- the exception codes and the per-pair decision;
- the readable loader, the BOM read and its shared validity rule;
- the new table and its migration, and the run's write and read;
- an API integration test and the docs.

No screen changes.

## 📋 Implementation Plan

1. **BOM predicate.** Add `domain/boms/bom-validity.ts`, with tests for a date inside the window, both edges, an open-ended window, a date before and a date after. `resolveProductionOptions` drops its two date terms and filters with the predicate. Its existing tests stay green, and its revision read's plan is pinned.
2. **Codes and types.**
   - Add `exceptions/codes.ts` (codes, messages, rank and fallback) and `compare-exceptions.ts`, with tests.
   - Widen `MrpException`, and rename #277's `kind` to `code` in `transfers.ts` and its tests.
   - Add `MrpInputs.boms` and `unreadable`, passing `[]` from `load` and every fixture so the suite stays green.
3. **Per pair.** Add `sizing/replenish-pair.ts`, and move the raw-Make guard and its test out of `size-proposals.ts`. Its tests cover every branch, in Q4's order:
   - the first date found by the need check;
   - each of the three reasons, needed or not;
   - the four Missing BOM variants, and the valid-then-invalid case;
   - Buy without a BOM;
   - precedence.
4. **`planMrp`.** Wire `replenishPair`, plan the unreadable pairs, and merge and sort the exceptions. `plan-mrp.test.ts` gets one test per criterion, asserting on `planMrp`'s result:
   - MAT-017;
   - MRP-034, MRP-035 and MRP-036's engine half, each run with and without A;
   - MRP-033's exception;
   - the material-wide transfer case;
   - RUN-016;
   - the Q11 order, and a shuffled snapshot.
5. **Loader.** Add `snapshot/readable.ts` with tests. Every seam checks, leaves out and reports rows as the table says, and the new `snapshot/boms.ts` reads the BOMs. Tests in `mrp-snapshot.service.test.ts` run on a real SQLite file:
   - Write each corrupt shape around the services: `nativeUpdate` for every table but `bom_component`, which refuses updates (`noUpdateTriggers`), so insert a corrupt line into a new revision instead.
   - For each shape, assert that the row is left out, that its pairs are in `unreadable` with `record` and `document`, and that every other input is unchanged.
   - A corrupt row past a cut-off is left out with no entry.
   - Only active BOMs' current revisions are read.
   - The empty tenant gives `boms: []` and `unreadable: []`.

   Pin the BOM reads' plans in `mrp-report-reads.test.ts`.
6. **Table.**
   - Add the `MrpRunException` entity, register it, and add it to `db/src/index.test.ts`'s lists.
   - Run `npm run db:migration:create -- mrp_run_exceptions` and review the SQL: it only creates the table, with no `CHECK` on `code` and `on delete cascade` on `run_id`.
   - Update the migration lists and counts.
   - Add an up/down test, and the plain-SQL delete-cascade test #278 added for recommendations.
7. **Run write and read.** `run()` deletes and writes the exceptions, `latest()` lists them per plan, and `mrp-run-view.ts` gains `MrpExceptionView` and `MrpPlanView.exceptions`. Tests in `mrp-run.service.test.ts`:
   - MRP-036 end to end: a corrupt order line written around the service, a run that completes, A's `INVALID_UOM_CONVERSION` with its record stored and listed, and B's proposals unchanged;
   - the next run replaces the rows;
   - two runs store equal exceptions in equal positions;
   - a transfer exception sits on its source's plan;
   - a stored unknown code gets the fallback message;
   - the filters and a page edge;
   - the "changes nothing else" table list;
   - the Test reset clears them.

   Pin the read's plan. Update the route test, and add `exceptions: []` to the app's `MrpPlanView` literals (`mrp/page.test.tsx`, `mrp-report.test.tsx`).
8. **Integration test** (Q14) in `tests/integration/mrp-run-api.test.ts`. Run it together with `smoke.test.ts`, for the migration count.
9. **Realistic dataset and benchmark.** In `mrp-run-timing.test.ts`, print the exception count beside the timings and keep the budgets. Run MRP once on the realistic dataset and record its exceptions by code in the PR (Risks).
10. **Docs and catalogue.**
    - `BACKWARD_COMPATIBILITY.md`: the additive `exceptions` field, the codes, the record kinds and the protected messages.
    - `.ai/docs/engineering-standards.md`: an MRP bullet. `exceptions/` holds the codes and their order, and `replenishPair` is the one per-pair decision. Invalid UoM is per material. A snapshot seam never `!`s a parse. `isRevisionValidOn` is shared with the production dialog.
    - `CPG-acceptance.md`: the Evidence lines of MAT-017, MAT-023, MRP-033, MRP-034, MRP-035, MRP-036 and RUN-016. A status moves only when every clause, channel included, is asserted (lesson 2026-10-21).
    - Move this spec to `implemented/`, with implementation notes.

Each step leaves the suite green. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%) and `npm run build`.

## Implementation notes

Implemented on #316 (spec PR #314). Where the build departs from the text above:

- **The code column is `exception_code`, not `code`** (Data Model). In a tenant-owned table, `code` means a business ID: the Test reset's sequence test collects every such table, and it took the new one for a sequence. The entity property is `exceptionCode`, and the API still says `code`.
- **The BOM revision read walks the tenant's revisions in SQLite** (Snapshot loader). Without ANALYZE statistics, the `$or: [{ bom, number }]` read seeks `bom_revision` through `bom_revision_tenant_code_index` and tests the OR terms per row. The production dialog's existing read gets the same plan. The `$in` fallback plans the same way (lesson 2026-10-31), so it buys nothing. The walk happens in SQLite over about one row per BOM change and hydrates only current revisions. `mrp-snapshot.service.test.ts` pins that plan rather than the hoped-for `MULTI-INDEX OR`. At ten times the realistic dataset, the run stays within its budgets: 2,544 ms with a 113 ms longest stall, and 3,180 ms with 143 ms in the worst case for proposals. The dialog's read keeps its own shape, now without the date terms, and its plan is not pinned separately.
- **`document` formats** (Q8). A line is `order/position`, with the position as stored: customer-order lines count from 0, purchase-order lines from 1. A BOM line is `BOM/revision/position`, looked up only when a pinned revision has a line that can't be read.
- **Plan tests.** The BOM reads are pinned in `mrp-snapshot.service.test.ts` beside the other loader reads. The exceptions read is pinned in `mrp-report-reads.test.ts`, beside the proposals read.
- **`MRP_RECORD_KINDS`** is a type union (`MrpRecordKind`), not a runtime list. Nothing reads it at run time.
- **Realistic dataset** (Risks). A realistic Test run raises no exception (`test-reset.service.test.ts` prints `[]`). The benchmark's synthetic fixture raises 10 exceptions at the realistic size and 87 at ten times, from transfer destinations without a set.
- **Code review (#316)** brought three refinements:
  - A material with an unreadable row reports only Invalid UoM Conversion, never Insufficient Transfer Stock. That exception's `available` would come from the incomplete balance, the guess Q4's reason rules out. Q4's "independent" now holds only for materials whose rows all read.
  - A row whose cut-off date isn't a real day is no longer dropped by the string comparison (`beforeCutOff`). It reaches `readRow` and is reported.
  - A current BOM revision whose validity dates aren't real days is left out, so it covers no date.
- **Known limits**, filed as #321:
  - Forecasts and safety targets are cut off by a SQL date range, so a corrupt date that sorts outside the range is not read, and is not reported either.
  - The BOM revision read walks the tenant's revisions once per chunk of 100 BOMs.
- **Migration** `Migration20261101080923_mrp_run_exceptions` only creates the table, with no `CHECK` and `on delete cascade` on `run_id`. While updating the counts, the rollback test's table list gained `mrp_recommendation` and `mrp_run_exception`. Without them, its "dropped on the way down" checks could not fail.

