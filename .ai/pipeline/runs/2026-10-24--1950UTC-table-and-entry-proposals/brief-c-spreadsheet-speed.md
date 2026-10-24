# Brief C — "Spreadsheet speed": keyboard-first grid, query bar, inline completion

Port 3213 · session `proposal-c` · artifacts `c-artifacts/` · evidence folder `design-proposal-c/`

## Pitch

Planners live in Excel; make CPG feel like a fast spreadsheet with a command line, in the spirit of
**AG Grid** and **Airtable** (cell focus, inline editing, multi-sort), **Linear** and **GitHub search**
(structured query bar with tokens, `/` and `⌘K`), **Excel** (paste a block, Tab-accept). This is the
"power user" option: densest, fastest for repeat work, the biggest departure from today.

## Tables

- **Query bar** above the table, focused with `/`: free text plus **structured tokens with
  autocompletion** — typing `ty` suggests `type:`, then `raw | semi | finished`; `unit:kg`,
  `active:no`, `sort:-description`. Accepted tokens render as chips inside the input; the URL mirrors
  the query (`?q=type:raw unit:kg bolt`). A suggestion dropdown under the bar shows keys, values and
  recent queries.
- **Header sort** by click (asc → desc → off) and **Shift-click for multi-sort**, with small `1` `2`
  priority numbers next to the arrows.
- **Cell focus and arrow-key navigation**: a visible focused cell (ring token), ↑↓←→ moves, Enter opens
  the row, `e` edits the cell where allowed. Sticky header. A footer bar summing selected quantity cells
  ("3 rows · Σ 1,250 kg") like a spreadsheet status bar.
- **⌘K command palette** for "Go to material 00000012", "Create production order", "Open BOM of …".

## Data entry

- **Inline editing in tables** where entry is line-based (BOM components, order lines): an always-present
  empty last row; type the material, Tab to quantity, Tab to unit, Enter commits and opens the next row.
  Per-cell validation shows a danger border and a tooltip; nothing is saved until "Save lines".
- **Ghost-text completion** in unit and reference cells: typing `k` shows `kg` greyed after the cursor;
  Tab accepts. Ranking: the material's own base unit and conversions first, then most-used in this
  tenant, then the rest of the unit registry.
- **Units only from the registry, with forgiving input**: `kgs`, `KG`, `kilo` are corrected to `kg`
  with a "did you mean kg?" inline fix; anything else is refused in place.
- **Paste from Excel**: pasting a multi-row block into the BOM grid shows a preview of parsed rows with
  per-cell errors highlighted before they are added.

## Mockups to capture (at least 4)

1. Materials list with the query bar holding two chips (`type:raw`, `unit:kg`) plus free text, and the
   suggestion dropdown open; multi-sort arrows with `1` `2` visible.
2. A table with a focused cell (keyboard state), selection, and the Σ status bar.
3. BOM editor in inline-edit mode: a new row being typed with ghost-text `kg` in the unit cell, one cell
   showing a "did you mean" correction.
4. Paste preview with one row in error.
5. ⌘K palette open over a list page.

In "Cost and risk": a grid needs a real keyboard model and roving tabindex (accessibility work, screen
reader testing), query parsing in services (an allow-listed grammar, Zod), unit registry + migration +
backfill, whether to adopt TanStack Table (headless) or hand-roll, density vs. v1's "32 px controls",
size estimate (likely XL), and how it degrades on a phone.
