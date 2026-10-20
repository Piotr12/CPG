# Implement atomic Test reset — issue #93

Source doc: .ai/specs/2026-10-20--1636UTC-atomic-test-reset.md
Spec PR: https://github.com/Piotr12/CPG/pull/105
Status: in-progress
Engine: om-auto-create-pr (steps: 8, --loop: no)

## Goal
Deliver the atomic, admin-only Test reset in UI/API, preserving Prod and all global identities, with rollback, generation and idempotency protection.

## Scope
The eight steps of the spec. No Prod reset, new demonstration records, backup product feature or slice-3 journeys. Source spec/assets are materialized from design-only PR #105 for reference and will not be committed to this implementation branch.

## Implementation Plan
Phase 1: persistence migration/helper, shared seeds, atomic reset service.
Phase 2: keyed reset API and fresh import-preview generation, Cave control UI/help.
Phase 3: integration/race evidence, contracts/acceptance, full gate and independent review.

## Risks
Tenant scoping, deletion and public write contract: risk-high. Same request em throughout. All four coverage measures stay 100%. Docker unavailable locally; use standalone production output with copied static and public assets before startup; CI must cover the image and startup-guard. Shared qa-evidence upload is guarded; link artifacts unless separately authorized.

## Log
- 17:01 UTC: Phase 2 implemented. API/race/import tests: 49 passed; UI tests: 34 passed. Regression without fresh-generation fix accepts the old preview (confirmed failing test); fixed code rejects it. Full unit suite: 1,922 passed, all four coverage measures 100%; lint/typecheck/build pass. New integration scenarios are running against a fresh standalone production server.
- 16:51 UTC: Phase 1 implemented. Targeted db tests: 28 passed. Core reset/demo/schema tests: 12 passed; typecheck passed. Generic deletion uses deferred FK checks for every owned table rather than duplicating dependency sorting; this also handles cycles, keeps FK enforcement on and rejects global references before deletion. Migration rollback tests updated for the new migration.
- Design PR #105 published after fresh scope/architecture review. Three design findings addressed: nine-digit generation cap, fresh import-preview generation and service-owned direct-call transactions. Baseline lint/typecheck/coverage/build passed; standalone baseline integration 213 passed and one Docker-only skip; static asset setup corrected and icons retested.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence and atomic service

- [x] 1.1 Test-audit deletion migration and generic db helper — 0c0ce42
- [x] 1.2 Shared ordered demo seed invocation — 0c0ce42
- [x] 1.3 Atomic Test reset service and generation schema — 0c0ce42

### Phase 2: API and UI

- [x] 2.1 Keyed reset API and fresh import-preview generation — 5f7c819
- [x] 2.2 Cave control, translations and help — 5f7c819

### Phase 3: Verification and publication

- [ ] 3.1 Integration and race evidence
- [ ] 3.2 Contract documents and acceptance evidence
- [ ] 3.3 Full gate, review and UI evidence
