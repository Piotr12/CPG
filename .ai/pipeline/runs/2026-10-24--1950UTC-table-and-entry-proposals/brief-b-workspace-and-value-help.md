# Brief B — "Workspace lists and value help": filter bar, saved views, smart comboboxes

Port 3212 · session `proposal-b` · artifacts `b-artifacts/` · evidence folder `design-proposal-b/`

## Pitch

A list screen becomes a **workspace**, in the spirit of **SAP Fiori** (smart filter bar, variant
management, value help dialog / F4), **Shopify Polaris** (IndexFilters with saved-view tabs,
IndexTable) and **IBM Carbon** (data table toolbar, column header sorting). Data entry gets
**smart comboboxes** in the shadcn idiom (Popover + Command, i.e. `cmdk`, added with
`npx shadcn@latest add command popover` in `packages/ui` — that new dependency is part of the proposal).
This is the "ERP done properly" option: more surface, more power, still mouse-friendly.

## Tables

- **Toolbar above the table** (one row, wraps at narrow widths): search input with a `Search` icon and
  inline clear; **filter chips** (`Type: Raw ×`, `Unit: kg ×`, `Status: Active ×`) and a `+ Filter`
  button that opens a popover listing facets **with counts** ("Raw 48 · Semi-finished 12 · Finished 9");
  "Clear all"; a **Columns** menu (show/hide priority-2/3 columns) and a density toggle (compact 32 px /
  comfortable 40 px rows) on the right.
- **Saved views as tabs** above the toolbar: `All · Raw materials · Inactive · + Save view`; a modified
  view shows a dot and "Save / Save as new". Views are per user (stored with preferences).
- **Header menu** on each column: click the header text to sort (arrow + `aria-sort`), or its `⋯`
  chevron for Sort ascending / Sort descending / Filter by this column / Hide column.
- Result count in the toolbar ("69 materials · 3 filters").

## Data entry

- **A Unit registry as master data**: code, symbol, EN/PL name, dimension (count, mass, volume, length,
  area, time), active flag — its own admin list (mock a "Units" page if time allows). Only active
  registry units can be chosen anywhere.
- **`Combobox` field type for `CrudForm`** (`type: "combobox"`): type-ahead over code, symbol, names
  in both languages and synonyms (`kilo`, `kilogram`, `kg` → `kg`), results grouped by dimension, the
  most used units in this tenant first with a muted usage count, keyboard-complete (↑↓, Enter, Esc).
- **Value help** for long reference lists (materials on BOM components and order lines): the combobox
  shows the top matches with ID, description, type badge and base unit; its last row "Search all
  materials…" (or F4) opens a **value help dialog** with its own search, facet filters and a small
  sortable table to pick from.
- **Derived suggestions**: in Add conversion, choosing a unit of the same dimension as the base unit
  pre-fills the factor (kg → g = 1000) with a "Suggested" tag the user can overwrite; a different
  dimension (box → pcs) leaves it empty with a hint.

## Mockups to capture (at least 4)

1. Materials list: saved-view tabs, toolbar with search + two active filter chips, result count,
   one header showing a sort arrow.
2. The `+ Filter` popover open with facet counts (or a header `⋯` menu open).
3. Create material dialog with the unit combobox open, typed "ki", grouped results.
4. BOM component material picker open with rich rows, plus a capture of the value help dialog.
5. Add conversion with a suggested factor.

In "Cost and risk": `cmdk` dependency (check it is already used by shadcn `command`), a Unit entity +
migration + backfill of existing free-text units, faceted counts as an extra grouped query per list
(performance on SQLite with paging), saved views stored in preferences, size estimate (likely L).
