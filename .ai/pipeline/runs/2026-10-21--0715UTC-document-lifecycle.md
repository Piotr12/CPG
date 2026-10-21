# Document cancellation and early closure

Source doc: .ai/specs/implemented/2026-10-21--0707UTC-document-lifecycle.md
Spec PR: #122
Issue: #90
Status: complete
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
- Spec design PR #122 merged into main; fully implemented spec now lives under implemented/.

## Log
- 2026-10-21 08:25 UTC — Full CI 39567396281 is green, including 48 production Docker integration files / 344 tests. Final local gate: 452 files / 2871 tests, 100% coverage; four targeted integration files / 21 tests pass. Independent re-review approves fixes; browser evidence published at PR #123 comment 6311384777. Finalizing spec/run metadata; final documentation-head CI is monitored on the PR before session completion.
- 2026-10-21 08:10 UTC — CI full integration exposed two test-composition issues: lifecycle setup left an admin token, and goods-receipt row assertions assumed the old last-three-column layout. Added scoped token teardown and assertions including abandonment/actions; new browser regression covers concurrently removed CO lines. Production build and 100% gate pass after review fixes.
- 2026-10-21 08:06 UTC — Independent review identified old-writer PO line progress during rolling deployment and a removable-row dialog lost on conflict refresh. Both regressions reproduced, then fixed: quantity-derived PO progress preserves terminal abandonment; CO lifecycle refresh waits for success. Focused gate: 4 files / 71 tests pass. Full revalidation and fresh-runtime integration next.
- 2026-10-21 07:55 UTC — Build passes. Fresh standalone browser/API integration plus smoke: 2 files / 10 tests pass (all five types, selected CO/PO lines, conversion retention, zero-output waste, transit refusal/loss, read-only/version/generation/key/replay). Test harness waits for streamed controls and treats stock corrections as signed deltas. Docker image verification remains CI-owned because local Docker storage is exhausted. Merged current base including spec #122.
- 2026-10-21 07:47 UTC — Full unit gate: 451 files / 2869 tests pass; 100% statements, branches, functions and lines. Lint passes (one pre-existing BOM unused-function warning); all workspace typechecks pass. Build and runtime/integration evidence remain.
- 2026-10-21 07:46 UTC — Phase 3: 96 route/action/schema and purchase service tests pass; 36 focused screen/confirmation tests pass. Confirmation retains loaded actions/versions after conflict refresh. Full suite exposed migration counts and fixture updates, now fixed. Design PR #122 merged externally; base update follows the phase commit.
- 2026-10-21 07:39 UTC — Phase 2: 226 service/domain tests pass, covering partial and zero-output production, transit refusal, closure rollback, line selection, retained conversions and shipment completion. Adding the historical base-unit regression found during review. App typecheck now identifies new view fixtures and state labels to update in Phase 3.
- 2026-10-21 07:21 UTC — Phase 1: 28 tests pass, including populated migration upgrade/down and exact near-maximum decimal backfill. Scoped lint passed. Fixed a migration-test TypeScript result annotation. Generated migration initially failed with NOT NULL copied NULL; replaced with additive columns and enum CHECK. User reiterated autonomous completion.
- 2026-10-21 07:15 UTC — Spec #122 published after independent approve review. Starting implementation from origin/main in this linked worktree. Original spec-phase log lives on #122; this plan is the implementation run log.

## Progress

PR: #123

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared lifecycle and persistence

- [x] 1.1 Pure lifecycle rules and tests — 75a8590
- [x] 1.2 Entity additions and migration — 07bbd83

### Phase 2: Transactional workflows

- [x] 2.1 Customer-order and PO resolution — d9f570c
- [x] 2.2 Requisition and production resolution — d9f570c
- [x] 2.3 Transfer resolution — d9f570c

### Phase 3: API and UI

- [x] 3.1 Schemas, routes and actions — 89be288
- [x] 3.2 Controls, translations and help — 89be288

### Phase 4: Verification

- [x] 4.1 Integrations, gate, review, QA and CI — a710507; full CI 39567396281 green

## Outcome and handoff

All five lifecycle flows, selected-line resolution, audit and API/UI parity are implemented. [Review](https://github.com/Piotr12/CPG/pull/123#issuecomment-6311280060) and [browser evidence](https://github.com/Piotr12/CPG/pull/123#issuecomment-6311384777) are published. GitHub rejected author self-approval; a separate reviewer and risk-high QA sign-off are still required. The run delivers a ready implementation PR, not a merge.

Local Docker storage was full; fresh standalone verification and green Docker CI cover the production behavior. `npm run dev` rendered the pages but its client controls did not hydrate, also reproduced on unchanged forecasts; this development baseline issue is outside the lifecycle change. Owned browsers and test servers were stopped. Final head checks and delivery state are recorded in the PR's completion comment.

Subsequent base integration and reversal compatibility fixes are recorded in [the PR stabilization run](../../runs/2026-10-21--0856UTC-pr-123-stabilization.md).
