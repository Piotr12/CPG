# Execution plan: optional sort and search on the API list routes (#221)

**Date:** 2026-10-25 07:52 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue` feature route → `om-auto-implement-spec` → `om-auto-create-pr`)
Source doc: .ai/specs/2026-10-25--0746UTC-api-list-sort-search.md (on spec PR #230)

## Goal

The thirteen tenant list routes accept optional `q`, `sort` and `dir` query parameters. They validate them strictly through each list's `*-list.schema.ts` and pass them to the services, which already apply them. A request without them is unchanged.

## Scope

- `core/src/validators/lists/list-query.schema.ts`: the shared strict query shape and the two fixed messages.
- The eleven `*-list.schema.ts` files: one API query schema each.
- The thirteen `GET` handlers in `app/src/app/api/tenants/[tenant]/*/route.ts` and their `route.test.ts`.
- BACKWARD_COMPATIBILITY.md and `.ai/docs/engineering-standards.md`.
- The integration API files named in the spec.

## Non-goals

- Services, screens, entities, migrations: none change.
- `GET /api/users`, shipments, goods receipts and issues, audit and reports (spec Q2, Q4).
- No change to how any route treats query keys other than the three (spec Q1).

## Risks

- The sort-key names become public. They are the existing `*_SORTS` arrays, unchanged.
- The spec PR (#230) carries the spec file. This branch doesn't commit it, so the move to `implemented/` follows once both PRs merge.

## Implementation Plan

### Phase 1: sort and search on the tenant list routes

1. Shared strict `q`/`sort`/`dir` shape and messages in `list-query.schema.ts`, with tests.
2. One API query schema per `*-list.schema.ts`, keeping each route's unknown-key mode, with tests.
3. The thirteen `GET` handlers parse with their schema and forward the options, with route tests.
4. BACKWARD_COMPATIBILITY.md paragraph and per-route pointers, and the engineering-standards sentence.
5. Integration coverage in the existing API files.

## Progress

PR: #231

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: sort and search on the tenant list routes

- [x] 1.1 Shared strict query shape in list-query.schema.ts — dd5e4eba
- [x] 1.2 Per-list API query schemas — a64e50ee
- [x] 1.3 Route handlers parse and forward q/sort/dir — 72887952
- [x] 1.4 BACKWARD_COMPATIBILITY.md and engineering standards — afaf202e
- [x] 1.5 Integration coverage in the API files — 78dd5df5

## Log

- 07:52 Plan drafted: 5 steps, so plain `om-auto-create-pr` (threshold 20).
- 08:05 1.1–1.2: `listQueryShape(keys)` with fixed `SORT_KEY_MESSAGE`/`SORT_DIR_MESSAGE`. Each `*-list.schema.ts` exports `<x>ApiQuerySchema`: `z.object` for the unpaged lists, and `.extend` of the existing page schema for the paged ones, so each route keeps its strict or strip mode.
- 08:20 1.3: the 13 GET handlers parse and forward. The unpaged ones parse before opening the tenant, as forecasts and production orders already did. The existing route tests asserted exact service arguments, so they now expect `q: ""`; new tests cover forwarding, the 400s and unknown keys.
- 08:30 1.4: BACKWARD_COMPATIBILITY.md has a new "List search and sort on the API (#221)" section and per-route pointers; engineering standards got one sentence.
- 08:55 1.5: one test each in the nine API integration files. They ran against a fresh local standalone build (no Docker here): 9 files, 110 tests passed. Against the old server the unpaged lists would return every record, so the new assertions fail without the change.
- 09:05 Full gate: lint (only the existing `bom.service.ts` warning), typecheck, test:coverage (4,176 tests, 100% on all four metrics) and build: all exit 0.
- 09:20 Independent review (`om-auto-review-pr`, fresh-context reviewer): APPROVE, with 2 minors and 3 nits. Fixed: BACKWARD_COMPATIBILITY.md now states the 400 for a malformed `q`/`sort`/`dir` on routes that ignored unknown keys, the refusal of a blank `sort`/`dir`, and each route's search fields. #230 had merged, so main was merged in and the spec moved to `implemented/`. Left as is: routes differ on whether they parse before or after opening the tenant (400 vs 404 for a request wrong twice over). The paged routes kept their existing order; noted on the PR.
