# Execution plan — production completion and transfer posting reversals

**Date:** 2026-10-21 09:58 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 92` → `om-auto-implement-spec` → `om-auto-create-pr`)
Source doc: .ai/specs/2026-10-21--0946UTC-production-transfer-reversals.md
Spec PR: #131 (design-only; merges on its own)
Issue: #92 (E11-S03)

## Goal
Both roles can reverse a whole production completion, or one transfer dispatch, receipt or write-off, once and in full, today, with a reason. Every leg is inverted atomically, and the production order or transfer is recalculated, in the UI and the API.

## Scope
- `core`: generalise the historical inverse in `services/stock/stock-posting.ts`, add link helpers, add `ProductionCompletionService.reverse` and `TransferService.reverse`, the read enrichment, the pure `afterReversal`, transfer `hasProcessing` from posting existence, and production outstanding that honours status.
- `db`: the `TransferReversal` entity, its trigger, migration and registry.
- `app`: two keyed POST routes, two server actions, the completion-history and transfer-ledger actions, a shared `ReversalConfirmDialog`, EN/PL labels and help.
- Docs: `BACKWARD_COMPATIBILITY.md` additions and amendments, and a lesson when a pitfall appears.
- Tests: unit tests at 100 %, and `tests/integration/production-transfer-reversals.test.ts` plus the smoke migration count.

## Non-goals
Partial reversals, reversing a reversal, manual reopen, changes to receipt/issue/correction reversal behaviour, MRP, new permissions or dependencies. The spec file merges through PR #131 and is not committed here; the move to `implemented/` follows once that PR has merged.

## Implementation Plan
Phase 1 — production completion reversal (spec steps 1–4); Phase 2 — transfer posting reversal (spec steps 5–8); Phase 3 — verification and delivery (spec steps 9–10). Each step is listed in Progress.

## Risks
- Risk-high: a migration plus multi-leg stock and transit writes. Mitigations: rollback-after-flush tests, two-connection race tests, and populated-upgrade migration tests.
- Docker storage on this machine is full (`no space left on device`), so local integration runs may need the standalone-server fallback from the lessons. CI remains the gate.
- The spec PR may still be open when this PR is ready. The spec move to `implemented/` then waits for it.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Production completion reversal

- [ ] 1.1 Generalise the historical inverse into a group primitive with link helpers
- [ ] 1.2 Add ProductionCompletionService.reverse with order recalculation and audit
- [ ] 1.3 Add completion reversal read fields, API route, server action and compatibility entry
- [ ] 1.4 Add shared confirmation dialog and completion-history reversal UI

### Phase 2: Transfer posting reversal

- [ ] 2.1 Add the TransferReversal entity and migration
- [ ] 2.2 Add afterReversal and TransferService.reverse
- [ ] 2.3 Add transfer reversal read fields, API route, server action and compatibility entry
- [ ] 2.4 Add transfer ledger reversal UI

### Phase 3: Verification and delivery

- [ ] 3.1 Add the integration test and update smoke
- [ ] 3.2 Run the full gate, review and deliver
