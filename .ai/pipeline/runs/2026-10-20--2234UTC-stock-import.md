# Execution plan — stock import (E07-S02, #81)

Source doc: .ai/specs/2026-10-20--2225UTC-stock-import.md
Spec PR: #116 (design only)
Issue: #81
Engine: om-auto-create-pr (steps: 11, --loop: no)
Earlier steps of this run (issue claim, spec, mockups): .ai/runs/2026-10-20--2221UTC-issue-81-stock-import.md (on `spec/stock-import`)

## Goal

Both roles import desired physical stock from a one-sheet workbook. A read-only dry run computes each position's signed movement or lists every error. An atomic commit with one reason posts all the movements as one `correction` posting, or refuses as stale when a listed balance changed. UI and API (STX-001…021, INV-016, TRF-014, API-028, AUD-022).

## Scope

- `core`:
  - generalize the master import's preparation over an `ImportLayout`;
  - `STOCK_LAYOUT`, `prepareStockImport`, the stock row and request schemas;
  - `StockImportService` (registered and exported).
- `app`:
  - `templateWorkbook(layout)`;
  - `GET /api/stock-import/template`, `POST /api/tenants/{tenant}/stock-import/{dry-run,commit}`;
  - the actions and page `/admin/[tenant]/stock-import`, with `ImportScreen` generalized;
  - the sidebar entry `stockImport` (with its icon) and the Stock page link;
  - English and Polish strings, the help topic `stock-import`, error translations.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, the engineering standards' adoption note.

**Non-goals:** master data in the stock workbook; in-transit corrections; reversals; exporting current balances; an inspection-only dry run in a read-only tenant; historical dates; any schema change.

## Implementation Plan

The spec's Implementation Plan, steps 1–11 (Phase 1: steps 1–4, Phase 2: steps 5–7, Phase 3: steps 8–11).

## Risks

- **The refactor of the master import's preparation.** Its unchanged test suite pins it.
- **The commit's write lock at 2,000 lines.** It is measured in step 4, with the chunked-posting fallback (spec Q11).
- **The sidebar must still fit 1280×800** (lesson). Run `navigation.test.ts` after the nav change.

## Measurements and deviations

- **2,000 rows (50 materials × 40 locations), local Vitest on SQLite.**
  - Dry run: 370 ms.
  - Commit of 2,000 new positions in one `postStockMovements` call: 23.5 s. Every query auto-flushed a growing identity map, as the reviewer predicted.
  - The spec's Q11 remedy, applied: one posting ID, flushed in chunks with `em.clear()` between them and a `firstPosition` offset on `postStockMovements`. Chunks of 100 took 2.0 s, of 50 1.4 s, and of 25 1.2 s, the size chosen. Over existing balances, chunks of 100 took 0.9 s.
  - The cap stays at 2,000 rows. A write lock of about 1.2 s stays under better-sqlite3's 5 s `busy_timeout`, so a concurrent writer waits, then succeeds.
- **`dryRun(prepared)` takes no actor.** It reads only and audits nothing; the spec's signature had one.
- **`CORRECTION_MOVEMENT` constant.** The `"correction"` movement type is now a constant in `stock-posting.ts`, used by `StockService` and the import.

- **The template has no example rows.** It has the header row only, with examples in the Instructions sheets, as in the master template. An example row left in place would post stock.
- **`ImportScreen` takes a `kind` (`masterData` | `stock`), not function props.** A server page can't pass functions to a client component.
- **`ImportLink` takes a `section`.** The Stock page links to Stock import, for both roles, while the tenant is writable.

## Verification

- `npm run lint`: 0 errors. One existing warning, in `bom.service.ts`, untouched.
- `npm run typecheck`: passes.
- `npm run test:coverage`: 416 files and 2,680 tests pass, with 100% statements, branches, functions and lines.
- `npm run build`: passes.
- **Integration, without Docker.** Docker had no space left on the device, and shared Docker state was not pruned (lesson). The files ran against the standalone build on a fresh data directory (`CPG_BASE_URL`): `stock-import-api`, `stock-import`, `navigation`, `import`, `import-api` and `stock`. 6 files and 47 tests passed. CI runs the full suite on the image.
- **The real app, in Test.** Driven by agent-browser:
  - the transit column and the row errors are shown;
  - a 4-row count previews −15 kg, a 12 box to 1200 each (+200), +40 and one No change;
  - "Stock count 2027-01" posted 3 corrections, and the Stock page shows 1200 each with the reason and the actor.

## Review

- **Verdict.** A fresh-context code review approved with no Critical or High findings: 1 Medium and 8 Low.
- **Fixed in 5074f00:**
  - the reason now resets with "Start another import";
  - a test covers a rollback across chunks, and another the stale return to step 2;
  - the outcome reads "Corrections: N", with no pluralisation;
  - duplicate positions are keyed `material/location`;
  - Entered shows the quantity as typed (2 case);
  - the Stock help points to Stock import;
  - the JSDoc says both methods clear the `em`;
  - the API's stale message is stock-specific.
- **After the fixes:** lint, typecheck and coverage pass (2,681 tests, 100%), and so does the build. On a fresh standalone build, `stock-import-api`, `stock-import`, `import` and `help` pass: 21 tests.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 Layouts: ImportLayout, MASTER_DATA_LAYOUT, read-sheets extraction — ea34c91
- [x] 1.2 Stock layout and schemas — c781507
- [x] 1.3 prepareStockImport — 72a1caa
- [x] 1.4 StockImportService with measurements — 6f5e5da

### Phase 2: Workbook and API

- [x] 2.1 templateWorkbook(layout) — 8d56333
- [x] 2.2 Routes and BACKWARD_COMPATIBILITY — e85d6b6
- [x] 2.3 API integration tests — d3a01e0

### Phase 3: Screen

- [x] 3.1 Actions — 2425510
- [x] 3.2 Generalized ImportScreen and stock labels — 1637d8c
- [x] 3.3 Page, navigation, strings, help — 97272c4
- [x] 3.4 Screen integration tests — 470a63c
