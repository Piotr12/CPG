# Production completions — execution plan

Source doc: .ai/specs/2026-10-20--2221UTC-production-completions.md
Issue: #89
Spec PR: #117
Engine: om-auto-create-pr (steps: 10, --loop: no)
Status: in-progress

## Goal
Post partial production completions against Open orders. Each completion pre-fills expected consumption from the pinned revision, records actual consumption (with extra inputs and zero-output waste), and posts output and inputs atomically as one ledger group, with the variance recorded. It works in both the UI and the API.

## Scope
- The `production-orders` concept:
  - the `ProductionCompletion`/`ProductionCompletionLine` entities and their migration;
  - pure completion arithmetic, strict schemas and `ProductionCompletionService` (preview/list/post);
  - the order's `outstanding` and the Q8 state rule on `update`.
- Delivery: API routes (`/production-orders/{id}/completions`, `/preview`), the server action, the completion dialog, form and history, EN/PL strings/help, and the BACKWARD_COMPATIBILITY entry.
- Tests: unit tests at 100% coverage, plus one focused integration file.

**Non-goals:** reversal (E11-S03), Close Early/Cancel (E11-S01), the variance report (E13-S02), MRP, a demo completion seed, and a shared variable-line form in `ui/backend`.

## Implementation Plan
- **Phase 1:** the entities and migration; the domain functions and schemas.
- **Phase 2:** the service's preview/list; post; registration plus the order's `outstanding`/Q8 rule and regressions.
- **Phase 3:** routes and the action plus the contract doc; the UI (dialog/form/history/strings/help); the integration test.
- **Phase 4:** the full gate, review, and publication.

## Risks
- **Partial postings:** one transaction and one ledger call.
- **Revision drift:** expected quantities come from `order.recipe` only.
- **Double posting:** the API key, and the UI submission behind a unique index.
- **Overproduction bypass:** checked against a fresh order inside the transaction.
- **Docker Desktop is out of disk** (spec run). The local integration run may need the standalone-server fallback from the lessons; otherwise CI is the gate.

## Decisions and log
- Reuse the cezar linked worktree; no nested worktree. The spec is materialized untracked from `spec/production-completions` (PR #117) per `om-auto-implement-spec`; the spec branch stays design-only.

## Verification

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain and persistence

- [ ] 1.1 Completion entities, migration and isolation
- [ ] 1.2 Completion arithmetic and strict schemas

### Phase 2: Service

- [ ] 2.1 Preview and history list
- [ ] 2.2 Atomic completion posting
- [ ] 2.3 Registration, outstanding and the order state rule

### Phase 3: Delivery surfaces

- [ ] 3.1 API routes, server action and contract
- [ ] 3.2 Completion dialog, history, strings and help
- [ ] 3.3 Focused integration journey

### Phase 4: Verification and publication

- [ ] 4.1 Full local gate and live UI evidence
- [ ] 4.2 Review, publication and final CI
