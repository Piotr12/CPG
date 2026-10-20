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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 Layouts: ImportLayout, MASTER_DATA_LAYOUT, read-sheets extraction — ea34c91
- [x] 1.2 Stock layout and schemas — c781507
- [x] 1.3 prepareStockImport — 72a1caa
- [x] 1.4 StockImportService with measurements — 6f5e5da

### Phase 2: Workbook and API

- [ ] 2.1 templateWorkbook(layout)
- [ ] 2.2 Routes and BACKWARD_COMPATIBILITY
- [ ] 2.3 API integration tests

### Phase 3: Screen

- [ ] 3.1 Actions
- [ ] 3.2 Generalized ImportScreen and stock labels
- [ ] 3.3 Page, navigation, strings, help
- [ ] 3.4 Screen integration tests
