# Execution plan: MRP automatic mode (E19-S03)

**Date:** 2026-11-02 10:49 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 289` → `om-auto-implement-spec`)
**Source doc:** .ai/specs/implemented/2026-11-02--1031UTC-mrp-automatic-mode.md (spec PR #339)
**Issue:** #289
**Status:** in progress

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

- [ ] 4.1 Benchmark
- [ ] 4.2 API integration file
- [ ] 4.3 Browser integration, realistic file, mrp-run update

### Phase 5: paperwork and gate

- [ ] 5.1 Docs, catalogue, spec to implemented
- [ ] 5.2 Full gate
