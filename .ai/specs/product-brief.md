# CPG — product brief

- Date: 2026-10-19
- Mode: own; Owner: Piotr12 (product owner); Pass: full
- Evidence basis: one source family: the product owner's requirements interview and follow-up "grilling", exported on 19 Oct 2026 as the PRD, the conceptual data model, the decision register (74 decisions) and the acceptance catalogue (535 Given/When/Then scenarios), plus five decisions confirmed in this session. These record what the owner decided. They contain no account from a manufacturer or planner. The most consequential untested belief for the current goal is that the AI pipeline can build the full baseline to a working state (A02). Whether small manufacturers need CPG (A01) is untested and does not affect the current goal.
- Coverage: 41 claims — 35 sourced (interview 0, data 0, document 34, product 1, benchmark 0), 0 synthetic, 6 assumed; 0 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: not signed; this repository has no product readiness layer configured, and Problems and Target group rest on the owner's assumption, not on user evidence. Ready for: implementation planning of slice 1 (Scope → Now) as the owner's showcase build.
- Sources: `.ai/specs/research/CPG-prd001.pdf`, `.ai/specs/research/CPG-prd-decisions.pdf`, `.ai/specs/research/CPG-prd-datamodel.pdf`, `.ai/specs/research/CPG-acceptance.md` (markdown export of `CPG-prd-acceptance-tests.pdf`), `.ai/specs/research/decisions/` (D01–D03, D05, D06), `README.md`, `AGENTS.md`, `.ai/docs/engineering-standards.md`

## Decision summary

CPG will be built as a real, working MVP of the whole agreed baseline, MRP included, and shown as the output of the AITechLeaders training (D01). This is agreed by the owner.

The intended users are planners at a small manufacturer. That user and their problem are the owner's assumption, based on experience running mature planning software. No manufacturer has been asked (A01). The current goal is a demonstrable product rather than adoption, so this gap does not block building, but nothing here shows demand.

Work proceeds in three slices (D02). Slice 1 is the foundations plus all master data, including BOMs and their spreadsheet import (D03, D05). Slice 2 is the operational documents, stock postings and the Test reset, worked manually (D06). Slice 3 is MRP, once all of that works. The functional baseline is the four research documents, with scope creep explicitly prohibited (D04, Non-goals).

The uncertainty most likely to change this plan is whether the full baseline can be built and verified through the AI pipeline at the repository's quality bar (A02). Slice 1 is the first real test of that.

Next: slice 1 is specified, starting with authentication, which the engineering standards require before anything sensitive goes into `/admin`.

## Vision

A deliberately minimal but genuinely usable planning and execution tool for a small manufacturer, simple enough that "a reasonably intelligent caveman" can follow its planning logic. This is the owner's intended direction, not a demonstrated benefit. `[DOCUMENT]` CPG-prd001.pdf §01; `[PRODUCT]` README.md

## Target group and stakeholders

- Customer (pays): none. CPG is the owner's own project. `[DOCUMENT]` decisions/D01
- User (uses): planners and operators at a small manufacturer. This is the owner's guess, based on experience running mature planning software, not an observed situation. `[ASSUMPTION]` owner, this session; see A01
- Roles in the product: exactly one built-in administrator and normal users. Both roles maintain transactions; only the admin maintains master data, user accounts, read-only flags and the Test reset. `[DOCUMENT]` CPG-prd001.pdf §05
- Stakeholders: the AITechLeaders training, where the result will be shown. No audience or date has been named. `[DOCUMENT]` decisions/D01
- Decider for scope decisions: Piotr12 (product owner)

## Problems, with evidence

- The owner needs a working, demonstrable MVP as the output of the AITechLeaders training. `[DOCUMENT]` decisions/D01
- The owner believes mature planning software is too complex for a small manufacturer ("no seventeen-layer optimisation engine that needs a consulting firm"). That is the owner's view. No manufacturer's experience supports or contradicts it, and the same README calls the conclusion that the world needs another MRP II "almost certainly wrong". `[ASSUMPTION]` README.md, owner, this session; see A01

