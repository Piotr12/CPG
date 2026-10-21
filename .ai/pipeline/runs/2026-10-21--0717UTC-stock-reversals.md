# Implement atomic stock reversals — #91

Source doc: .ai/specs/2026-10-21--0706UTC-stock-reversals.md
Spec PR: #124
Status: in-progress
Engine: om-auto-create-pr (steps: 8, --loop: no)

## Goal
Reverse one full receipt line, issue line or correction once, today, with reason and immutable linkage, updating stock and owning documents atomically through UI/API.

## Scope
Follow the spec's eight steps. Persistence/core, existing stock/PO/shipment/customer-order surfaces, validators, shared wrappers, translations/help and regression/integration tests. No production/transfer reversals, lifecycle commands, MRP, new dependencies or changes to history.

## Risks
- Exact captured quantity, tenant isolation, once-only races and atomic document/audit changes are mandatory.
- Historical locks must survive net progress returning to zero.
- Docker storage is full. Use fresh standalone local test copies; do not prune shared Docker state. CI owns the full image integration suite.
- Spec PR remains design-only. Its file/assets are materialized but intentionally uncommitted on this implementation branch until the design lands.
- User Guard prevents publishing to shared qa-evidence without approval. Prepare artifacts before any permission request; own feature/spec branch publication is authorized by the invoked workflow. Never merge into main.

## Log
- 2026-10-21 07:56 UTC — Independent review found retained shipment batches (608 managed records for 301 siblings). Added flush/clear per batch and generated tenant/order/code cursor index migration. 34 targeted tests pass, including late-batch rollback and query-plan checks. Original reversal/smoke integration passed 2 files / 6 tests. Re-running full gate before re-review.
- 2026-10-21 07:48 UTC — GR/GI reconciliation, bounded link reads, API/actions, UI controls and historical locks implemented. 441 files/2,855 tests pass with 100% all-metric coverage; lint (one existing warning), typecheck and build pass. Backend adapters/read metadata committed together because their regression tests verify the linked history. New integration journey is ready to run against fresh standalone output.
- 2026-10-21 07:28 UTC — Exact inverse and correction service committed; 65 targeted tests, core typecheck and stock lint pass. Real second-connection stale snapshot test proves once-only retry. Next GR/GI owning-document adapters.
- 07:20 UTC — Persistence gate: 66 tests across ORM/migration/export/entity/isolation suites pass, db typecheck passes. New migration generated from entity; smoke expects 25 migrations.
- Began from origin/main e8ceaae after design PR #124. Reused the cezar worktree, no nested worktree. npm ci installed. Baseline gate passed: lint (one pre-existing warning), typecheck, 431 files/2,789 tests with 100% coverage, build.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: immutable reversal engine

- [x] 1.1 Add StockReversal entity, migration and persistence/reset/isolation tests. — 96f4e0b
- [x] 1.2 Share resolved-line posting and exact historical inverse logic. — 782ccdf
- [x] 1.3 Implement correction reversal service, validation, audit and concurrency protection. — ddc9d10
- [x] 1.4 Implement GR/GI recalculation, sibling shipment states and historical edit locks.

### Phase 2: UI/API operation

- [x] 2.1 Add bounded read metadata/detail, API/actions and compatibility contract.
- [x] 2.2 Add reason dialog, existing-screen controls, links, translations and help.

### Phase 3: verification and delivery

- [ ] 3.1 Add and run touched integration files plus migration smoke; capture browser evidence.
- [ ] 3.2 Full validation gate, independent review, PR reporting, QA evidence and CI result.
