# Execution plan: MRP automatic mode (E19-S03)

**Date:** 2026-11-02 10:49 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 289` → `om-auto-implement-spec`)
**Source doc:** .ai/specs/implemented/2026-11-02--1031UTC-mrp-automatic-mode.md (spec PR #339)
**Issue:** #289
**Status:** done

## Goal

A run started as Automatic, from the Run MRP dialog or with `{ "mode": "automatic" }` through the API, stores its results. In the same request transaction it then creates every executable proposal's document in one all-or-nothing batch, tagged with the run. A failure is recorded on the run, naming the cause and the candidate. Concurrent runs queue, and replays are idempotent (spec Q1–Q15).

## Scope

- `packages/db`: `MrpRun.creation` (nullable JSON) and its migration.
- `packages/core`:
  - `validators/mrp/mrp-run.schema.ts`;
  - `services/mrp/` (`mrp-run.service.ts`, `mrp-run-view.ts`, `mrp-acceptance.service.ts`, and the new `mrp-proposal-document.service.ts` and `mrp-batch.service.ts`);
  - `domain/mrp/acceptance/executable-proposal.ts`, `domain/audit/audit-fields.ts`, the container.
- `packages/app`: the run route, `runMrp`, `run-mrp-button.tsx` (the dialog), `mrp-run-screen.tsx` (Creation field and failure alert), the EN/PL messages, help and audit labels.
- Tests: unit tests beside each file, `mrp-batch-concurrency.test.ts`, `mrp-run-timing.test.ts`, the integration files `mrp-automatic-api.test.ts` and `mrp-automatic.test.ts`, `test-reset-realistic.test.ts` and `mrp-run.test.ts`.
- Docs:
  - `BACKWARD_COMPATIBILITY.md`, `engineering-standards.md` and the catalogue;
  - the spec goes straight into `implemented/` (lesson 2026-10-23, don't stack);
  - a comment on #320.

**Non-goals:**
- production-order creation (#320);
- a busy flag (Q4);
- a re-plan inside the batch (Q3);
- any change to Accept's checks or to the engine.

## Risks

- Moving the run's deletes before the snapshot changes the run's stall profile, so re-measure it.
- The integration files create documents for every Test material, so reset Test before and after each.
- The Run MRP dialog adds a click to `mrp-run.test.ts`.

## Log

- 10:49 UTC: branched `feat/mrp-automatic-mode` from `origin/main`. The owner told the run to continue autonomously, so Q3 is applied as recommended, and #339 is marked ready.

- 11:00 UTC: moving the run's deletes before its snapshot changed #274's concurrency test. Its "write held open across the snapshot" now makes the run busy-wait for SQLite's lock, a pattern production never uses (lesson 2026-10-24). The test now commits after the wrapper's first read and asserts one plan in all.
- 11:30 UTC: deviations, recorded in the spec's notes:
  - candidates are read in one bounded read;
  - the run's audit entry carries scalar `mode`, `documents` and `failure`;
  - the failure note is a `Callout`;
  - the modes are re-declared in the validator.
- 12:05 UTC: benchmark. Realistic automatic run: 442 ms, longest stall 30 ms. A batch at the cap: 1,322 ms, longest stall 32 ms.
- 12:30 UTC: the coverage run found two rollback-count tests (lesson 2026-10-23) and two uncovered branches. Fixed (12cb469c, e46bdeef).
- 13:00 UTC: integration on a local standalone server (no Docker):
  - `mrp-automatic-api`: 6/6;
  - `mrp-automatic` + `mrp-run`: 6/6;
  - a fresh server with `smoke`, `test-reset-realistic`, both automatic files, the MRP files, `purchasing`, `production-orders` and `test-reset-api`: 93/93. The realistic automatic run created 424 requisitions in 397 ms, with `/up` answering in 3 ms.
- Full gate on `e46bdeef`: lint 0, typecheck 0, `test:coverage` 0 (665 files, 5,444 tests, 100%), build 0.
- 11:25 UTC: a fresh-context review (`om-auto-review-pr --autofix`) found no blocker or major. Its 4 minors and 4 nits were fixed in `f65ac570`. Gate on `f65ac570`: lint 0, typecheck 0, `test:coverage` 0 (5,446 tests, 100%), build 0; `mrp-automatic`, `mrp-run`, `mrp-automatic-api` and `help` 19/19. Posted on #340: the review, the UI evidence (4 screenshots) and the manual-QA instructions.

## Implementation Plan

### Phase 1: schema

1. `MrpRun.creation` and its migration, with the upgrade, old-insert and `down()` tests and the migration counts

### Phase 2: core

1. Mode schema, `creation` on the view, audit fields, and the lock order (deletes before the snapshot)
2. Extract `MrpProposalDocumentService` from accept
3. `MrpBatchService`, wired into `run`, with its unit tests
4. The two-ORM concurrency and staleness tests
5. Route and server action, with the gate tests

### Phase 3: screen

1. The Run MRP dialog, the card's Creation field and failure alert, the intro, the help and the messages

### Phase 4: benchmark and integration

1. The benchmark: realistic, and at the cap
2. `mrp-automatic-api.test.ts`
3. `mrp-automatic.test.ts`, `test-reset-realistic.test.ts`, and `mrp-run.test.ts` for the dialog

### Phase 5: paperwork and gate

1. `BACKWARD_COMPATIBILITY.md`, standards, the catalogue, the #320 comment, and the spec in `implemented/` with notes
2. Full gate

## Progress

PR: #340

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: schema

- [x] 1.1 MrpRun.creation and migration — 366c9f2b

### Phase 2: core

- [x] 2.1 Mode, view, audit fields, lock order — 4f2ca802
- [x] 2.2 Extract MrpProposalDocumentService — 4f2ca802
- [x] 2.3 MrpBatchService wired into run — 4f2ca802, 90c45e4d
- [x] 2.4 Concurrency and staleness tests — 90c45e4d
- [x] 2.5 Route and server action — 827ab3d0

### Phase 3: screen

- [x] 3.1 Dialog, card, copy and help — 265c7d14

### Phase 4: benchmark and integration

- [x] 4.1 Benchmark — 77e656e4
- [x] 4.2 API integration file — 4858e73a
- [x] 4.3 Browser integration, realistic file, mrp-run update — 4858e73a

### Phase 5: paperwork and gate

- [x] 5.1 Docs, catalogue, spec to implemented — 12cb469c, 8726ee8b
- [x] 5.2 Full gate — e46bdeef
