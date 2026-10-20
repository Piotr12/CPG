# Stock ledger and corrections — #80
Source doc: .ai/specs/implemented/2026-10-20--1634UTC-stock-ledger-corrections.md
Spec PR: #103
Status: complete
Engine: om-auto-create-pr (steps: 6, --loop: no)

## Goal
Both roles inspect physical stock and post reasoned signed corrections with exact quantities, isolation, no-negative enforcement, master-data guards and demo balances.

## Scope
Stock entities/migration, core stock posting/usage/seeding, stock UI/API, EN/PL/help/navigation and tests. Excludes imports, transfers, reversals, operational documents and filtered reports.

## Implementation Plan
1. Persistence: exact signed quantity/schema helpers, stock entities and generated migration with rollback/isolation tests.
2. Posting: StockService atomic groups, fresh balances, master usage guards and seed openings with failure/race/audit tests.
3. HTTP: authenticated stock read and correction write routes/actions through shared gates, with tests.
4. UI: stock pair selection, balance/ledger, correction dialog, messages/help/navigation and behavior tests.
5. Verification: UI/API integration scenarios and full configured gate.
6. Publication: review, fix findings, browser evidence, ready implementation PR and lock release.

## Risks and decisions
- User directed autonomous completion. Signed manual changes follow #80/INV-006; source conflict documented in spec #103. Server UTC today; caller date discarded.
- Additive migration; down removes stock data and is only for disposable databases or deliberate backup/restore. Source spec is materialized for execution but remains on its separate design PR.
- Full gate: lint, typecheck, test:coverage (100%), build, test:integration. No dependency changes expected.

## Log
- 2026-10-20 17:29 UTC — Fresh import-fix re-review APPROVE at836e902; independently validated with116targetedtests and real SQLite/JSON/EN/PL probes, rerun successfully by parent. Final full standalone suite219passed/oneDocker-onlyskip(255.02s). Full lint/typecheck/build and1969unit100%pass. Publishing readyPR104, QA report and lock release; final-headCI monitored separately. No runtime changes after reviewed/tested836e902.
- 2026-10-20 17:23 UTC — Narrow review6cb2b64b requested changes: import row-error adapter discarded messageParams, so STOCK_NOT_EMPTY showed placeholders. Fixed public-context propagation, normalized existing string/number ImportIssue params at report boundary, and fallback to server text for incomplete translation context. Real migrated SQLite material/location dry-run regressions retain exact2.000001kg and leave masters/stock/audit unchanged; EN/PL report tests preserve it. Re-running full gate; no stock posting behavior changes.
- 2026-10-20 17:18 UTC — Final built standalone full suite passed: 27 files/219 tests, one Docker-only startup skip,247.66s. Final unit suite297files/1964tests at100%; lint/typecheck/build pass. Actual dev and isolated production browser smoke verified conversion, Polish refusal/audit, mobile fit; seven inspected PNGs published on qa-evidence/pr-104-stock. Independent narrow localization review6cb2b64b queued; full review approved. Spec moved on design branch only (f68730e).
- 2026-10-20 17:12 UTC — Localization refinement: lint, typecheck, full coverage (100% all metrics) and build passed. New error context is explicitly public messageParams, avoiding collision with existing import RowIssueError.params. Final standalone rerun starts from this build.
- 2026-10-20 17:12 UTC — Independent review approved 910072b; own 1,957 unit tests at 100%, own 219 standalone integration tests passed. Addressing two nonblocking refinements: contracts already registered; now public error params preserve quantity/pair context in Polish stock refusals, with translated audit actions/fields and regression assertions. Parent fresh full rerun had four intermittent tenant soft-navigation timeouts in existing tests; independent isolated full run passed. Rebuild latest source and rerun fresh without concurrent dev server.
- 2026-10-20 17:03 UTC — Full standalone integration: 217 passed, 2 failed, 1 Docker-only skipped. Stock scenarios passed. Failures: runtime copy omitted public icons (environment packaging; add public/), and api-users post-reset sign-in timed out before hydration. Re-plan: add login readiness wait using the existing hydrated helper, package public assets, rerun affected files then full suite on fresh data. No stock runtime change needed. Final ordered lint/typecheck/coverage/build passed (1,957 unit tests, 100% all metrics).
- 2026-10-20 16:56 UTC — HTTP/UI committed: all 1,956 unit tests passed with 100% lines/branches/functions/statements; production build passed. Five new standalone-browser integration scenarios passed. Docker socket unavailable, so full integration now runs against the same built standalone server with a fresh dataset; Docker startup check remains CI-owned. Added cached-master deactivation regression (passes without further code changes).
- 2026-10-20 16:46 UTC — Persistence/posting phase: targeted 7 files / 62 tests passed; lint/typecheck passed. Includes two-ORM competing withdrawal, rollback, negative fractional conversion, master guards and migration up/down. Edited demo references with a different base unit are skipped instead of breaking startup.
- 2026-10-20 16:41 UTC — Design published as #103. Reusing isolated cezar worktree; dependencies installed. Source investigation and previous pause preserved in design run log. Claim inherited from issue #80.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: persistence and posting
- [x] 1.1 Stock persistence and exact quantities — 9996321
- [x] 1.2 Atomic posting, usage guards and demo openings — 9996321
### Phase 2: user surfaces
- [x] 2.1 Stock API and actions — d2b1451
- [x] 2.2 Stock screen, help and translations — d2b1451
### Phase 3: verification and publication
- [x] 3.1 Integration and full validation — 836e902
- [x] 3.2 Review, UI evidence and ready PR — 836e902; publication metadata in final commit

## Final verification and handoff
- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`: PASS at 836e902; 297 files / 1,969 unit tests, 100% statements/branches/functions/lines. Logs: `/tmp/cpg-80-import-fix-{lint,typecheck,coverage,build}.log`.
- `CPG_BASE_URL=… npm run test:integration`: PASS on fresh production standalone copy including static/public, 27 files/219 tests; one Docker-only startup test skipped, 255.02 s. Log `/tmp/cpg-80-import-fix-integration.log`. Default Docker provisioning attempted; account has no runtime socket. GitHub CI for preceding source901e8a8 passed all jobs including Docker startup; final publication-head CI monitored without retaining the work lock.
- Review: full ledger APPROVE at910072b; localization delta CHANGES at901e8a8; import-context fix APPROVE at836e902. Parent reran the116test subset/probe; `git diff --check` PASS. No dependencies changed.
- Actual dev smoke and isolated production QA: exact -0.25t conversion, Polish no-negative refusal with exact context, preserved250kg, mobile390fit and translated audit. Seven inspected screenshots posted in PR104 comment6296800710 and permanent qa-evidence/pr-104-stock. See `.ai/qa/stock-80/REPORT.md`.
- Design-only PR103 owns the source spec moved to implemented/ (f68730e); implementation PR104 closes80 when merged. Source conflict resolved explicitly by delegated D07 erratum. No base merge or deployment performed.
- Follow-ups owned by pipeline: external approving review (author cannot self-approve), risk-high manual QA approval, and green final-head CI before merge. No pending implementation work.
