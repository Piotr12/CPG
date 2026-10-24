# Brief A — "Quiet and honest": server-sorted headers, one search box, closed lists

Port 3211 · session `proposal-a` · artifacts `a-artifacts/` · evidence folder `design-proposal-a/`

## Pitch

The smallest change that fixes the owner's complaints, in the spirit of the **GOV.UK Design System**,
the **MOJ Pattern Library sortable table**, **GitHub Primer DataTable** and GOV.UK's
**accessible-autocomplete**. Everything works through the URL and the server, so it sorts and searches the
*whole* paged list, works with back/forward and shareable links, and adds **no new runtime dependency**.
It is the "boring, reliable, accessible" option: few new components, each with one job.

## Tables

- **Sortable headers.** A sortable column's header is a link (`?sort=description&dir=desc`, page reset to
  1) with `aria-sort` on the `<th>` and a 16 px Lucide `ArrowUp` / `ArrowDown` / muted `ArrowUpDown`.
  Click cycles asc → desc. One sort key at a time. Default sort shown (e.g. ID ascending). New
  `DataTableColumn.sort?: { key: string }` and a `sort` prop `{ key, dir, href(key, dir) }`.
- **One search box above the table**, labelled ("Search materials"), with a Search button, GET form
  (`?q=bolt`), matching ID and description. Below it a quiet result line: *"12 materials match “bolt”
  · Clear search"*. Matches highlighted in cells with `<mark>` styled by a token (propose
  `--highlight`/`bg-warning-surface`, justify it against "colour means state").
- Empty filtered state per v1: *"No materials match “xyz”." → Clear search*.
- Sort + search + page live together in the URL; the pager keeps them.

## Data entry

- **Units become a closed list**, not free text: a small, fixed registry grouped by dimension —
  Count (`pcs`, `box`, `pallet`), Mass (`g`, `kg`, `t`), Volume (`ml`, `l`, `m³`), Length (`mm`, `m`),
  Area (`m²`), Time (`h`) — each with a symbol and EN/PL name (UN/ECE Rec 20 codes as the stable key).
  Rendered as a `NativeSelect` with `<optgroup>`s: native type-to-select, perfect keyboard and
  screen-reader behaviour, works on phones. In the conversion dialog, the base unit and units already
  converted are disabled with a reason.
- **One accessible autocomplete** (ARIA 1.2 combobox + listbox, no library) only where a list is too
  long for a select: BOM component and order-line material pickers. Shows `00000012 — Bolt M8 · pcs`,
  matches ID and description, says "3 results" to screen readers, and refuses anything not chosen from
  the list (no free text slips through).
- Because the list is closed, the unit hint text and the "unit format" error disappear.

## Mockups to capture (at least 4)

1. Materials list, sorted by Description descending (arrow visible), no search.
2. Materials list with `q=bolt` (or a word in the realistic data): result line, highlighted matches.
3. Create material dialog: the unit control. Since a native select popup can't be screenshotted, render
   the grouped list visibly (e.g. a capture of the select with `size` set for the mockup) and caption it.
4. BOM editor (or Add component) with the autocomplete open, filtered, one option active.
5. Optional: 390 px Materials list showing the search stacked and headers still sortable.

In "Cost and risk", be concrete: services gain `sort`/`q` params validated by Zod with an allow-list of
sort keys; a `unit` registry (static table in `core` vs. an entity + migration — recommend one); the
migration/backfill risk for existing free-text units that aren't in the registry; size estimate.
