# MRP end-to-end journeys: twelve cross-domain journeys run from demand to MRP to documents to postings, through the screens and the bearer API, and core planning needs no price or accounting field

**Status:** ready
**Created:** 2026-11-03 06:26 UTC
**Issue:** #291 (E20-S02, epic #272) · **Depends on:** every slice 3 MRP story (E14-S01 … E19-S03, #273–#289), the BOM import (#27), the stock import (#81), the stock and completion reversals (#91, #92), all closed · **Related:** the slice 3 closing pass (E20-S03, #292), the E2E-010 Prod half (#189), UX-023's navigation half (#192) · **Design authority:** `.ai/specs/product-brief.md` ("Key flows", R07, R09, R10, D01, D08, N01, N02), `research/CPG-prd001.pdf` §03 conceptual flow, §04, §07, `research/CPG-acceptance.md` E2E-001, 002, 003, 005, 007, 008, 010, 012, 015, 016, 019, 021 and UX-023

## 📝 TLDR

Each slice 3 story tested its own part of MRP, but no test runs the chain the product promises in one tenant. That chain goes from demand and safety targets to a manual or automatic MRP run, then to a requisition, purchase order or production order, then a receipt or completion, then a goods issue. This change adds **test files only**:

- **Four integration files** run the twelve cross-domain journeys of the acceptance catalogue against the production image. Each journey runs MRP and accepts at least one proposal on the screen, and reads every outcome back through the bearer API (R07).
- **A shared journey helper** checks every request and response a journey sends or reads for price, cost, currency, invoice, tax, payment or accounting fields, and checks the MRP screen for those words. This proves UX-023's planning half (N01).
- **`test-reset-api.test.ts`** gains E2E-010's MRP half.
- **`test-reset-realistic.test.ts`** runs MRP on the screen over the realistic Test dataset within E14-S02's budget, opens the report, probes `/up` during the run and keeps viewport screenshots as showcase evidence (D01).

The catalogue then moves eleven journeys and UX-023 to Passed (automated), and adds the MRP half to E2E-010's evidence. No product code changes. A defect a journey exposes is filed as a bug against the story that owns the behaviour.

## 📝 Problem Statement

The owner's goal is a working MVP shown at the training (D01), MRP included. The brief's "Key flows" and PRD §03/§04 describe one chain: demand and targets → MRP → documents → postings → stock and audit. Today that chain is proven only in pieces:

