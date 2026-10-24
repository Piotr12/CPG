# Design proposal A: sortable lists, list search, closed units, material autocomplete

**Date:** 2026-10-24 22:06 UTC
**Agent:** Claude Code / Opus 5.5 (lead, cezar) + three Opus workers
**Spec:** none; the design is issue #217 (proposal A), chosen by the owner on 2026-10-25 ("lets implement A … end state a tested PR"). Decisions below fill what the issue leaves open.
**Status:** in progress
**Branch:** `cez/6a8b02d5` → one PR against `main` that closes #217.

## Goal

Every main list sorts by a header click and searches through one labelled box, both on the server across all pages; a new unit is chosen from a closed registry instead of typed; materials in entry forms are chosen with an accessible autocomplete that refuses free text. No new dependency.

## Decisions (defaults the owner can override in review)

- **D1 Lists in scope** (sort + search): materials, locations, customers, suppliers, BOMs, planning parameters, safety stock, users, forecasts, customer orders, production orders, purchase requisitions, purchase orders, transfers. **Out:** audit (cursor + its own filters), API tokens, stock, reports, import, and nested tables on detail pages (conversions, recipe lines, receipts, issues, shipments, completions, ledger, requirements).
- **D2 Search** is server-side: the query splits into at most 5 words (100 characters); every word must match one of the list's text fields (business ID, description/name, and the ID/description of a referenced material/customer/supplier where the list shows one) with `$like '%word%'`. `%`, `_` and `\` split a word, so they never act as wildcards. Case-insensitive for ASCII only (SQLite `LIKE`); stated in Help. Too long → the refusal is shown in the search form, the list unfiltered.
- **D3 Sort** is one allow-listed key per list plus `asc`/`desc`, the business ID as tie-breaker; a reference sorts by its business ID, never its UUID (lesson 2026-10-21). Default = today's order, so a URL without `sort` renders exactly as before. Unknown `sort`/`dir` fall back to the default (they come from links, not typing). Quantities stored as decimal strings are not sortable (they'd sort as text).
- **D4 URL contract**: `?q=&sort=&dir=&page=`; a new search or sort resets `page`; pagination keeps `q`/`sort`/`dir`; the search form keeps `sort`/`dir` in hidden fields; Clear search keeps the sort. Existing filters (forecasts' `material`/`location`) are kept too.
- **D5 No migration, no new index** in this PR: the lists are at most a few thousand rows. Follow-up issue: indexes for sorted columns when a tenant grows.
- **D6 API list routes unchanged** (`?page=` only; unknown keys stay 400). Services take the new options as optional arguments. Follow-up issue: `sort`/`q` on the API.
- **D7 Units**: a static registry in `core/src/validators/units/unit-registry.ts` (UN/ECE Rec 20 code, symbol = stored value, EN/PL name, dimension). Closed only where a **new** unit is defined: material `baseUnit` (create, update), conversion `unit`, and the import rows that define them. Document lines keep `unitSchema` (they must already be one of the material's units). Stored units outside the registry stay valid and readable; an edit form offers the current value as an extra option so a select never silently submits another (lesson 2026-10-23). API behaviour change recorded in `BACKWARD_COMPATIBILITY.md`. Unit selects are `NativeSelect` with `<optgroup>` per dimension.
- **D8 Autocomplete** replaces every **entry-form** control that chooses a material (BOM output and components, order/requisition/transfer lines, production order material, …). GET filter forms (forecasts, stock, reports) keep `NativeSelect`, which works without JavaScript. Customers, suppliers and locations stay selects.
- **D9** Every new string in `en.ts` and `pl.ts`; matches are marked with the neutral `--highlight` token (contrast pinned in `tokens.test.ts`).

## Steps

| # | Step | Owner | Status |
|---|---|---|---|
| F1 | `core`: unit registry + `registeredUnitSchema`; list query schema + search/sort helpers (`validators/lists/`, `domain/lists/`) | lead | done |
| F2 | `ui`: `DataTable` sort headers, `ListSearch`, `SearchResultLine`, `Highlight`, `--highlight`, `CrudField.groups`, `Autocomplete` | lead | done |
| F3 | `app`: list URL helpers, `lists` i18n section, `PageLinks` keeps the query; integration helper to choose from an autocomplete | lead | done |
| F4 | Materials pilot: sort + search + highlight; base unit and conversion unit selects; imports use the registry; unit test churn; integration test | lead | in progress (integration run pending) |
| W1 | Master data: locations, customers, suppliers, BOMs (list + recipe form autocomplete), planning parameters, safety stock, users | worker | todo |
| W2 | Sales and production: forecasts, customer orders, production orders (lists + material autocompletes in their forms) | worker | todo |
| W3 | Purchasing and logistics: purchase requisitions, purchase orders, transfers (lists + forms) | worker | todo |
| C1 | Merge workers one by one, gate after each; Help + BACKWARD_COMPATIBILITY + follow-up issues | lead | todo |
| C2 | Full gate, touched integration files, build, browser QA with screenshots, PR, CI green | lead | todo |

## Progress

- 2026-10-24 23:40 UTC — F1–F3 and the Materials pilot done: unit coverage 100 % (3,977 tests), lint and typecheck clean. Registered-unit refusal also covers a blank select ("Choose a unit from the list."); the edit form keeps a legacy unit (`materialEditFormSchema`, service checks only a changed unit). Autocomplete claims Escape on `window` in the capture phase while open, because Radix dialogs listen on `document` in the capture phase (B's prototype bug). Workers dispatched with `briefs/`.

- 2026-10-24 22:06 UTC — plan written.
