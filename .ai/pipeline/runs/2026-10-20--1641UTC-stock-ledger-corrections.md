# Stock ledger and corrections — #80
Source doc: .ai/specs/2026-10-20--1634UTC-stock-ledger-corrections.md
Spec PR: #103
Status: in-progress
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
- [ ] 3.1 Integration and full validation
- [ ] 3.2 Review, UI evidence and ready PR
