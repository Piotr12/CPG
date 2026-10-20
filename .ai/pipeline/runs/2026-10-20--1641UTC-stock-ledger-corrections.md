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
- 2026-10-20 16:41 UTC — Design published as #103. Reusing isolated cezar worktree; dependencies installed. Source investigation and previous pause preserved in design run log. Claim inherited from issue #80.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: persistence and posting
- [ ] 1.1 Stock persistence and exact quantities
- [ ] 1.2 Atomic posting, usage guards and demo openings
### Phase 2: user surfaces
- [ ] 2.1 Stock API and actions
- [ ] 2.2 Stock screen, help and translations
### Phase 3: verification and publication
- [ ] 3.1 Integration and full validation
- [ ] 3.2 Review, UI evidence and ready PR
