# Execution plan: MRP Make acceptance (#320)

**Date:** 2026-11-02 13:12 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 72159ee4, `om-auto-fix-issue 320` → `om-auto-implement-spec`)
**Source doc:** `.ai/specs/implemented/2026-11-02--1304UTC-mrp-make-proposal-acceptance.md` (spec PR #344)
**Issue:** #320
**Status:** complete (review pending)

## Goal

A feasible Make proposal of the latest MRP run becomes an Open production order pinned to the BOM revision MRP chose, finishing on the need date, tagged with the run. Accept and the automatic batch both do this. A changed BOM, revision or lead time since the run is `MRP_PROPOSAL_STALE`.

## Scope

- `@cpg/db`: `ProductionOrder.mrpRun` and its migration.
- `@cpg/core`: `isExecutableProposal({ kind, bom })`, `ProductionOrderService.createFromMrp`, view and snapshot `mrpRun`, the production-order branch of `MrpProposalDocumentService`, the stale rule, the batch's filter and race codes.
- `@cpg/app`: the Make dialog and link, the not-executable text, the run on the production-orders list and detail, EN/PL copy, help.
- Tests: unit tests (100%), the benchmark, and the integration files `mrp-accept-api`, `mrp-accept`, `mrp-automatic-api`.
- Docs: `BACKWARD_COMPATIBILITY.md`, the engineering standards, `CPG-acceptance.md`, and the spec's implementation notes.

The spec is carried straight into `implemented/` (lesson 2026-10-23); spec PR #344 must merge first. The branch also deletes #289's stray active spec copy, the same change as on #344, because `tests/ai-filenames.test.ts` fails on `main` without it.

**Non-goals:** #322's date question, sizing changes, a narrower snapshot for accept.

## Implementation Plan

Phases follow the spec's Implementation Plan.

## Risks

- A production order costs more ORM calls than a requisition, so the cap batch's 15 s budget is at risk (spec Q10).
- The shared-component case (spec Q7) may show that accepting one parent makes another stale. The test records the outcome, and the spec notes say which.
- Migration: `production_order` is referenced by `production_completion`, so check that the generator doesn't rebuild the table.

## Progress

PR: #345

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence and production orders

- [x] 1.1 Column and migration — 06e960dd
- [x] 1.2 Run link on production orders — 0558a2f5

### Phase 2: MRP core

- [x] 2.1 Predicate and read — 64b9c116
- [x] 2.2 Document step and acceptance — 64b9c116
- [x] 2.3 Batch — 64b9c116

### Phase 3: Screen and copy

- [x] 3.1 Screen and copy — fd5e9a89

### Phase 4: Verification and docs

- [x] 4.1 Benchmark — b731b6d8
- [x] 4.2 Integration tests — 44bdc98a
- [x] 4.3 Docs and catalogue — e7bdf88c

## Log

- 13:12 Branch `feat/mrp-make-proposal-acceptance` from `origin/main` (`ab0b20da`). Engine: om-auto-create-pr (steps: 9, --loop: no).
- 13:25 Phase 1: the migration is a plain `add column` (the generator didn't rebuild `production_order`). The migration lists and counts are raised to 43.
- 13:45 Phase 2: the stale rule also compares `leadTimeDays` for Make (the spec review's fix). Spec Q7: accepting a parent leaves its input's requisition acceptable and vice versa, and two parents sharing an input are acceptable in either order. Tests pin both.
- 14:05 Benchmark: the realistic automatic run's stall rose to 489 ms with Make in the batch (a production order costs about 20 ms here). The batch now yields after every document, which gives 30 ms. The ten-times fixture plans no feasible Make proposal (#282's shape), so the Make accept is timed at realistic only, and the cap batch gets 525 production-order candidates inserted on Make pairs with usable BOMs. Figures are in commit b731b6d8. Timings on this machine vary 3× between passes.
- 14:40 Phase 3: the Make dialog names the BOM revision, finish and start (`orderStart`), and an accepted row links its production order. Production orders show "MRP run …" under the ID and as a detail field. The run card translates the two BOM codes. Help copy is in EN and PL.
- 15:10 Gate. `npm run lint` 0. `npm run typecheck` 0. `npm run test:coverage` 0: 667 files, 5,480 tests, 100%. The first pass caught two more rollback-by-count tests (`transfer-reversal.entity.test.ts`, `mrp-run-exceptions-migration.test.ts`). `npm run build` 0.
- 15:40 Integration, against a local standalone server (no Docker here; lesson 2026-10-23): `smoke`, `mrp-accept-api`, `mrp-accept` and `mrp-automatic-api`, 20 passed; `mrp-automatic`, `production-orders`, `mrp-report` and `test-reset-realistic`, 30 passed. The full suite runs in CI.