- **E2E-001, 002, 003, 005, 007, 008, 012, 016, 019 and 021 are Not executed.** E2E-010 and E2E-015 are Partially verified, waiting only on MRP (#189, #191). UX-023 is Partially verified: `navigation.test.ts` proves no finance entry in the sidebar or the help, but "core planning works without them" waits on MRP (#192).
- **Every MRP integration file starts from its own pair and stops at the document.** `mrp-accept*.test.ts` and `mrp-automatic*.test.ts` create a requisition or a production order and assert it. No file posts the receipt, the completion or the goods issue that follows, then runs MRP again on the result. The seams between stories, such as a reversed receipt's supply or a reopened production order, are asserted by unit tests at best.
- **MRP has run on the realistic Test dataset only through the API** (`test-reset-realistic.test.ts`). The screen a planner uses at the showcase has never run it on realistic data, and nothing keeps a picture of it.

## Resolved assumptions (autonomous defaults)

The issue's open questions, plus the gaps between its notes and the shipped code. Each one takes the most reversible choice. Nothing here changes a contract, the schema or product behaviour.

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | How are the twelve journeys laid out in files? | **Four new files plus two extended ones, grouped by tenant and run mode:**<br>• `e2e-supply-chain.test.ts` (Prod, manual): E2E-001, E2E-015.<br>• `e2e-planning.test.ts` (Prod, manual): E2E-002, E2E-003, E2E-016.<br>• `e2e-corrections.test.ts` (Prod, manual): E2E-007, E2E-008, E2E-012, E2E-019.<br>• `e2e-automatic.test.ts` (Test, reset before and after): E2E-005, E2E-021.<br>• `test-reset-api.test.ts`: E2E-010's MRP half, inside its existing test.<br>• `test-reset-realistic.test.ts`: the realistic screen run.<br>• Shared code goes in `tests/integration/journeys.ts`, which is not a test file. | Each file signs in once and creates its token once, which keeps the cost per journey low. A file stays at about 300–450 lines, as the existing MRP files are. The grouping keeps automatic runs, which create documents across the whole tenant, apart from the manual ones. E2E-010 and the realistic run belong in the files that already own their resets (lessons 2026-10-24 and 2026-10-22). |
| Q2 | Where do the automatic journeys run, so that their documents for other files' materials can't break later files? (issue open question) | **In Test.** `e2e-automatic.test.ts` resets Test to its startup dataset in `beforeAll` and again in `afterAll`, through `untilOk`. It asserts only on its own materials. | The issue's proposed default, and the pattern `mrp-automatic-api.test.ts` already uses (#289 Q12). An automatic run creates a document for every executable proposal in the tenant. In Test, the closing reset removes them. In Prod they would stay, and would move other files' counts (lesson 2026-11-02, #288's Prod growth). |
| Q3 | Prod journeys share Prod with every other file. How do they stay isolated? | **Manual runs only, and every journey owns its masters.** Each journey creates its own materials, location, supplier and customer through the API, named with the file's prefix (`e2e-sc`, `e2e-pl`, `e2e-co`). It reads MRP results with `?material=&location=` for its own pairs only. It counts documents by its own material, across every page (`allPages`). | A manual run in Prod creates nothing (RUN-003), so other files' materials only add pairs to the run, never documents. Own pairs at an own location keep the projection free of other files' stock and demand (lesson 2026-10-22, "assert only on own records"). |
| Q4 | Which steps go through the screens? (R07, "at least its MRP run and one acceptance") | **Per journey, one MRP run and one acceptance go through the screen as a normal user, as the table under "Proposed Solution" lists. Everything else goes through that user's bearer token**, the admin's for admin-only masters. In each manual journey the screen run is the one whose proposal is accepted on screen, and the journey's documents start from that accepted proposal, never from a document made directly. Each automatic journey (E2E-005, E2E-021) chooses **Automatic** in the Run MRP dialog for one of its runs: that screen run *is* the acceptance, since an automatic run has no Accept click. The catalogue Evidence states this reading openly. E2E-010's scenario has no acceptance: its Prod run goes through the screen. Each screen step is then read back through the API, and must give the same result: the run's `channel: "ui"`, the proposal's `document`, the document's `mrpRun`. | The issue's criterion, applied with the fewest browser steps, since browser steps are what costs suite time. The journey's chain is in the API steps, and the screen steps prove the same chain is reachable by a planner. Driving every step through the screen would roughly triple each journey's time with no new assertion. |
| Q5 | How is UX-023's planning half ("none needs a price, currency, invoice or accounting field, and the MRP screens and API add no such entry") proven? | **By two checks in `journeys.ts`, which every journey goes through, with one word list.** The words are price, pricing, cost, costing, currency, invoice, invoicing, accounting, VAT, tax, payment and refund, singular or plural, in any case (N01).<br>• **Request and response bodies.** The journey's API client walks every request body it sends and every answer it reads, keys at any depth. It splits each key at its camelCase, kebab and snake boundaries, and fails on a part that is one of the words, naming the path.<br>• **The MRP screen.** At each screen run and acceptance, the visible text of the MRP page (`main`), the Run MRP dialog and the accept confirmation must contain none of the words as a whole word.<br>Each journey file ends with a test that its clients checked many requests, so the guard can't silently be bypassed. | The catalogue's Then is about what planning *needs*: a journey that runs with no such field proves planning doesn't need one. The key walk also catches a field added later. Whole words, not substrings: `deactivated` must not read as "vat", `syntax` as "tax", or `account`, the run's user, as "accounting". |
| Q6 | E2E-005: how is the forecast reduced, and in which month? | **A forecast of 100 for the journey's Buy material at its own location, dated in the next calendar month, with no customer orders.** The first automatic run creates one requisition of 100. The forecast is then `PATCH`ed to 70, and a second automatic run follows. The assertions: the second run creates no document for the material; the requisition's `quantity`, `requiredDate` and `version` are unchanged; the plan's `excess` is `30.000000`, on the screen (`[data-mrp-excess]`) and through the API. | A forecast is consumed only by customer orders in its own month (D08). With none, all 100 is demand. Next month keeps the date inside the horizon and after any lead time on every day of the month. `excess` is the shipped measure of planned supply above need (#288). |
| Q7 | E2E-021: what does "a rerun makes the higher levels executable" mean? | **One level per rerun, as E2E-002 shows.** After R's purchase order and receipt, an automatic rerun creates I's production order, which is then executable. F stays provisional, since its input I is only planned, not on hand. The file then completes I, reruns automatically, and F's production order is created. | MRP never assumes not-yet-dependable output as supply (#283, E2E-002's Then). A rerun can make executable only the level whose inputs are on hand. Going up to F shows "higher levels" in the plural without inventing a rule. |
| Q8 | E2E-010's Given has "Prod … MRP results". What is compared? | **Inside the existing E2E-010 test, before its concurrent reset and receipt:**<br>• one Prod MRP run goes through the screen, as the normal user who then posts the receipt, and one Test MRP run goes through the API;<br>• the test snapshots Prod's whole `GET …/mrp/runs/latest`, every page (`?run=` with the run ID, `allPages`).<br>**After:** Prod's latest run, read the same way, equals the snapshot: the same `id`, `createdAt` and results on every page, even though the receipt posted in Prod. Test's latest answers 404 `MRP_RUN_NOT_FOUND`. The gap of a receipt running *during* the reset stays as #189 recorded it. | The issue scopes this story to E2E-010's MRP half, and E20-S03 brings the row to the owner. A run's stored results never change after the run (R10, #274 Q1), so a receipt posted afterwards must not alter them. |
| Q9 | The realistic screen run: what is the budget, and how is `/up` probed? (issue's last criterion) | **In `test-reset-realistic.test.ts`, after the realistic reset and before the automatic batch test, which adds documents to the dataset:**<br>• The admin opens `/admin/test/mrp` at 1280×800 and clicks Run MRP, keeping Manual.<br>• The test times the run from the submit click until the run card shows a new run ID, and prints that figure next to the existing API run's.<br>• It asserts the time is under **6 s**. That is a *tolerance*, not the budget itself: E14-S02's realistic budget of 1 s (`implemented/2026-10-27--0556UTC-mrp-runs.md`), times the CI factor 6 that `mrp-run-timing.test.ts` uses on a shared runner. The unit benchmark holds the 1 s budget itself, and the Evidence says so.<br>• A `GET /up` on a warm, reused connection, issued right after the click, must answer 200, and must answer before the run card shows the new ID. The API test in the same file (`upMs < runMs`) is the authoritative proof of the overlap.<br>• The report then opens for the dataset's first pair, with the days table shown.<br>• Viewport screenshots of the run card and of the report go to `$CPG_SHOWCASE_DIR`, when that is set. | The browser adds rendering to the run, so the image's loose factor applies, as it does in the existing automatic timing there. Screenshots stay out of git and CI artifacts (no workflow change). The implementation PR attaches the local run's captures as evidence. |
| Q10 | Suite time and shards. | **Measure, then rebalance only if needed.** The PR records each new file's local time and every shard's CI time. If any shard's integration step goes past **14 min** (its `timeout-minutes` is 20), the matrix goes from four to five shards, and `tests/ci-workflow.test.ts` is checked to still hold (it requires more than one shard, not a count). Today the slowest shard takes about 11 min (CI run 41521070098 on `main`). | Vitest shards by a hash of each file's path, so which shard a new file lands on is fixed but not chosen. A fifth shard is one line, and reversible. Adding it pre-emptively costs a runner on every PR. |
| Q11 | What if a journey exposes a defect? | **File a `bug` issue against the story that owns the behaviour, link it from the PR, and keep the journey test asserting the correct Then.** If the fix is small and inside the owning story's code, it ships in its own PR first. Otherwise only the failing clause moves into its own `it.fails` test, named after the bug number, and the rest of the journey stays a normal test. The catalogue row stays Not executed or Partially verified, naming the bug. | The issue says test-only, with defects fixed under bug issues. `it.fails` passes on *any* failure, so it is kept to the one clause, and can't hide a regression in the rest of the journey. It flips to red the day the bug is fixed, which prompts promoting the row. |
| Q12 | Which rows does the catalogue move? | **E2E-001, 002, 003, 005, 007, 008, 012, 015, 016, 019 and 021, and UX-023, to Passed (automated)**, each with an Evidence line that names the test and matches every clause of its Then to an `expect`. E2E-010 stays **Partially verified**: its Evidence gains the MRP half, and the during-the-reset gap stays named. The "Last updated" paragraph gains this story's entry. | The issue's catalogue note, and lesson 2026-10-21 ("cite a scenario only where a test asserts it"). |

## 📝 Proposed Solution

```
tests/integration/journeys.ts             shared journey helpers (new, not a test file)
tests/integration/e2e-supply-chain.test.ts   E2E-001, E2E-015            (Prod, manual)
tests/integration/e2e-planning.test.ts       E2E-002, E2E-003, E2E-016   (Prod, manual)
tests/integration/e2e-corrections.test.ts    E2E-007, E2E-008, E2E-012, E2E-019 (Prod, manual)
tests/integration/e2e-automatic.test.ts      E2E-005, E2E-021            (Test, reset before/after)
tests/integration/test-reset-api.test.ts     + E2E-010's MRP half in the existing test
tests/integration/test-reset-realistic.test.ts + the realistic screen run (D01)
.ai/specs/research/CPG-acceptance.md      12 rows promoted, E2E-010's evidence, "Last updated"
.github/workflows/ci.yml                  only if Q10's threshold is crossed
```

**`journeys.ts`** holds what every journey repeats, built on `callApi`, `allPages`, `openBrowser`, `signInAs` and `createToken`:

- `journeyApi(baseUrl, secret, tenant)`: `get`, `created` (POST, asserting 200), `patch`, and `generation` for Test. It runs Q5's key walk on every request body and every response `data`, and keeps a count of the requests it checked.
- `day(n)`, and `withinOneDay(scenario)`, as `mrp-accept-api.test.ts` has them: a run from an earlier day can't be accepted, so a journey that crosses midnight UTC runs again once.
- `runOnScreen(browser, baseUrl, tenant, { material, location, mode })`: opens the filtered MRP page, waits for the hydrated Run MRP button, chooses the mode, submits, and waits for a new `[data-mrp-field=id]` with the dialog gone. Returns the run ID, and checks the page for Q5's words.
- `acceptOnScreen(browser, kind)`: clicks the first shown `[data-mrp-accept]`, confirms ("Create requisition" or "Create production order"), and waits for `[data-mrp-document]`. Returns the document ID.
- `plan(api, material, location)`: the latest run's plan for one pair (`MrpPlanView`).
- `documentsOf(api, material)`: requisitions, purchase-order lines, production orders, goods receipts and completions for one material, read across every page. Used for E2E-002's exact per-step counts.
- `ledger(api, material, location)` and `auditOf(api, subjectType, subjectId)`.

**One journey, step by step: E2E-001.** The other journeys follow the same shape. Each assertion names the clause of the catalogue's Then it covers.

1. **Masters, admin token.** The test creates raw R (Buy, lead time 2 days) and finished F (Make, lead time 2 days), with a BOM of 1 R per F. It creates a location, a supplier and a customer, and a customer order for 10 F due `day(10)`.
2. **First MRP run, normal user on the screen.** R has an executable requisition proposal of 10. F is provisional (`plan.provisional`, blocker `no-feasible-bom`) and has no proposal. The user accepts R's proposal on the screen.
3. **Through the user's token.** The requisition is converted into a purchase order (`requisition` on the line), and a goods receipt of 10 is posted. R's stock is 10, and its ledger gains one `goods-receipt` movement.
4. **Second MRP run, through the API.** F now has an executable production-order proposal pinned to its BOM's revision 1. It is accepted, and a completion of 10 is posted with R's component line. R is 0 and F is 10, and the ledger has one `production-completion` posting.
5. **Shipping.** A shipment of 10 and a goods issue of 10 follow. F is 0. The customer order and its line are `completed`.
6. **Audit and ledger.** R's and F's ledgers hold exactly receipt +10, consumption −10, output +10 and issue −10. The tenant audit holds `goods-receipts.goods-receipt.posted`, `production-orders.production-completion.posted` and `goods-issues.goods-issue.posted` for these documents, each by the user on the right channel.

**Where each journey's screen steps and documents come from** (Q4). Every manual journey's documents start from the proposal accepted on the screen:

| Journey | Screen run (tenant, mode) | Accepted on the screen | Then through the API |
|---|---|---|---|
| E2E-001 | Prod, manual, run 1 | R's requisition | PO, receipt, run 2, F's order, completion, shipment, issue |
| E2E-002 | Prod, manual, run 1 | R's requisition | PO, receipt, runs 2–4, I's and F's orders, completions |
| E2E-003 | Prod, manual | F's production order (BOM B) | completion |
| E2E-005 | Test, **automatic**, run 1 (the run is the acceptance) | — | forecast edit, automatic run 2 |
| E2E-007 | Prod, manual, run 1 | R's requisition of 100 | PO of 100, receipt of 100, reversal, receipt of 80, run 2 |
| E2E-008 | Prod, manual, run 1 | M's requisition (Buy finished good) | PO, receipt, shipment, issue, correction +5, run 2 |
| E2E-012 | Prod, manual, run 1 | F's production order | completion with extra consumption, stock import, run 2 |
| E2E-015 | Prod, manual | F's production order (imported BOM) | — |
| E2E-016 | Prod, manual | the first dated requisition | — |
| E2E-019 | Prod, manual, run 1 | F's production order | completion, reversal, run 2 |
| E2E-021 | Test, **automatic**, run 1 (the run is the acceptance) | — | PO, receipt, automatic runs 2–3, I's completion |
| E2E-010 | Prod, manual (no acceptance in the scenario) | — | Test run, reset with concurrent receipt |

**The other journeys:**

- **E2E-002.** F ← I ← R, with no stock and a customer order for 10 F due `day(14)`.
  - Run 1, on the screen: R's requisition is the only proposal, and it is executable. I and F are provisional. For each provisional level, every bucket's `tentativeSupply`, `dependableSupply` and `proposedReceipts` is 0: MRP never assumes their output as supply.
  - R is procured and received. Run 2: I's production order is executable. F is still provisional, with zero supply in every bucket.
  - I is made and completed. Run 3: F's production order is executable. It is made and completed.
  - Run 4: none of the three has a proposal or a provisional plan.
  - After every step, the test reads exact document counts per material, across every page: requisitions, purchase-order lines, production orders, receipts and completions. For example: one requisition and no purchase order after the acceptance; one purchase-order line and one receipt after the receipt; one production order per level once accepted; one completion each. No step adds a second document for the same need.
- **E2E-003.** Two date-valid BOMs for F: A (priority 1, component CA with no stock) and B (priority 2, component CB on hand).
  - The proposal pins B, and its `rejectedBoms` holds A with `reason: "shortage"` and CA's exact required, available and shortage.
  - The same shortage shows on the screen under `[data-mrp-why-bom]`.
  - The accepted order's `bom` and `revision` are B and 1. After it is completed, the output and CB's consumption match B. CA's ledger is still empty.
- **E2E-005.** See Q6.
- **E2E-007.**
  - Run 1 proposes R's requisition of 100, which is accepted on the screen and converted into a purchase order of 100. A receipt of 100 is posted while only 80 arrived.
  - The receipt line's movement is reversed in full, and a receipt of 80 is posted.
  - Stock is 80 and the line's `received` is `80.000000`, with the order still Open.
  - Run 2 projects the remaining 20 as dependable supply on the line's planned date, and proposes nothing.
  - The ledger keeps the original +100, the −100 reversal and the +80, each with its source.
- **E2E-008.**
  - Buy finished good M: run 1's requisition is accepted on the screen and converted, then received. The customer order is shipped in full and Completed.
  - A positive correction of 5 follows, with the reason "Customer return".
  - The stock API reads exactly 5. Run 2's `buckets[0].projectedBefore` is exactly `5.000000`, with no demand or supply on day 0.
  - The order is still Completed.
  - The lists of shipments, goods issues, customer orders, receipts and requisitions are unchanged for M across the correction and the run, so there is no return document.
- **E2E-012.**
  - R starts at 100. Run 1's production order for 10 F (BOM: 1 R each) is accepted on the screen. Its completion consumes 12 R, 2 more than expected, leaving 88. A count finds 85.
  - The variance report for R is snapshotted. A stock workbook lists R at 85 and F at its current balance at the journey's location. The dry run shows R's movement as −3 and F unchanged. The commit follows.
  - Only R changes, by −3. A third pair of the journey, not listed, keeps its balance and ledger.
  - The variance report for R equals the snapshot, and the completion's movements remain in the ledger.
  - Run 2's `buckets[0].projectedBefore` for R is exactly 85.
- **E2E-015.**
  - A BOM for F is imported through a temporary Import Reference, dry run then commit, with its component on hand.
  - The run's Make proposal names the imported BOM at revision 1. It is accepted on the screen, and the production order pins that BOM and revision 1.
- **E2E-016.**
  - The setup:
    - stock of 4;
    - safety targets of 10 from `day(0)` and 30 from the first day of next month;
    - one customer order line of 20, five days after that date;
    - a lead time of 2 days.
  - The daily `safetyTarget` is 10 before that date and 30 from it. The gap `max(0, safetyTarget − projectedBefore)` is 6 on day 0, and 20 on the first day of next month.
  - The proposals, by need date, are: 6 on day 0, 20 on the first day of next month, and 20 on the order's date. Their sum, 46, equals the demand (20) plus the final target (30) less the stock (4), so customer demand is counted once.
- **E2E-019.**
  - F (BOM: 1 R each) has a customer order for 10 due `day(10)`, and R is on hand. Run 1's production order (planned finish `day(10)`) is accepted on the screen and completed. That consumes 10 R and produces 10 F.
  - The completion is reversed. The stock API reads F 0 and R restored, and the order is Open again (`productionStatus`), with `outstanding` 10.
  - Run 2:
    - F's day-0 `projectedBefore` is 0, so the reversed output is not physical stock.
    - The order's outstanding 10 is `dependableSupply` on its planned-finish bucket.
    - F has no proposal: the order covers the demand once.
  - F's ledger holds the completion's +10 and the reversal's −10, and nothing else.
- **E2E-021.** See Q7.
  - The first automatic run, on the screen, creates exactly one document for these materials, R's requisition. There are no production orders for F or I.
  - The screen and the API show the provisional F and I production orders, with dates, components and the `missing` shortage text. R's requisition is the only proposal of the hierarchy.
- **E2E-010.** See Q8.
- **The realistic run.** See Q9.

**Alternatives rejected.**

- *One file per journey.* That means twelve sign-ins and twelve tokens, and about 12 × 10 s of setup with no new assertion.
- *All journeys in Test after a reset.* The manual journeys are Prod journeys in the catalogue (E2E-001's "new Prod masters"), and a Test reset per file adds about 1–2 s each.
- *Driving every step through the screen.* See Q4.

## 📝 Edge Cases & Failure Scenarios

- **A journey crosses midnight UTC.** Acceptance refuses a run from an earlier day as stale (#287 Q7), so every run-then-accept journey runs inside `withinOneDay`, which runs it once more on the new day. The retry builds a new fixture instance with new masters, since the first attempt's documents would otherwise count as supply. A journey's records are local to its test, never a memoized fixture shared across tests, so `-t` on one test still works (lesson 2026-10-25).
- **Lead time and today.** Postings use today's business date only (R09). The journeys' demand is due at least `day(8)`, so every proposal's planned start is today or later, and no Late Supply mark disturbs the counts. E2E-016 asserts its dated proposals as they come, and doesn't depend on their absence.
- **Other files' Prod data.** A manual Prod run plans every pair of the tenant, which costs time but changes nothing for this file's pairs. Each journey owns its location, so other files' stock, transfers and orders never reach its projection.
- **The automatic batch fails on another material.** An automatic run fails as a whole if any candidate in the tenant can't be created (RUN-015). `e2e-automatic.test.ts` resets Test first, so only the startup dataset and its own records are candidates, as in `mrp-automatic-api.test.ts`.
- **A journey fails half-way.** Prod keeps its records, as every Prod file's do. They are uniquely named and never read by another file. Test is reset in `afterAll` whether or not the tests passed.
- **The realistic run is slower than 6 s on a loaded runner.** The test prints the figure (`process.stdout.write`) before asserting, so a failure shows the measurement. The bound is not raised to absorb contention (lesson 2026-11-02).

## 📝 Risks & Impact Review

- **Suite time.** Each journey costs roughly 10–25 s, two screen steps included. Four files, about 3–4 min in total, spread over the shards by path hash. Mitigation: Q10.
- **Flakiness.** Every screen step waits for something only the destination has: a new run ID, a document link, a closed dialog (lesson 2026-10-23). Rows are found by ID cell, never by row text (lesson 2026-11-02). `withinOneDay` covers midnight.
- **Prod growth.** Each pass of the suite adds about 40 Prod materials, 6 requisitions, 6 purchase orders, 8 production orders, 4 customer orders, and their receipts, completions and issues. `test-reset-api.test.ts` already takes Prod's requisitions past 100. After the full local run, the PR records each Prod list's total and its headroom below a page of 100, for the lists other files read on their first page: production orders, purchase orders and customer orders (lesson 2026-11-02, #288). CI's per-shard order differs from a local full run, so headroom is the measure, not a pass.
- **No protected surface changes.** These are tests, the catalogue and possibly one CI matrix line. Rollback is reverting the PR.

## 📝 Decisions in play

- R07 (bearer API equivalence): Q4's read-backs.
- R09 (today's business date only): Edge cases.
- R10 (no rewrite of existing documents): E2E-005, E2E-010.
- D01 (a working MVP shown at the training): the realistic run and its screenshots.
- D08 (forecast consumed in its calendar month): Q6.
- N01 (no finance): Q5.
- N02 (returns are a reasoned positive adjustment): E2E-008.

This spec supersedes none of them.

## 📋 Phasing

One phase, shipped as one implementation PR: the helper, the four journey files, the two extended files and the catalogue. Each step below leaves the suite green. The review suggested two PRs, the Prod files then the rest; one PR is kept, because the catalogue rows and UX-023's claim span every file, and the owner prefers one PR for one story. A defect that needs a product fix ships on its own bug PR (Q11), so the test PR doesn't wait on it.

## 📋 Implementation Plan

1. **`journeys.ts`.** Add the shared helpers and Q5's key walk and screen check. Prove the screen check on `/admin/prod/mrp` and the key walk on one existing request (no test file yet). Typecheck and lint.
2. **`e2e-supply-chain.test.ts`: E2E-001 and E2E-015.** Run the file alone against a local standalone server, then with `-t` on each test (lesson 2026-10-25, fixtures memoized).
3. **`e2e-planning.test.ts`: E2E-002, E2E-003 and E2E-016.** Same check.
4. **`e2e-corrections.test.ts`: E2E-007, E2E-008, E2E-012 and E2E-019.** Same check.
5. **`e2e-automatic.test.ts`: E2E-005 and E2E-021**, Test reset before and after. Same check, then run `mrp-automatic-api.test.ts` after it on the same server to prove the closing reset.
6. **E2E-010's MRP half** in `test-reset-api.test.ts`. Run that file.
7. **The realistic screen run** in `test-reset-realistic.test.ts`, with screenshots to `$CPG_SHOWCASE_DIR`. Run that file and record the timings.
8. **UX-023's file-level assertion.** Each journey file ends with a test that its checked-request count is above zero and that no finance key was met.
9. **Full order on one server.** Run every integration file in one pass on a fresh standalone server (lesson 2026-10-24), and record the new files' times. Record each Prod list's total and its headroom below 100 (Risks, "Prod growth"). Watch CI's shard times on the PR, and apply Q10 if a shard crosses 14 min.
10. **Catalogue.** Promote the twelve rows (Q12), matching every Then clause to an `expect`. Update E2E-010's Evidence and the "Last updated" paragraph. Run `npm test` (catalogue and filename checks), lint, typecheck, `npm run test:coverage` and build.
