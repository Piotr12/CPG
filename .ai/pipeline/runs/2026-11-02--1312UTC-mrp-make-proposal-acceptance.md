# Execution plan: MRP Make acceptance (#320)

**Date:** 2026-11-02 13:12 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 72159ee4, `om-auto-fix-issue 320` → `om-auto-implement-spec`)
**Source doc:** `.ai/specs/implemented/2026-11-02--1304UTC-mrp-make-proposal-acceptance.md` (spec PR #344)
**Issue:** #320
**Status:** in progress

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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence and production orders

- [ ] 1.1 Column and migration
- [ ] 1.2 Run link on production orders

### Phase 2: MRP core

- [ ] 2.1 Predicate and read
- [ ] 2.2 Document step and acceptance
- [ ] 2.3 Batch

### Phase 3: Screen and copy

- [ ] 3.1 Screen and copy

### Phase 4: Verification and docs

- [ ] 4.1 Benchmark
- [ ] 4.2 Integration tests
- [ ] 4.3 Docs and catalogue

## Log

- 13:12 Branch `feat/mrp-make-proposal-acceptance` from `origin/main` (`ab0b20da`). Engine: om-auto-create-pr (steps: 9, --loop: no).
