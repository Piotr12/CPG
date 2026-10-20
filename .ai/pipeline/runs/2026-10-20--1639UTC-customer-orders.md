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

- 16:49 UTC — Phase 1 complete: tenant-owned header/line entities, generated migration, strict validators, service, material/location guards and Test seed. Removed unposted lines stay hidden historical references so material type/base-unit locks survive. Audit keeps allowlisted lines as JSON text because existing AuditSnapshot values are scalar.

- 17:06 UTC — Phase 2 API/actions/screens and integration journeys written. First targeted browser run: 5/5 passed against production standalone. Fixed a test using audit.subjectId instead of the API’s audit.subject.id. Full unit gate passed 1,963 tests at 100%; fresh unit regression (4 dialog tests) protects the opening version across a conflict refresh. Rebuilding to run this sixth browser scenario and full integration. Docker script failed (no socket); browser doctor passed; disposable standalone descriptor in .ai/qa/test-env.json. Independent aggregate review finding fixed in d4f3394 and re-review approved.

- 17:14 UTC — Re-plan after full integration: 214 passed, 6 failed, 1 Docker-only skip. Three nav expectations omitted the new entry, one BOM expectation used old copy, and the standalone launcher omitted public icons (environment repaired). New conflict-UI test timed out; manual production two-browser reproduction confirms the error stays and the original version prevents a second overwrite. Changed test wait to expose closed-dialog state and will rerun focused tests on fresh data before the full suite. `npm run dev` also reproduces Next instant-shell validation/hydration failure on unchanged Materials; kept existing page pattern and did not expand into a global Next fix.

- 17:20 UTC — Root cause of stale UI rerun: overlay copy retained Next route-cache/APP_PAGE for Prod pointing to old chunk 1z49_qrah8k56; current standalone manifests and Test used fixed chunk 0yluc70m-nw2e. Prepared a new empty standalone directory with static/public and fresh data. No additional dialog patch needed. Focused customer-order/navigation/icons/BOM browser suite now running before full re-run. Added wrong-tenant order GET assertion to the new API journey.

## Verification
- Phase 1: lint/typecheck passed; full coverage passed, 289 files / 1,927 tests, all four measures 100%.
- Design metadata checks: 2 test files, 6 tests passed. Full implementation gate pending.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Aggregate and integrity
- [x] 1.1 Add tenant-owned entities and generated additive migration with rollback/isolation tests. — d9c84c4
- [x] 1.2 Add strict quantity/date/line-identity input validators and tests. — d9c84c4
- [x] 1.3 Build transactional audited/versioned service and SQLite behaviour tests. — d9c84c4
- [x] 1.4 Add material/location usage guards and Test seed with regression tests. — d9c84c4
### Phase 2: API and screens
- [ ] 2.1 Add keyed collection/item API and tenant actions, contract docs and tests.
- [ ] 2.2 Add translated list/detail/edit screens, aggregate form, help/navigation and unit tests.
- [ ] 2.3 Add API/browser integration journeys for both roles and integrity/refusal paths.
### Phase 3: Verification and publication
- [ ] 3.1 Reach 100% unit coverage; run lint, typecheck, coverage, build, integration and live mobile/desktop QA.
- [ ] 3.2 Run authoritative review/autofix, publish evidence and summary, make PR ready with full labels.