## Product and how it stands out

- What it is: an MRP II tool covering materials, units of measure, immutable alternative BOMs, locations, customers and suppliers, sales orders and forecasts, safety stock, MRP, production, purchasing, a stock ledger with corrections and transfers, reports, audit, spreadsheet imports, full API parity, two languages and light/dark modes. Details in Scope. `[DOCUMENT]` CPG-prd001.pdf §01
- What makes it different: deliberate minimalism. New modules must not be inferred from enterprise ERP terminology. `[DOCUMENT]` CPG-prd001.pdf §01. That this is what small manufacturers want is A01.

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

Deferred: no benchmark was checked, and the current goal does not depend on one.

## Goals and success criteria

- Business goal: a working MVP of the full baseline, shown at the training. Owner Piotr12. (D01)
- User outcome: every behaviour in the acceptance catalogue works through the UI and the equivalent bearer-token API. `[DOCUMENT]` CPG-prd-acceptance-tests.pdf "How to use these tests", decisions/D01
- Primary metric: acceptance scenarios passing. Baseline today: 0 of 535 executed. Threshold: all 535, since the owner said "all has to work". P0 first; P1 and P2 remain mandatory. Date: none set ("we have time"). `[DOCUMENT]` CPG-acceptance.md, CPG-prd-acceptance-tests.pdf "Test execution and traceability", decisions/D01
- What must not get worse: the repository's quality gate, meaning lint, typecheck, 100% unit-test coverage, build and integration tests on every change, with every push to `main` deploying. `[PRODUCT]` AGENTS.md

## Scope

- **Now, slice 1** (D02, D03, D05, D06):
  - Foundations:
    - the single admin from an environment password, normal users, sessions and named API tokens;
    - Test/Prod tenants with read-only flags and dataset generations (Test stays on its first generation until the reset exists), and Test seeded with demonstration records;
    - tenant and Global append-only audit;
    - the UI/API parity pattern with idempotency keys and optimistic locking;
    - per-user English/Polish, light/dark mode and the exact footer;
    - help and tooltips added screen by screen.
  - Master data:
    - materials and UoM conversions;
    - locations, customers and suppliers;
    - material-location parameters (Make/Buy, lead time, minimum lot, lot multiple);
    - safety-stock targets.
  - BOMs: logical BOMs, immutable revisions, priority and validity, cycle rejection.
  - The master-data and BOM spreadsheet import (template, full dry run, atomic upsert).

  Slice 1's acceptance set is the scenarios in TEN, MAT, BOM, XLS, API, AUD, UX and the safety-stock part of DEM that need only these features. The slice 1 spec lists the exact IDs. Scenarios in those areas that need stock, documents, the Test reset or MRP (for example TEN-013, TEN-019, MAT-010, AUD-017…023, API-027) move to the slice that builds them.

  D03 named login, users, tenant scoping, audit, tokens, idempotency and the generation check. Read-only flags, optimistic locking, theme and footer were the agent's additions, which the owner kept in slice 1 (D05).
- **Later, slice 2:**
  - the atomic Test reset into a new dataset generation (D06);
  - customer orders, forecasts, shipments and goods issues;
  - purchase requisitions, purchase orders and goods receipts;
  - production orders and completions;
  - the stock ledger, corrections, stock spreadsheet import and transfers;
  - reversals and the four-state lifecycle;
  - stock, variance and audit reports.

  All worked manually. (D02)
- **Later, slice 3:** the MRP run, auto-creation, the last-MRP report and the cross-domain end-to-end journeys (E2E). (D02)
- **Not doing:** see Non-goals.

