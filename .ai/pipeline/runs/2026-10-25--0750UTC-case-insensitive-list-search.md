# Execution plan: list search ignores the case of Polish letters too

**Date:** 2026-10-25 07:50 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 223` → feature route → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/implemented/2026-10-25--0746UTC-case-insensitive-list-search.md` (spec PR #226)
**Issue:** #223
**Status:** done

## Goal

Make every list search ignore the case of every letter, Polish ones included, by registering an application-defined SQLite `like()` on every connection `@cpg/db` opens.

## Scope

- `packages/db/src/unicode-like.ts` (new) and `packages/db/src/orm.ts`.
- `packages/core/src/domain/lists/list-query.ts` (doc comment) plus a service-level regression test.
- `packages/app/src/help/topics.ts` (EN and PL sentence) and its test.
- `tests/integration/materials.test.ts` (search scenario).
- The spec moves to `.ai/specs/implemented/` once implemented (lesson "Close the paperwork in the PR that does the work").

**Non-goals:** accent folding (spec Q2), Unicode normalisation (Q3), API `?q=` (#221), indexes (#220).

**Stacking:** this branch starts from `spec/case-insensitive-list-search` (#226), so it carries the spec commit. Merge #226 first; the implementation PR's own diff is then only the implementation and the spec's move.

## Implementation Plan

### Phase 1: Unicode case-insensitive LIKE

1. `unicode-like.ts`: `likePattern` + `registerUnicodeLike` with a bounded cache, unit-tested through real SQL.
2. Register it in `initOrm`; a test proves a MikroORM `$like` find through `initOrm`.
3. Service-level regression: a Polish capital found from a lower-case word and the reverse, in both tenants. `searchWhere` doc comment updated.
4. Help copy (EN, PL) and its test.
5. Integration: the materials search finds a description starting with `Ł` from a lower-case word, with the match marked.
6. Measure a search over the realistic dataset's materials with and without the function.

### Phase 2: Paperwork

1. Move the spec to `implemented/` with implementation notes; finalize this log and lessons.

## Risks

- Per-row JS callback cost: measured in 1.6.
- LIKE semantics drift from SQLite's built-in: covered by tests run against the same SQL with the function and without it.

## Log

- 07:46 — spec PR #226 opened (Q1 `like()` override instead of the issue's shadow column; Q2 case only). The owner asked for the run to continue autonomously on reasonable assumptions, so the recommended defaults were applied; Q1 departs from the issue's stated preference and is flagged for review.
- 07:50 — branch `feat/case-insensitive-list-search` cut from the spec branch; draft PR #229.
- 1.1/1.2 landed as one commit (the `initOrm` test in `unicode-like.test.ts` needs the registration). Deviation from the spec: two registrations (2 and 3 arguments) instead of `varargs: true`. A probe showed that overriding the two-argument form leaves the built-in `ESCAPE` form in place, and per-arity registration keeps SQLite's own arity check.
- Regression proof: with the registration commented out, 5 of the real-SQL tests fail, the Polish-letter one among them.
- 1.3: Polish-letter tests added to the material and named-record services rather than requisitions. The reference path (`material.description` through a join) uses the same operator, so a third service would add nothing.
- 1.5: run against a local standalone server (Docker not used, lesson 2026-10-23): `materials.test.ts` 13/13 passed. A second pass on the same server fails on the file's fixed records, as expected (lesson 2026-10-24).
- 1.6: the realistic dataset is too small to time meaningfully, so it was measured on in-memory tables of 1,000 and 10,000 rows (see the spec's implementation notes).

## Changes

- `packages/db/src/unicode-like.ts` (+ test), `packages/db/src/orm.ts`
- `packages/core/src/domain/lists/list-query.ts` (comment), material and named-record service tests
- `packages/app/src/help/topics.ts` (+ test)
- `tests/integration/materials.test.ts`
- spec moved to `implemented/`, a lesson in `.ai/lessons.md`

## Verification

- `npm run lint`: exit 0 (one existing warning in `bom.service.ts`)
- `npm run typecheck`: exit 0
- `npm run test:coverage`: exit 0, 553 files, 4,106 tests, 100 % thresholds met
- `npm run build`: exit 0
- `npm run test:integration -- tests/integration/materials.test.ts` against a local standalone build: exit 0, 13 passed

## Follow-ups

- Accent folding in list search (spec Q2), if wanted: not filed, the spec records it as a decision rather than as owed work.

## Progress

PR: #229

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Unicode case-insensitive LIKE

- [x] 1.1 unicode-like.ts with likePattern, registerUnicodeLike and tests — 27e18b87
- [x] 1.2 Register it in initOrm — 27e18b87
- [x] 1.3 Service-level regression in both tenants — 3d8f24c2
- [x] 1.4 Help copy in EN and PL — bed8b906
- [x] 1.5 Integration test on the materials search — a60b0f5c
- [x] 1.6 Measure a realistic-dataset search — cd2e6c3e (figures in the spec's implementation notes)

### Phase 2: Paperwork

- [x] 2.1 Move the spec to implemented, finalize the log and lessons — cd2e6c3e
