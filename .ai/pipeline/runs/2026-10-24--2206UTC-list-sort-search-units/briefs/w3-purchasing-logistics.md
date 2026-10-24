# W3 — purchase requisitions, purchase orders, transfers

Port **3303**. Read `common.md` first.

**Your scope (concept folders, every layer):** `purchase-requisitions`, `purchase-orders` (and `purchasing` shared components under `components/purchasing/`), `transfers`. Their integration files: `purchasing*.test.ts`, `purchase-*.test.ts`, `transfers*.test.ts`, `goods-receipts*.test.ts` only where it breaks. Not goods receipts/issues lists (nested, D1), not materials.

**Lists (sort + search):**
- Purchase requisitions (paged): ID, material (code), location, supplier if shown, need date, status. Search requisition ID, material code/description.
- Purchase orders (paged): ID, supplier (code), location, order date, status. Search order ID, supplier code/name.
- Transfers (paged): ID, material (code), from/to location, dates, status. Search transfer ID, material code/description, location codes/names.

**Forms (D8):** the requisition form's material, the purchase-order form's line materials and the transfer form's material become `Autocomplete`s, one accessible name per line. Converting a requisition into an order keeps working.

**Watch:** lesson 2026-10-24 "Paging by ascending ID moves the row a test just created off the first page" — `purchasing.test.ts` finds new rows from the last page back; keep that working with the default order. `count({ q })` must use the same where as `list`.
