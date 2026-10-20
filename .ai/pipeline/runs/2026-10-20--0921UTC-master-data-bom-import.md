# Execution plan: master-data and BOM import from a workbook

**Date:** 2026-10-20 09:21 UTC
**Agent:** Claude Code / claude-opus-5-5. Chain: cezar → `om-auto-fix-issue 27` → feature route → `om-auto-write-spec 27` (spec PR #97) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-20--0908UTC-master-data-bom-import.md (spec PR #97)
Issue: #27

## Goal

The admin downloads one documented `.xlsx` template (a sheet per master plus BOM headers and BOM lines), uploads it for a dry run that runs every row through the real services in a rolled-back savepoint and reports every error or a create/update/unchanged preview, then commits it atomically only when the re-run matches the dry run's preview token. The same works through `POST /api/tenants/{tenant}/import/dry-run` and `…/commit` with idempotency keys.

## Scope

- `packages/core`:
  - `domain/imports/{workbook-layout,cells,prepare-import,recipe-diff,preview-token}.ts`;
  - `validators/imports/import-request.schema.ts`;
  - `http/request-transaction.ts` (`inRequestSavepoint`);
  - `services/imports/{import.service,apply-import}.ts` and `services/imports/rows/*`;
  - container, cradle, index.
- `packages/app`:
  - `components/imports/` (the workbook adapter, the screen, `labels.ts`);
  - `app/api/import/template/route.ts`, `app/api/tenants/[tenant]/import/{dry-run,commit}/route.ts`;
  - `app/admin/[tenant]/import/{page.tsx,actions.ts}`;
  - the sidebar entry, links on Materials and BOMs, i18n, help, error translations.
- Dependencies: `read-excel-file`, `write-excel-file`, `fflate` in `@cpg/app`.
- Tests: unit tests next to every file; `tests/integration/import-api.test.ts`, `tests/integration/import.test.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, the standards' adoption list.

**Non-goals:** stock imports; exporting current data; inspection-only dry run in a read-only tenant; an "Import" audit channel; Polish column headers; deleting records through the import.

## Risks

- **The spec is not on `main` yet.** It comes from spec PR #97 and is kept untracked in the worktree until #97 merges; then `main` is merged in and the spec moves to `implemented/`.
- **The savepoint mechanism (spec Q6)** is the critical piece: it is built and tested first (step 1.4) before anything relies on it.
- **The lock window** of the apply pass: measured in step 2.3.
- **Integration test files share one database and one admin** (lessons): assert only on records this file creates; use Prod.

## Deviations from the spec

- **The identity map is cleared after every row, not only after a refused one.** The first API integration run measured the 2,000-row dry run at 17.9 s. The map grew with every applied row, and each flush walked all of it. Every row now starts from an empty map: 0.4 s locally for 2,000 rows (`runRow`, with a regression test).
- **An import reference needs at least one letter** (the spec said "never eight digits"). In a BOM line's BOM column, digits are always read as a BOM ID, so a digits-only reference could never be named.
- **Issues carry language-neutral params for the screen:** `record` (the record kind) on unknown-ID and missing-reference errors, `rows` as a plain list (`2, 4, 6`), and `bom` on a line without a header. The screen translates every import code and every field message the import can carry; a service code without a translation shows the server's English message.
- **The template doesn't format the ID columns as text.** A column with no cells can't carry a format in `write-excel-file`. The importer zero-pads numeric IDs instead (spec Q9), so a typed `1` still reads as `00000001`.
- **The sidebar's Import entry has no lock icon while the tenant is read-only.** The sidebar renders its entries generically; the page shows the read-only message and disables the upload and the commit (spec Q11). The read-only text points to the Tenants page, as the sidebar labels it.
- **`canonicalJson` moved to `core/src/domain/json/`** (re-exported from the fingerprint module, unchanged), so the domain's preview token doesn't import a service.
- **`errorFormatter` in `components/boms/labels.ts` takes `Pick<BomsLabels, "errors">`**, so the import screen reuses the cycle and priority-clash details. No behaviour change.
- **The screen's count strings are functions** (`Commit 1 change`, `Show 2 unchanged rows`), and Polish keeps counts in parentheses.

## Implementation Plan

### Phase 1 — Engine

1. Layout and cells (`workbook-layout.ts`, `cells.ts`).
2. Diff and token (`recipe-diff.ts`, `preview-token.ts`).
3. Request schemas (`import-request.schema.ts`).
4. Savepoint helper (`inRequestSavepoint`).
5. Prepare and engine with the master sheets (`prepare-import.ts`, `apply-import.ts`, `ImportService`, row importers).
6. BOM sheets (`rows/boms.ts`).

### Phase 2 — Workbook and API

1. Adapter and dependencies (`components/imports/workbook-file.ts`).
2. Routes and `BACKWARD_COMPATIBILITY.md`.
3. API integration tests and the 2,000-row measurement.

### Phase 3 — Screen

1. Actions.
2. Screen components.
3. Page, navigation, i18n, help.
4. Screen integration tests, then the full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 Layout and cells — ab78382
- [x] 1.2 Diff and token — 2a1d48e
- [x] 1.3 Request schemas — 963e5fd
- [x] 1.4 Savepoint helper — 3d53b29
- [x] 1.5 Prepare and engine with the master sheets — 0b4fc7e
- [x] 1.6 BOM sheets — 0b4fc7e

### Phase 2: Workbook and API

- [x] 2.1 Adapter and dependencies — 9607bd5
- [x] 2.2 Routes and BACKWARD_COMPATIBILITY.md — b87263d
- [x] 2.3 API integration tests and the 2,000-row measurement — ed1aaf9

### Phase 3: Screen

- [x] 3.1 Actions — c746f19
- [x] 3.2 Screen components — c746f19
- [x] 3.3 Page, navigation, i18n, help — c746f19
- [ ] 3.4 Screen integration tests and the full gate