The assignment of catalogue areas to slices 2 and 3 is the agent's proposal, derived from D02. The owner has not reviewed it line by line.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Material | Tenant-local item with an 8-digit sequential ID, a type (raw/intermediate/finished) and a base UoM. The PRD uses "material", not "item". | admin | all users |
| BUoM | Base unit of measure; authoritative quantities are stored in it to six decimals. | admin | all users |
| Logical BOM / BOM revision | A stable alternative recipe for one output material, and its immutable recipe snapshots. Production orders pin a revision. | admin | all users |
| Tenant | Test or Prod: fully isolated business datasets. Test can be reset into a new dataset generation. | admin | all users |
| Production order | The PRD's term for a make order. The engineering standards' examples say "work order". | users | all users |
| PR / PO / GR / GI | Purchase requisition, purchase order, goods receipt, goods issue. Only GR and GI (and other postings) change stock. | users | all users |

Full definitions: CPG-prd-datamodel.pdf, entity dictionary.

## Key flows

- Current state: deferred. No observed flow from a real manufacturer exists (A01).
- Future state, whole product: demand and safety targets → manual MRP run → purchase requisition/order or production order → goods receipt or production completion → goods issue to the customer. `[DOCUMENT]` CPG-prd001.pdf §03; CPG-acceptance.md E2E-001
- Future state, slice 1: the admin signs in and selects the Test tenant, creates a material with its base UoM and a conversion, then creates a BOM with components. A real edit creates a new immutable revision, and a cycle is rejected with its path shown. `[DOCUMENT]` CPG-acceptance.md MAT-001…, BOM-…, TEN-…

## Business rules

