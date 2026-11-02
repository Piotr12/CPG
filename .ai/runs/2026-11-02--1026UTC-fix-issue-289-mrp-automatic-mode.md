# om-auto-fix-issue #289 — MRP automatic mode, one all-or-nothing batch per tenant (E19-S03): spec

**Date:** 2026-11-02 10:26 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-11-02--1031UTC-mrp-automatic-mode.md`
**Status:** blocked. The spec PR #339 is open as a draft, and the implementation waits on the owner confirming Q3.

## Goal

Take #289 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 289` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR, branched from `main` (lesson 2026-10-23, "don't stack"). This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 10:26 Triage. #289 is labelled `feature`, open and unassigned, and no PR references it. No spec in `.ai/specs/` covers automatic mode, and `mrp-run.schema` rejects `mode: "automatic"` today (`mrp-run-gate.test.ts:76`), so the feature isn't built. Its dependencies #287, #283, #288 and #93 are closed. `SDLC.md` has no Definition of Ready, so the ticket-level check is skipped. Routing to `om-auto-write-spec 289`.
- 10:30 Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-automatic-mode` from `origin/main`.
- 10:31 Read the context: lessons, the acceptance spec (#287), the run, acceptance, idempotency and request-transaction code, the run entity (its `mode` check already allows `automatic`, #274 Q8), the Run MRP button and screen, and the catalogue rows. Wrote the spec with fourteen questions answered by reversible defaults. Main calls:
  - Q1: the batch's candidates are exactly what `isExecutableProposal` admits, which today is Buy only. #320 (the Make half, open) adds production orders to the shared document step, and the batch then includes them.
  - Q2: one request transaction. The batch runs in a savepoint after the run is stored, so the idempotency key commits with the run and its documents, and a failed batch keeps the results.
  - Q3, marked ⚠: no second plan. The calculation and the batch share one snapshot and one write lock. RUN-018's "fails as stale, results remain" becomes "the stale attempt stores nothing and the retry plans on current data", which reads a P0 criterion differently.
  - Q4: concurrent automatic runs queue behind the gate. There is no busy flag or code.
  - Q6: one nullable JSON column, `mrp_run.creation`.
  - Q8, Q9: Run MRP opens a dialog, and the run card shows the outcome. E18-S03 shipped without the failed-batch display the issue gave it.
- 10:36 Docker isn't running, so the test env couldn't boot. Ran `npm ci` and `next dev` on a temp `DATA_DIR`, captured the current MRP page, and rendered two static mockups. The page intro says "A run changes no stock and no document", so the spec now rewords it. The startup Test dataset proposes about 370 times on the first 25 pairs, which set Q13's budget.
- 10:40 Sent the spec to a fresh-context reviewer for the scope-cohesion and transaction checks.
- 10:46 The review found nothing Critical and no scope split. It raised 2 High, 5 Medium and several Low findings, all folded in:
  - H1: the batch read 500 candidates but cleared the identity map every 25, so later marks would have been lost. Candidates are now primitives read in chunks of 25, and the mark is a tenant-filtered `nativeUpdate`. Tests cover a chunk boundary and every mark.
  - H2: RUN-018 stays Partially verified until the owner confirms Q3, and the spec's status is draft.
  - M: Q3 now rests on SQLite's guarantee, not the gate alone. The run's deletes, its first write, move before the snapshot, so staleness fails before any plan. The concurrency test adds a third gated writer.
  - M: `VALIDATION_FAILED` keeps its `fieldErrors`, and the API example no longer shows params `MATERIAL_INACTIVE` doesn't carry.
  - M: a batch cap (Q15, `MRP_BATCH_TOO_LARGE`, 2,500), budgeted at the cap, plus the deploy-overlap risk.
  - M: the integration RUN-019 test is stated to prove same-bundle queuing only.
  - L: `REQUISITION_ID_RACE` propagates. The run's audit entry moves after the batch and carries `creation`. The replay and fingerprint notes go to `BACKWARD_COMPATIBILITY.md`. A trigger raises the driver-error case. The over-limit fixture is cleaned up in a `finally`. The card distinguishes "no proposals to create" from "failed".
- 10:48 Opened the draft spec PR #339 (`Refs #289`), with labels `review`, `documentation`, `skip-qa`, `priority-medium` and `risk-low`. Posted the label rationale, the UI evidence (on `qa-evidence`, `spec-mrp-automatic-mode/`), the defaults table on the PR and the issue, and the run summary. Released the issue's `in-progress` lock; it stays assigned to its author.
- 10:48 Stopped before `om-auto-implement-spec`. Q3 is the transaction design, so building on it before the owner confirms would risk a rewrite (AGENTS.md: ask instead of guessing).

## Changes

- `.ai/specs/2026-11-02--1031UTC-mrp-automatic-mode.md` (new)
- `.ai/specs/assets/mrp-automatic-mode/` (current screenshot, two mockups)
- this run log

## Verification

- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 7 passed.

## Follow-ups

- The owner confirms Q3 (or picks the three-transaction reading) on #339. Then: `om-auto-implement-spec .ai/specs/2026-11-02--1031UTC-mrp-automatic-mode.md`, branched from `main`.
- During implementation, comment on #320 with what it owes the batch (spec Q1).
