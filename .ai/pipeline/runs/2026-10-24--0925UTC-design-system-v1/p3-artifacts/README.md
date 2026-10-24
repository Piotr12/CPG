# P3 browser evidence

Viewport captures (not full pages) of the P3 screens on the realistic Test dataset (an API reset to `realistic`), taken on a standalone server at commit `d8966d8d` on port 3113. Names are `<screen>-<theme>-<language>-<width>.png`, widths 320, 768 and 1440 (900 px tall).

| Screen | What it shows |
|---|---|
| `materials-*` | the populated Materials list: ID column mono and sticky, type as a tag, Active as a quiet `StatusBadge` |
| `bom-*` | BOM 00000001: the record as the `h1`, its state as the header's `meta`, Edit recipe / Deactivate as the header's actions, the recipe with right-aligned quantities |
| `import-refusal-*` | a Materials workbook with an unknown ID and an unknown type: the error count as a danger `StatusBadge`, the summary `ErrorMessage`, the problems table |
| `stock-report-*` | the stock report: `PageHeader`, labelled filters, quantities right-aligned in tabular figures; at 320 px the figures stack beside a narrow sticky material column |
| `global-audit-*` | the Global audit (rendered by `audit/audit-view.tsx`): `PageHeader`, the filter form, the entries; the table scrolls in its own region at 768 px |
| `audit-*` | the Test tenant's audit right after the reset: its empty state |
| `tall-dialog-*` | Add planning parameters: Polish labels wrap, nothing clips, the actions stay reachable |

`metrics.json` (from the last capture run, so without the tenant `audit-*` rows) records, per capture, page sideways overflow, the visible `h1`s, which tables scroll, clipped buttons or labels, and for the dialog whether it fits and its submit is reachable. Every capture has exactly one `h1`, nothing clipped, and the dialog fits with its actions reachable. The one page overflow, `materials-*-en-320` (347 px), comes from the header actions row in `app/admin/[tenant]/materials/page.tsx` (P1's file, `flex shrink-0`, no wrap); P1's `PageHeader` conversion wraps it.