The full rule text lives in the PRD and decision register. The rows below are the rules that bound slice 1 and the whole product; follow the source for exact wording.

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Material IDs: eight-digit, zero-padded, sequential per tenant dataset generation from 00000001, immutable, never reused within a generation. | materials | `[DOCUMENT]` CPG-prd001.pdf §02, §05 | active | change to the baseline | owner-approved superseding row; PRD, register and catalogue updated together | Piotr12 | none |
| R02 | Material type rules: raw is Buy-only and never a BOM output; finished is never a BOM component; type and BUoM lock once referenced. | materials, BOMs | `[DOCUMENT]` CPG-prd001.pdf §02 | active | change to the baseline | as R01 | Piotr12 | none |
| R03 | Quantities are exact six-decimal BUoM decimals, never binary floating point, with the PRD's rounding rules. | all quantities | `[DOCUMENT]` CPG-prd001.pdf §02, §04 | active | change to the baseline | as R01 | Piotr12 | none |
| R04 | Any real BOM change creates an immutable revision. An activation toggle or an identical import does not. Equal priority over overlapping validity is forbidden. Cycles are rejected with the path shown. | BOMs | `[DOCUMENT]` CPG-prd001.pdf §02; register §01 | active | change to the baseline | as R01 | Piotr12 | none |
| R05 | Test and Prod share no business data, audit or ID sequences. A read-only tenant blocks every business write and new MRP runs, even for the admin and the API. | all tenant data | `[DOCUMENT]` CPG-prd001.pdf §05 | active | change to the baseline | as R01 | Piotr12 | none |
| R06 | Exactly one built-in admin, with the password from a mandatory environment variable (no start without it). Users are never hard-deleted. A password reset or deactivation invalidates all of that user's sessions and tokens at once. | accounts | `[DOCUMENT]` CPG-prd001.pdf §05 | active | change to the baseline | as R01 | Piotr12 | none |
| R07 | Every operation has a bearer-token API equivalent with identical authorization, except token creation, which is UI-only. Every mutating API needs an idempotency key kept for 24 h; Test writes need the current generation. | API | `[DOCUMENT]` CPG-prd001.pdf §06 | active | change to the baseline | as R01 | Piotr12 | none |
| R08 | Audit is append-only, with before/after, account, session and channel. Secrets are never stored. Test audit is cleared on reset; Prod and Global audit are kept indefinitely. | audit | `[DOCUMENT]` CPG-prd001.pdf §06 | active | change to the baseline | as R01 | Piotr12 | none |
| R09 | Physical and in-transit stock never go negative. Actual postings use today's business date only. | inventory (slice 2) | `[DOCUMENT]` CPG-prd001.pdf §03 | active | change to the baseline | as R01 | Piotr12 | none |
| R10 | MRP runs only on demand and never rewrites existing documents. | MRP (slice 3) | `[DOCUMENT]` CPG-prd001.pdf §04 | active | change to the baseline | as R01 | Piotr12 | none |
| R11 | The exact footer sentence, with its working links, appears on every application page. | all pages | `[DOCUMENT]` CPG-prd001.pdf §05 | active | change to the baseline | as R01 | Piotr12 | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Finance, costing, pricing, invoices, taxes, refunds | outside minimal planning | Piotr12 | active | change to the baseline | owner-approved superseding row | `[DOCUMENT]` CPG-prd-decisions.pdf §06 | none |
| N02 | A customer-return process (returns are a reasoned positive adjustment) | outside minimal planning | Piotr12 | active | as N01 | as N01 | `[DOCUMENT]` CPG-prd-decisions.pdf §03 | none |
| N03 | Batches, serial numbers, warehouse bins | outside minimal planning | Piotr12 | active | as N01 | as N01 | `[DOCUMENT]` CPG-prd-decisions.pdf §06 | none |
| N04 | Work centers, machine calendars, capacity scheduling, working-day calendars, hard reservations | outside minimal planning | Piotr12 | active | as N01 | as N01 | `[DOCUMENT]` CPG-prd001.pdf §01 | none |
| N05 | SSO, approval workflows, more than one admin, roles beyond admin/normal user, additional tenants | outside minimal planning | Piotr12 | active | as N01 | as N01 | `[DOCUMENT]` CPG-prd-decisions.pdf §06 | none |
| N06 | Supplier price or source lists, automatic stock-transfer creation | outside minimal planning | Piotr12 | active | as N01 | as N01 | `[DOCUMENT]` CPG-prd001.pdf §01 | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-10-19 | Goal: a real, working MVP of the full baseline, MRP included, shown as the output of the AITechLeaders training | owner's stated success; "all has to work, we have time" | Piotr12 | active | a showcase date or audience that constrains scope, or a move to real adoption | owner-approved superseding row | `[DOCUMENT]` research/decisions/D01-goal-working-mvp-showcase.md | none |
| D02 | 2026-10-19 | Build order: material master data and BOMs, then the other document types, MRP only once everything works manually | owner: "well defined and fully testable"; manual flows proven before planning automates them | Piotr12 | active | slice 1 delivery (A02) | owner-approved superseding row | `[DOCUMENT]` research/decisions/D02-build-order.md | none |
| D03 | 2026-10-19 | Foundations (auth, tenants, audit, UI/API pattern with idempotency) are built in slice 1; translations and help grow screen by screen | accepted agent recommendation; alternative considered: foundations after materials and BOMs, rejected to avoid retrofitting every service | Piotr12 | active | slice 1 delivery | owner-approved superseding row | `[DOCUMENT]` research/decisions/D03-foundations-in-first-slice.md | none |
| D04 | 2026-10-19 | The four research documents are the functional MVP baseline. No additional business requirements; where a detail is unspecified, choose the simplest consistent behaviour. | owner's instruction to close gaps without scope creep | Piotr12 | active | change to the baseline | owner-approved superseding row; PRD, register and catalogue updated together | `[DOCUMENT]` CPG-prd001.pdf §08; CPG-prd-decisions.pdf "How to use"; CPG-acceptance.md | none |
| D05 | 2026-10-19 | Slice 1 includes every master (locations, customers, suppliers, material-location parameters, safety stock), the master-data/BOM spreadsheet import, and the agent-proposed read-only flags, optimistic locking, theme and footer | owner's selection; the extras originated as an agent proposal | Piotr12 | active | end of slice 1 | owner-approved superseding row | `[DOCUMENT]` research/decisions/D05-slice-1-boundary.md | none |
| D06 | 2026-10-19 | Test is seeded with demonstration records in slice 1; the atomic Test reset is built in slice 2 | owner's choice among: both in slice 1, demo now and reset later, both later | Piotr12 | active | end of slice 1 | owner-approved superseding row | `[DOCUMENT]` research/decisions/D06-demo-data-now-reset-later.md | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Planners at small manufacturers have a problem that a deliberately minimal MRP II solves, and would use CPG `[ASSUMPTION]` owner's experience running mature planning software | low for D01; high if the goal moves to adoption | none from a manufacturer; README.md and the owner's view | the showcase still stands; a claim of market need would not | interview planners at small manufacturers about their last planning cycle; not scheduled | Piotr12 | unknown; not needed for D01 | untested |
| A02 | The full baseline can be built and verified through the AI pipeline at the repository's quality gate in the available time `[ASSUMPTION]` owner: "not that huge … well defined and fully testable" | high | the baseline is closed and has 535 scenarios with steps; no CPG business feature has been built yet (packages/) | D01's scope or timeline needs revisiting | deliver slice 1 and check whether its listed acceptance set passes with the gate green; review the pace before starting slice 2 | Piotr12 | end of slice 1 | untested |
| A03 | The 535 scenarios agree with the PRD and decision register `[ASSUMPTION]` same author and export date | medium | the catalogue says on conflict to update both together (CPG-prd-acceptance-tests.pdf) | contradictory behaviour gets implemented | check each slice's scenarios against the PRD while writing its spec; take conflicts to the owner | spec author per slice | each slice spec | untested |
| A04 | The repository's stack (SQLite with a single writer, Next.js, one VM) is enough for the PRD's atomicity, locking and best-effort performance rules `[ASSUMPTION]` agent; stack per AGENTS.md | medium | the PRD sets no numeric targets (CPG-prd001.pdf §07) | posting atomicity or MRP needs redesign | slice 1: optimistic-locking and idempotency scenarios on single records; slice 2: multi-document posting atomicity (AUD-017…023); slice 3: the MRP batch (AUD-026) | spec author per slice | each slice | untested |

