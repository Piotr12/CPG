# Execution plan — audit history filters (E13-S03, #96)

Source doc: .ai/specs/2026-10-21--0944UTC-audit-history-filters.md (design PR #129)
Issue: #96
Branch: feat/audit-history-filters
Status: in-progress

## Goal

A user can trace one record's history in the tenant and Global audit. Both audits filter by record, account, channel and UTC date range, on the screens and through the API. The screen shows the business date beside the audit timestamp, links original and reversal movements, and labels everything in both languages. API response shapes do not change.

## Scope

- `db`: record indexes on both audit tables plus one migration.
- `core`: `auditListSchema` filters, `AuditService` (`auditWhere`, `reversalLinks`), `UserService.usernames()`.
- `app`: filter form, query/paging URLs, `businessDateOf`, subject history links, reversal links, cell wrapping, EN/PL labels, help topics.
- Tests: unit tests at 100% coverage, `tests/audit-labels.test.ts`, and `tests/integration/audit.test.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, engineering standards.

**Non-goals:** no producer or audit-write changes, no new response fields, and no "History" links on record screens (spec Q10).

## Implementation Plan

### Phase 1: Query and API
1.1 Record index migration, with tests for indexes, triggers, populated upgrade and query plan.
1.2 Extend `auditListSchema` with the filters.
1.3 Service filters (`auditWhere`) in `listGlobal`/`listTenant`.
1.4 `AuditService.reversalLinks` and `UserService.usernames`.
1.5 Route tests for filters; `BACKWARD_COMPATIBILITY.md` §4.

### Phase 2: Screens
2.1 Filter form, query and paging URLs, `businessDateOf`, wired into both pages.
2.2 Table: history link, business date, reversal links, wrapping; EN/PL labels; `tests/audit-labels.test.ts`; help topics.
2.3 Integration tests in `tests/integration/audit.test.ts`.

## Risks

- The migration generator could rebuild an audit table and drop its triggers. Inspect the generated SQL and test the triggers after migrating.
- The `filters` key lint rule: name props and keys `query`/`selected`/`filterForm`.
- Integration files share the admin and the database: scope assertions to this file's own records, and revoke its tokens.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Query and API

- [ ] 1.1 Record index migration
- [ ] 1.2 Audit list schema filters
- [ ] 1.3 Service filters
- [ ] 1.4 Reversal links and usernames
- [ ] 1.5 Route tests and compatibility notes

### Phase 2: Screens

- [ ] 2.1 Filter form and URLs
- [ ] 2.2 Table, labels and help
- [ ] 2.3 Integration tests
