# Implement atomic Test reset — issue #93

Source doc: .ai/specs/implemented/2026-10-20--1636UTC-atomic-test-reset.md (design-only PR #105)
Spec PR: https://github.com/Piotr12/CPG/pull/105
Status: complete
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
- 17:25 UTC: Final pristine standalone integration run passed: 28 files, 221 tests, one Docker-only skip (253.13s). Full gate complete: lint/typecheck/build pass, 294 files / 1,922 unit tests, 100% statements/branches/functions/lines. Independent static review has no remaining findings. Dev screenshots/report saved; formal QA evidence is PARTIAL (Docker unavailable; delayed pending state unit-tested). Publish ready PR #106, leave review + needs-qa/risk-high; author account cannot self-approve.
- 17:22 UTC: Independent investigation confirmed the local failure: Next route-cache test.meta/TEST.meta/Test.meta share inode 41209918 on case-insensitive APFS and contain a 404 tagged /admin/TEST. The existing invalid-uppercase tenant test poisons a reused standalone directory; changing DATA_DIR alone cannot clear that cache. Keep negative tests and app behavior intact, use a pristine runtime copy per run; lesson recorded. New untouched final-build run continues without failures.
- 17:21 UTC: Reproduced the soft-navigation failure only against the reused standalone artifact. Start a new immutable copy of the final build (including static/public assets) with an empty DATA_DIR on port 3295; rerun the full integration suite there. Preserve the previous runtime for independent investigation; do not change routing or weaken assertions.
- 17:20 UTC: Final lint/typecheck/coverage/build passed again (1,922 tests; 100% all metrics). Full standalone rerun: 217 passed, four soft-navigation timeouts, one Docker-only skip. Manually reproduced Test→Prod→Test 404; first full run passed this navigation. Stop/re-plan: inspect copied build/runtime artifacts and obtain an independent read-only investigation before changing application code. No tests or checks are weakened.
- 17:14 UTC: Contracts and acceptance evidence updated. Independent static review: no blocker/major; its one stale acceptance-note finding is corrected. First full standalone run: 219 passed, two obsolete generation/migration assertions failed, one Docker-only skip. Corrected consumers: 14 tests pass on the current generation. Final full run uses a fresh database. Manual dev-browser checks pass for English success, two-browser stale rejection and Polish/dark 390px read-only reset.
- 17:06 UTC: Seven new real browser/API scenarios pass. Initial integration assertions were corrected to the public audit view (nested actor/token) and the document preference effect is awaited after hydration. Existing tenant metadata integration test now accepts the current Test generation in the shared app. Full fresh standalone suite running; independent static review running.
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

- [x] 3.1 Integration and race evidence — b6dd87e
- [x] 3.2 Contract documents and acceptance evidence — 3f045ed
- [x] 3.3 Full gate, review and UI evidence

## Verification and outcome
- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`: exit 0. Coverage 4567/4567 statements, 1928/1928 branches, 1569/1569 functions, 4050/4050 lines.
- `CPG_BASE_URL=http://127.0.0.1:3295 npm run test:integration`: 221 passed, one Docker-only skip. Logs: `/tmp/cpg-issue-93-validation/final-*.log` and `immutable-build-integration.log`.
- Parent execution provides the full gate. Independent static review found no blocker/major, and its single minor was fixed. Two-connection race and fault tests use real migrated SQLite. The import regression fails without the fresh-generation fix.
- Local QA artifacts: `.ai/qa/artifacts_issue-93/report.md`, `report.json`, five referenced screenshots. Supplemental dev-browser states pass; Docker provisioning and manually delayed pending UI were not exercised. Pending/disabled behavior is covered by unit tests. Shared evidence publishing was not authorized; tracker artifact-path fallback used. No self-QA approval.
- Source design/spec assets remain exclusively on PR #105; its spec moves to implemented/ after verification. No base merge or production action.
- Follow-ups are the normal review/QA gates and production-image CI. CI status at publication may be pending; the final PR comment records the outcome without another source push.

PR: #106 (link: https://github.com/Piotr12/CPG/pull/106)
Issue: #93 (link: https://github.com/Piotr12/CPG/issues/93)
