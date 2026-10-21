# Implement atomic stock reversals — #91

Source doc: .ai/specs/implemented/2026-10-21--0706UTC-stock-reversals.md
Spec PR: #124
Status: complete
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
- The user authorized the prepared shared evidence publication in the subsequent autonomous-completion instruction. The eleven reviewed screenshots are published under qa-evidence/pr-125/b3ec0eb. Never merge into main.

## Log
- 2026-10-21 08:33 UTC — User instructed autonomous completion without further confirmation; published the prepared eleven screenshots and [QA report](https://github.com/Piotr12/CPG/pull/125#issuecomment-6311632759), then verified every raw PNG against its reviewed SHA-256. Finalizing both PR records and incorporating base a3db499 (documentation plus comment-only test references); no runtime changes. Latest-head CI will be followed on the PR after this final metadata push.
- 2026-10-21 08:30 UTC — Final source b3ec0eb independently approved. All local gates pass: 441 files / 2,858 tests at 100% in all four coverage measures, plus all four touched integration files (11/11) on fresh standalone data. Full CI run 39567497535 is green, including the production Docker suite (48 files / 339 tests). Eleven browser screenshots and a PASS report are ready; shared qa-evidence publication is the remaining Guard decision. Verified spec moved on design PR #124 only.
- 2026-10-21 08:09 UTC — Cold-load QA found blank Suspense placeholders on stock/receipt/shipment screens. Reused shared LoadingMessage on those three routes; 25 targeted page tests pass, including three fallback regressions. Full gate re-run pending build completion; this is the final UI correction before CI.
- 2026-10-21 08:06 UTC — Independent re-review approved 14db421; all four gates pass (2,855 tests / 100%). Rebuilt reversal+smoke tests pass6/6. Full CI identified two existing whole-row assertions needing the new Reverse control; updated receipts/shipments integration expectations and both affected files pass5/5. Browser state matrix passes: receipt success/history, issue restoration, identity locks, linked inverse, empty/loading/error/read-only/long content, EN/PL and360px keyboard flow. Ten reviewed screenshots prepared locally; shared qa-evidence publication still needs Guard approval.
- 2026-10-21 07:56 UTC — Independent review found retained shipment batches (608 managed records for 301 siblings). Added flush/clear per batch and generated tenant/order/code cursor index migration. 34 targeted tests pass, including late-batch rollback and query-plan checks. Original reversal/smoke integration passed 2 files / 6 tests. Re-running full gate before re-review.
- 2026-10-21 07:48 UTC — GR/GI reconciliation, bounded link reads, API/actions, UI controls and historical locks implemented. 441 files/2,855 tests pass with 100% all-metric coverage; lint (one existing warning), typecheck and build pass. Backend adapters/read metadata committed together because their regression tests verify the linked history. New integration journey is ready to run against fresh standalone output.
- 2026-10-21 07:28 UTC — Exact inverse and correction service committed; 65 targeted tests, core typecheck and stock lint pass. Real second-connection stale snapshot test proves once-only retry. Next GR/GI owning-document adapters.
- 07:20 UTC — Persistence gate: 66 tests across ORM/migration/export/entity/isolation suites pass, db typecheck passes. New migration generated from entity; smoke expects 25 migrations.
- Began from origin/main e8ceaae after design PR #124. Reused the cezar worktree, no nested worktree. npm ci installed. Baseline gate passed: lint (one pre-existing warning), typecheck, 431 files/2,789 tests with 100% coverage, build.

## Progress

PR: #125

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: immutable reversal engine

- [x] 1.1 Add StockReversal entity, migration and persistence/reset/isolation tests. — 96f4e0b
- [x] 1.2 Share resolved-line posting and exact historical inverse logic. — 782ccdf
- [x] 1.3 Implement correction reversal service, validation, audit and concurrency protection. — ddc9d10
- [x] 1.4 Implement GR/GI recalculation, sibling shipment states and historical edit locks. — 74ce569, 14db421

### Phase 2: UI/API operation

- [x] 2.1 Add bounded read metadata/detail, API/actions and compatibility contract. — 74ce569, fb7eecb
- [x] 2.2 Add reason dialog, existing-screen controls, links, translations and help. — fb7eecb

### Phase 3: verification and delivery

- [x] 3.1 Add and run touched integration files plus migration smoke; capture browser evidence.
- [x] 3.2 Full validation gate, independent review, PR reporting, QA evidence and CI result. — b3ec0eb; final documentation CI tracked on the PR.

## Outcome and follow-ups

- PR #125 implements the complete eight-step plan; design PR #124 stays documentation-only and carries the verified spec under `implemented/`.
- [Final independent review](https://github.com/Piotr12/CPG/pull/125#issuecomment-6311298640): approve at b3ec0eb, no actionable findings.
- [Source CI](https://github.com/Piotr12/CPG/actions/runs/39567497535): all five jobs green, 2,858 unit tests with 100% coverage and 339 production-Docker integration tests. All four touched integration files also pass locally, 11/11. Final documentation/base-sync CI is reported on each PR.
- [Browser QA evidence](https://github.com/Piotr12/CPG/pull/125#issuecomment-6311632759): PASS, eleven embedded screenshots. No automatic QA approval; human review and QA sign-off remain merge gates.
- No dependency changes, production access, base-branch writes or merge performed. Task-owned runtime and browser stopped.
