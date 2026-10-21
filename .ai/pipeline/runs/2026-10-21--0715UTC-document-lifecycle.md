# Document cancellation and early closure

Source doc: .ai/specs/2026-10-21--0707UTC-document-lifecycle.md
Spec PR: #122
Issue: #90
Status: in-progress
Engine: om-auto-create-pr (steps: 8, --loop: no)

## Goal
Deliver the four-state lifecycle across the five operational document types, preserving posted history and API/UI parity.

## Scope
Shared pure lifecycle rules; defaulted abandonment and PO-line status; owning service workflows; existing posting paths; keyed routes/actions; confirmations and translations; behavior tests and UI evidence. No reversals, MRP or manual reopening.

## Implementation Plan
1. Pure lifecycle rules and exhaustive behavior tests.
2. Defaulted entity additions, generated migration and populated up/down tests.
3. Customer-order and PO closure, line selection, shared aggregation and shipment synchronization.
4. Requisition/production closure, retained conversions and zero-output processing.
5. Transfer transit/loss guards, abandonment and preserved postings.
6. Shared schemas, ten keyed API routes, tenant actions and tests.
7. Existing screens, reusable confirmation controls, EN/PL messages and help with tests.
8. Targeted integrations, smoke, full local gate, review, browser evidence and CI.

## Verification
Run lint, typecheck, test:coverage (100%), build; locally affected integrations plus smoke. Review before completion, with full integration suite in CI. Spec filename/image tests passed (6 tests); npm ci completed in this worktree.

## Risks / decisions
- Preserve Completed PO-line overreceipt while its header is Open.
- PO selection uses existing numeric positions; customer orders use UUIDs.
- Zero-output waste counts as processing. Transfer loss cannot produce Completed.
- Docker test-env build failed with no space left on device; do not prune shared storage. Runtime verification needs a local standalone/dev fallback or CI.
- Spec remains on design PR #122; materialized locally but excluded from implementation commits until base contains it.

## Log
- 2026-10-21 07:15 UTC — Spec #122 published after independent approve review. Starting implementation from origin/main in this linked worktree. Original spec-phase log lives on #122; this plan is the implementation run log.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared lifecycle and persistence

- [ ] 1.1 Pure lifecycle rules and tests
- [ ] 1.2 Entity additions and migration

### Phase 2: Transactional workflows

- [ ] 2.1 Customer-order and PO resolution
- [ ] 2.2 Requisition and production resolution
- [ ] 2.3 Transfer resolution

### Phase 3: API and UI

- [ ] 3.1 Schemas, routes and actions
- [ ] 3.2 Controls, translations and help

### Phase 4: Verification

- [ ] 4.1 Integrations, gate, review, QA and CI
