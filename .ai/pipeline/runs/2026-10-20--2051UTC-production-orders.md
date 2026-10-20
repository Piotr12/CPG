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
- Reuse cezar linked worktree; no nested worktree. Spec committed separately on spec/production-orders, materialized here untracked per om-auto-implement-spec. Spec-only branch stays design-only.
- User Guard defers all remote branch publication/PR creation until concrete local work is reviewed and approved; continue authorized reversible local implementation first. No push attempted.
- Fresh-context scope review passes; explicit recipe choice must remain current at save. Lead-time changes between preview and save use latest-at-create and authoritative response.
- Spec-stage lint passed with one pre-existing BOM unused-import warning; 6 metadata tests passed. npm ci used unchanged lockfile (913 packages; 10 known advisories).

## Verification
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
- [ ] 2.1 API/actions and contract
- [ ] 2.2 Translated screens, navigation and help
- [ ] 2.3 Focused integration journeys

### Phase 3: Verification and publication
- [ ] 3.1 Full local gate and live UI evidence
- [ ] 3.2 Review, publication and final CI
