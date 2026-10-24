# W1 — master data lists and the BOM editor

Port **3301**. Read `common.md` first.

**Your scope (concept folders, every layer):** `named-records` (+ `locations`, `customers`, `suppliers` services, pages and dictionary sections), `boms`, `planning-parameters`, `safety-stock`, `users`. Their integration files: `locations*`, `customers*`, `suppliers*`, `named-records*`, `boms*.test.ts`, `planning-parameters*.test.ts`, `safety-stock*.test.ts`, `users*.test.ts` (check `ls tests/integration`). Not `materials` (the lead's).

**Lists (sort + search):**
- Locations, customers, suppliers: ID, name, status. Search ID and name. They share `components/named-records/`: do it once there.
- BOMs: ID, output (by the output material's code), priority, valid from/through, status. Search the BOM ID and the output material's code and description.
- Planning parameters: material, location, procurement, lead time … whatever the table shows that is stored (not decimals as text). Search material code/description and location code/name.
- Safety stock: material, location, effective dates, status. Search as planning parameters.
- Users (global, `/admin/users`): username, role, status. Search the username.

**Forms (D8):** the BOM editor (`components/boms/recipe-form.tsx`, `create-bom-dialog.tsx`): the output and every component line's material become `Autocomplete`s (one per line, with an accessible name per line, e.g. "Component 2 material"); the line's unit select keeps working off the chosen material. Planning parameters and safety stock create forms: their material select becomes an autocomplete. Keep today's rules on which materials are offered (types, active).

**Watch:** BOM integration tests select materials today; switch them to `chooseFromList`. The BOM editor is a dialog: Escape inside an open autocomplete must close only the list (the component does this; test it once in the BOM editor).
