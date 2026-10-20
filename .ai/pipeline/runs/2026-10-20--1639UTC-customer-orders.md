# Customer orders — implementation of #83

Source doc: .ai/specs/2026-10-20--1635UTC-customer-orders.md
Design PR: #101
Status: in-progress
Engine: om-auto-create-pr (steps: 9, --loop: no)

## Goal
Both roles create and maintain tenant-local customer orders with one location and dated exact-quantity lines, Open state, audited UI/API parity and demo data.

## Scope
New customer-orders entities/service/validators/API/actions/screens, necessary material/location integrity guards, Test seed, translations/navigation/help and tests. No shipment, GI, stock posting, terminal command, forecast or MRP implementation. Reuse this cockpit linked worktree; spec is materialized locally from #101 and must not be committed to this implementation branch.

## Implementation Plan
### Phase 1: Aggregate and integrity
1.1 Add tenant-owned entities and generated additive migration with rollback/isolation tests.
1.2 Add strict quantity/date/line-identity input validators and tests.
1.3 Build transactional audited/versioned service and SQLite behaviour tests.
1.4 Add material/location usage guards and Test seed with regression tests.
### Phase 2: API and screens
2.1 Add keyed collection/item API and tenant actions, contract docs and tests.
2.2 Add translated list/detail/edit screens, aggregate form, help/navigation and unit tests.
2.3 Add API/browser integration journeys for both roles and integrity/refusal paths.
### Phase 3: Verification and publication
3.1 Reach 100% unit coverage; run lint, typecheck, coverage, build, integration and live mobile/desktop QA.
3.2 Run authoritative review/autofix, publish evidence and summary, make PR ready with full labels.

## Risks
Risk-high additive schema, new aggregate contract, conversion history and line identity. Real SQLite and HTTP tests must verify atomicity, tenant isolation, no-op behaviour and version increments from line-only edits. Docker may be unavailable for this macOS account; then run production standalone against a disposable DATA_DIR, disclose Docker-only startup test skip. No production action or base-branch push/merge.

## Log
- 16:39 UTC — Feature triage and PRD analysis complete. Design PR #101 is ready, scope review approved. Spec defaults posted on issue/PR. Local npm ci installed 913 packages (no lockfile change; 10 known high advisories). No runtime code written before plan. New implementation slot is free.

## Verification
- Design metadata checks: 2 test files, 6 tests passed. Full implementation gate pending.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Aggregate and integrity
- [ ] 1.1 Add tenant-owned entities and generated additive migration with rollback/isolation tests.
- [ ] 1.2 Add strict quantity/date/line-identity input validators and tests.
- [ ] 1.3 Build transactional audited/versioned service and SQLite behaviour tests.
- [ ] 1.4 Add material/location usage guards and Test seed with regression tests.
### Phase 2: API and screens
- [ ] 2.1 Add keyed collection/item API and tenant actions, contract docs and tests.
- [ ] 2.2 Add translated list/detail/edit screens, aggregate form, help/navigation and unit tests.
- [ ] 2.3 Add API/browser integration journeys for both roles and integrity/refusal paths.
### Phase 3: Verification and publication
- [ ] 3.1 Reach 100% unit coverage; run lint, typecheck, coverage, build, integration and live mobile/desktop QA.
- [ ] 3.2 Run authoritative review/autofix, publish evidence and summary, make PR ready with full labels.
