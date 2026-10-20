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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [ ] 1.1 Layouts: ImportLayout, MASTER_DATA_LAYOUT, read-sheets extraction
- [ ] 1.2 Stock layout and schemas
- [ ] 1.3 prepareStockImport
- [ ] 1.4 StockImportService with measurements

### Phase 2: Workbook and API

- [ ] 2.1 templateWorkbook(layout)
- [ ] 2.2 Routes and BACKWARD_COMPATIBILITY
- [ ] 2.3 API integration tests

### Phase 3: Screen

- [ ] 3.1 Actions
- [ ] 3.2 Generalized ImportScreen and stock labels
- [ ] 3.3 Page, navigation, strings, help
- [ ] 3.4 Screen integration tests
