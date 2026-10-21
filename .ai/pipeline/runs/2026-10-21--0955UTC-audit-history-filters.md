# Execution plan — audit history filters (E13-S03, #96)

Source doc: .ai/specs/implemented/2026-10-21--0944UTC-audit-history-filters.md (design PR #129)
Issue: #96
Branch: feat/audit-history-filters
Status: complete

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

## Log

- 10:00 UTC — Phase 1 (index migration, schema, service filters, `reversalLinks`, `usernames()`, route tests, compat note) committed and pushed.
- 10:30 UTC — Phase 2 (filter form, query and paging URLs, business date, reversal and history links, cell wrapping, EN/PL labels for the five transfer actions and about 30 snapshot fields, help, `tests/audit-labels.test.ts`) committed.
  - Snapshot keys were surveyed by temporarily instrumenting the audit recorder during the core test run, then reverting it.
- 10:45 UTC — Integration: Docker failed with "no space left on device", so per the lessons nothing was pruned. The touched files ran against a fresh standalone production build via `CPG_BASE_URL`.
- Deviation from the spec: the new journeys live in their own file, `tests/integration/audit-history.test.ts`, with their own accounts.
- 11:10 UTC — Fresh-context review: changes requested (1 major, 4 minor, nits). All fixed in ad6f7ff:
  - Major: a refused filter now renders its reason in the form instead of a not-found page. The spec's UI/UX said not-found; the form's own hint invited the invalid combination.
  - The Global integration check now has a guaranteed row.
  - Subject types are scanned against the Record type lists.
  - The standards doc is updated.
  - Polish transfer terms match the Transfers screen.
- 11:20 UTC — QA evidence posted (7 screenshots); gate re-run green.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Query and API

- [x] 1.1 Record index migration — a13e20a
- [x] 1.2 Audit list schema filters — 7f37a56
- [x] 1.3 Service filters — 1025004
- [x] 1.4 Reversal links and usernames — 1025004
- [x] 1.5 Route tests and compatibility notes — 5aeb05c

### Phase 2: Screens

- [x] 2.1 Filter form and URLs — 9917fb2
- [x] 2.2 Table, labels and help — 9057355
- [x] 2.3 Integration tests — 4676298
