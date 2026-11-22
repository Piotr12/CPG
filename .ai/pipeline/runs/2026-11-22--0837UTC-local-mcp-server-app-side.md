# Local MCP server, Phase 1: the app side

**Date:** 2026-11-22 08:37 UTC
**Agent:** Claude Code (Opus 5.5), autonomous, `om-auto-fix-issue 393` → feature route → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-22--0818UTC-local-mcp-server.md`
**Issue:** #393 (Refs: this PR is Phase 1 only; the Python server ships on a later PR)
**Status:** complete

## Goal

Ship the spec's Phase 1 on its own PR, as the spec's Implementation Plan says: `GET /api/me`, an operation registry describing every API route handler, the generated `mcp/cpg_mcp/catalogue.json`, and the parity and drift tests that keep the three in step. Nothing reads the catalogue yet.

## Scope

- `packages/app/src/app/api/me/route.ts` (+ test), listed in `BACKWARD_COMPATIBILITY.md` §4.
- `packages/core/src/http/tool-json-schema.ts` (+ test), exported from `@cpg/core`: `toToolJsonSchema(schema)`, Zod 4 `z.toJSONSchema` with `io: "input"`, `unrepresentable: "throw"`, `$schema` stripped, refused `z.never()` fields dropped and named in the description (A10).
- `packages/app/src/api-catalogue/operations.ts` (+ test): `API_OPERATIONS`, one entry per handler (116 today plus `me.get`).
- `packages/app/src/api-catalogue/catalogue.ts` (+ test): the pure `buildCatalogue()` and its serialization, with the drift test against the committed JSON.
- `packages/app/scripts/mcp-catalogue.ts` (+ test): the `npm run mcp:catalogue` entry that writes `mcp/cpg_mcp/catalogue.json`.
- `tests/api-catalogue.test.ts`: the route walk that ties the registry to the route files.
- Root `package.json`: the `mcp:catalogue` script.

## Non-goals

- Any Python (Phases 2–4), the CI `python` job, `BACKWARD_COMPATIBILITY.md` §6.
- Any change to an existing route, header, validator or message.
- Moving the spec to `implemented/`: the last PR of the feature does that.

## Implementation Plan

### Phase 1: app side

1. `GET /api/me` and its tests; `BACKWARD_COMPATIBILITY.md` §4 entry.
2. `toToolJsonSchema` in core; the operation registry with its unit tests.
3. `tests/api-catalogue.test.ts`, the route ↔ registry parity test.
4. The catalogue builder, the `mcp:catalogue` script, the committed `catalogue.json` and the drift test.

## Risks

- The registry is hand-maintained; the parity test proves the schema is on the request's path, not that it is the only parse (spec step 3's stated limit).
- Zod patterns use `\p{L}` (Unicode property escapes). Python's `re` can't compile them, so Phase 2's argument validator must account for it. Recorded for Phase 2, not handled here.

## Decisions and deviations

- `buildCatalogue()` lives in `packages/app/src/api-catalogue/catalogue.ts`, and `packages/app/scripts/mcp-catalogue.ts` only writes its output. The spec put both in the script; the split keeps the script a two-line entry tested like `core/scripts/migrations.ts`, and the drift test beside the builder.
- `reports.variance` names `varianceReportQuerySchema`, the schema the service parses, not `varianceReportFieldsSchema`: the parity test requires the named schema on the request's path, and `z.toJSONSchema` ignores the range refinement, so both produce the same JSON.
- The Test reset's `write` is `tenant`: its header contract (key and generation) is a tenant write's, and `testResetApiWrite` implies admin.

## Progress

PR: #402

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: app side

- [x] 1.1 GET /api/me and its BACKWARD_COMPATIBILITY entry — 0b52c786
- [x] 1.2 toToolJsonSchema and the operation registry — 18d4852a
- [x] 1.3 Route and registry parity test — f76e8644
- [x] 1.4 Catalogue builder, script, committed catalogue and drift test — d5c925ce, 2e2caa54

## Verification

- `npm run lint`, `npm run typecheck`: exit 0.
- `npm run test:coverage`: 687 files, 5,749 tests passed, 100% statements, branches, functions and lines.
- `npm run build`: exit 0 on the second run. The first stopped on Next.js's `SecurityFatalError` notice (moderate advisories GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8 on `next` 16.0.0–16.4.4, already on `main`). Not upgraded here: it is out of this PR's scope and left for the owner.
- `tests/integration/api-tokens.test.ts`: 9/9 against a local standalone build (no Docker on this machine), including the new `/api/me` test.
- The parity test was checked by mutation: a dropped entry, a wrong role, a wrong body schema and a missing body schema each failed their own check.
