# Implement the production variance report — #95

Source doc: .ai/specs/2026-10-21--0947UTC-production-variance-report.md
Spec PR: #132
Status: in progress
Engine: om-auto-create-pr (steps: 4, --loop: no)

## Goal
A read-only report of each production order's target and pinned-recipe expected consumption against the actual output and inputs its counted completions recorded: extra components, zero-output waste, reversed completions excluded and listed, filters, paging, UI and API (issue #95).

## Scope
The spec's four steps: core (schema, pure tally, `VarianceReportService`, DI), app (route, page, screen, sidebar, EN/PL, help), integration tests, docs. No migration, no write path, no completion reversal (#92).

## Risks
- Tenant scoping and read-only access on both channels (R05, TEN-018).
- Ordering by business ID, not by the UUID a completion references (lesson 2026-10-21).
- Bounded reads: completions and lines in batches without the identity map.
- Sidebar fit at 1280 × 800 with one more entry (lesson 2026-10-20).
- Docker storage is full: integration files run against a fresh standalone copy; CI owns the image suite.
- The implementation branch is based on the spec branch, so it carries the spec commits.

## Log
- 09:57 UTC — Began from `spec/production-variance-report` (a211940) on `feat/production-variance-report` in the cezar worktree. Draft core files (schema, figures, service, DI lines) were started while the spec review ran; they are being reworked for the review's findings (tally, batched lines, `status`, `rows`, null output variance).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: core

- [ ] 1.1 Query schema, pure tally, `VarianceReportService`, DI and index, with unit tests at 100%.

### Phase 2: app

- [ ] 2.1 Route, page, screen, sidebar entry and icon, EN/PL strings and help topic, with unit tests.

### Phase 3: verification and delivery

- [ ] 3.1 Integration files (`variance-report.test.ts`, `variance-report-api.test.ts`) and `navigation.test.ts`.
- [ ] 3.2 Docs (`BACKWARD_COMPATIBILITY.md` §4), full gate, review, PR, QA evidence and CI.
