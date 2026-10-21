# Implement the production variance report — #95

Source doc: .ai/specs/implemented/2026-10-21--0947UTC-production-variance-report.md
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
- 10:25 UTC — Gate green on the final source: lint (one existing warning in `bom.service.ts`), typecheck, 467 files / 2,989 tests with 100% statements, branches, functions and lines, build. Touched integration files on a fresh standalone copy and fresh data: `variance-report.test.ts`, `variance-report-api.test.ts`, `navigation.test.ts`, `help.test.ts`, 4 files / 31 tests. Docker has no space left, so CI runs the image suite.
- 10:20 UTC — Browser QA on the standalone build: at 390 px the component sub-table was squeezed (IDs broke mid-number) and the range error pushed To out of line. Components now stack under the order below `md`, and the error has its own row; unit and integration tests assert both.
- 10:12 UTC — The first integration run failed on the test's own row reader: `cell.querySelectorAll("tbody tr")` matched through the outer table (lesson added), and the Extra badge had no text space before it. Both fixed; `navigation.test.ts` needed the new entry in its expected lists.
- 10:05 UTC — Core review of my own diff: the sort only saw orders in insertion order, so the 60-order test did not prove business-ID ordering. Orders now reach the sort in completion-UUID order; lesson updated. Kept only primitives for the orders in range.
- 09:57 UTC — Began from `spec/production-variance-report` (a211940) on `feat/production-variance-report` in the cezar worktree. Draft core files (schema, figures, service, DI lines) were started while the spec review ran; they are being reworked for the review's findings (tally, batched lines, `status`, `rows`, null output variance).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: core

- [x] 1.1 Query schema, pure tally, `VarianceReportService`, DI and index, with unit tests at 100%. — b4b37d9

### Phase 2: app

- [x] 2.1 Route, page, screen, sidebar entry and icon, EN/PL strings and help topic, with unit tests. — 431b030

### Phase 3: verification and delivery

- [x] 3.1 Integration files (`variance-report.test.ts`, `variance-report-api.test.ts`) and `navigation.test.ts`. — a916079
- [ ] 3.2 Docs (`BACKWARD_COMPATIBILITY.md` §4), full gate, review, PR, QA evidence and CI.