## Kill criteria

No stop criterion has been set; the owner said there is time. The planned review point is the end of slice 1 (A02): if slice 1's listed acceptance set cannot be made to pass at the quality gate, the owner revisits D01's scope or timeline.

## Hypotheses to test

None. No synthetic walkthrough has been run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Do locations, customers/suppliers, material-location parameters, safety stock and the master-data/BOM spreadsheet imports belong to slice 1 or slice 2? | was yes (slice 1 boundary) | Piotr12 | closed: all five in slice 1 (D05) |
| Q02 | The Test tenant must start with demonstration records (TEN-001, PRD §05) and the reset regenerates them. Are the demo dataset and the reset built in slice 1 (holding materials and BOMs until later slices add more), or later? | was yes (TEN-001, reset scenarios) | Piotr12 | closed: demo data in slice 1, reset in slice 2 (D06) |
| Q03 | Which screens are the public frontend and which are `/admin` (shadcn)? The PRD has a login page, Master Data (admin) and Transactions (all users), while the standards split public pages from `/admin`. | no; decided in the slice 1 spec | Piotr12 / spec author | closed: every screen that needs an account lives under `/admin` with shadcn/ui; the public frontend is `/`, `/login` and `/help` (specs `implemented/2026-10-19--0746UTC-admin-sign-in` Q5 and `implemented/2026-10-19--0855UTC-user-preferences-footer-help`) |
| Q04 | Should code concepts follow the PRD's terms (materials, production orders) rather than the standards' examples (items, work orders)? | no; spec author proposes, owner confirms | Piotr12 | open |
| Q05 | When and to whom is the showcase presented? | no | Piotr12 | open |

## Definition of Ready addendum (own)

Problems and Target group rest on the owner's assumption (A01), not on user evidence. That is acceptable for D01's showcase goal, but it does not show demand. The repository has no product readiness layer configured. Slice 1 is ready for implementation planning (Q01 and Q02 closed by D05 and D06); A02 is tested by delivering it. Slices 2 and 3 are specified when their turn comes.

## Collection plan

None. The current decision needs no further material. Interviewing manufacturers (A01) becomes relevant only if the goal moves to adoption.
