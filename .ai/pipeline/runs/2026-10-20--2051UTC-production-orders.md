# Production orders — execution plan

Source doc: .ai/specs/2026-10-20--2047UTC-production-orders.md
Issue: #88
Engine: om-auto-create-pr (steps: 9, --loop: no)
Status: in-progress

## Goal
Record manual production orders with pinned recipes, derived dates and advisory shortages in both UI and API.

## Scope
New production-orders concept across db/core/app, reference guards, seed/reset, translations/help/navigation and focused tests. No postings, lifecycle commands, MRP or capacity.

## Implementation Plan
Phase 1: domain/persistence, schemas/math, service, usage/seed.
Phase 2: API/actions, screens, focused integration journeys.
Phase 3: verification/review and publication.

## Risks
Revision drift, historical revaluation and tenant isolation. Retain stored revision/conversion/lead-time; recheck create in one transaction; real SQLite and API/browser tests.

## Decisions and log
- Clean dev server reproduces the URL-data Insight on unchanged customer-orders/[id] as well as the new pages, despite the documented Suspense-child pattern. Reordering parameter reads only moved the diagnostic into shared preferences and was reverted; final source remains 8115321. Production image, local build and browser checks pass. Log /tmp/cpg-88-dev-final.log; treat shared dev-prefetch diagnostics as separate follow-up.
- Issue claim released while publication awaits Guard approval: https://github.com/Piotr12/CPG/issues/88#issuecomment-6301991887. No shared branch push or PR was attempted.
- Final browser state matrix found the copied blank fallback conflicts with CODE_REVIEW.md's feedback fallback rule. Added the first shared, language-neutral LoadingMessage skeleton and used it on both new pages; regression tests inspect both route fallbacks. Re-running the gate and final production image after this scoped correction.
- Independent code audit requested changes: Back dropped the create draft; recipe selection hydrated historic revisions and repeated stock queries; production audit labels were missing. Retained draft, constrained current revision pairs in 100-alternative batches, grouped component reads and bounded stock lookups, and added audit translations/regressions.
- First Docker run: 24/29 passed. Three nav inventory assertions needed the new entry; production create succeeded but Next kept a closed dialog in a hidden page, so the wait must check open/visible dialogs; the scope assertion used coinciding tenant-local IDs and now creates a truly Prod-only ID. No stock or auth defect found.
- Repository gate requires every tenant server action to use the write wrapper. Replaced the read-only preview action with the options GET route and introduced the mandated shared ui/apiCall read boundary; did not weaken the gate. Full tests found expected nav/help/dictionary inventories, updated for the new routes.
- Reuse cezar linked worktree; no nested worktree. Spec committed separately on spec/production-orders, materialized here untracked per om-auto-implement-spec. Spec-only branch stays design-only.
- User Guard defers all remote branch publication/PR creation until concrete local work is reviewed and approved; continue authorized reversible local implementation first. No push attempted.
- Fresh-context scope review passes; explicit recipe choice must remain current at save. Lead-time changes between preview and save use latest-at-create and authoritative response.
- Spec-stage lint passed with one pre-existing BOM unused-import warning; 6 metadata tests passed. npm ci used unchanged lockfile (913 packages; 10 known advisories).

## Verification
- Final source 8115321: lint/typecheck/build pass; 2,431 unit tests at 100% all metrics; final production image targeted integration 4/4 files and 29/29 tests pass. QA state matrix PASS (evidence only): .ai/qa/artifacts_production-orders-88/report.md. Local review: .ai/analysis/2026-10-20--2131UTC-production-orders-review.md. Full PR CI and human QA remain pending.
- Post-review local gate: lint/typecheck/build pass; 2,429 tests in 372 files, 100% coverage on all four metrics. Targeted production-image integration: 4 files / 29 tests pass. Review fixes committed aeeabfe; constant/named-option cleanup subsequently passed the same local gate.
- Independent source audit re-review: prior findings resolved, no remaining production-code finding. Formal PR review/CI remains pending publication.
- Phase 2 local gate: lint passed (existing BOM unused import warning), typecheck passed, 372 unit files / 2,426 tests passed at 100% statements/branches/functions/lines, build passed with both production-order pages and all three API paths.
- Live dev Chrome: seeded detail read, target edit 10→12 recalculated direct requirements, 390px page width exactly 390 with edit button in bounds. Desktop/mobile screenshots under .ai/qa/artifacts_production-orders-88/. No browser errors.
- Targeted Docker integration run started: production-orders, migration smoke, navigation, atomic Test reset. Full suite reserved for PR CI.
- Phase 1: 12 targeted files, 68 tests passed; scoped ESLint passed (unused snapshot aliases subsequently replaced by explicit allowlist); typecheck passed. Initial full-unit pass exposed three migration count expectations, now corrected and passing.
- Generated migration is additive only; tested up/down and existing-schema adoption. No persisted production database touched.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain and persistence
- [x] 1.1 Entity, migration and isolation — 33241f3
- [x] 1.2 Strict schemas and exact scheduling/requirements — 33241f3
- [x] 1.3 Service and SQLite behaviour — 33241f3
- [x] 1.4 Usage guards and shared demo/reset seed — 33241f3

### Phase 2: Delivery surfaces
- [x] 2.1 API/actions and contract — 0f0c290
- [x] 2.2 Translated screens, navigation and help — 0f0c290
- [x] 2.3 Focused integration journeys — aeeabfe

### Phase 3: Verification and publication
- [x] 3.1 Full local gate and live UI evidence — 8115321
- [ ] 3.2 Review, publication and final CI

## Publication handoff
Spec branch spec/production-orders @ bfe1506 and implementation branch feat/production-orders are prepared locally. PR body drafts: /tmp/cpg-88-pr-spec.md and /tmp/cpg-88-pr-implementation.md. No shared push or PR exists. User Guard approval is required to publish both branches and QA screenshots. After approval: duplicate-check, publish design-only spec PR (Refs #88), publish implementation PR (Closes #88, Refs spec PR, Source doc, Tracking plan), apply labels, attach QA evidence, run the PR review loop and watch full CI. Move the source spec to implemented only after verification is complete, keeping the spec branch design-only. Release own issue claim while waiting.
