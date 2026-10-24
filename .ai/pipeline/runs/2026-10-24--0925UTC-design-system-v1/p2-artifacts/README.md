# P2 artifacts — document screens

Captured from the final P2 build (standalone server on :3112) after a Reset Test to the realistic dataset, with
production orders 00000389/00000390, customer order 00000590 and purchase order 00000448 cancelled and customer
order 00000591 and purchase order 00000447 closed early through the new header control, so the lists mix statuses.

`<screen>-<width>-<theme>-<lang>.png`, at 320, 768 and 1440 px, light and dark, EN and PL (viewport captures):

- `production-orders-list` — page 4, scrolled to Completed / Open / Cancelled rows.
- `production-order-shortage` — 00000382 (4 components short): header with the Open badge, Edit, Post completion and Cancel order….
- `production-order-shortage-components` — the same order scrolled to the warning callout and the toned shortage rows.
- `purchase-order-detail` — 00000456: header with Close order early…, lines with status badges.
- `customer-orders-list` — page 6, scrolled to Open / Cancelled / Closed Early rows.
- `*-status-320|768-*` — the two lists at 320 and 768 px scrolled sideways inside the table to the Status column (sticky ID).

`metrics.jsonl` has one line per main capture: page overflow (none), shown `h1` count (always 1), clipped buttons,
badges, headings or column headers (none), and each table's own overflow.

_Lead, at the close: the 768 px captures were dropped from this folder to keep the run folder at the repository's size norm; the close QA attached to the pull request covers 768 px for the acceptance screens, and the metrics files above keep the measurements._
