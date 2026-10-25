# Autocomplete for customer, supplier and location pickers and the report filters

**Status:** ready
**Created:** 2026-10-25 07:51 UTC
**Issue:** #222 (follow-up to #217 / PR #225, whose decision D8 kept these controls as selects) · **Builds on:** the `Autocomplete` of #225 (`packages/ui/src/backend/forms/autocomplete.tsx`) and the material picker helpers (`app/src/components/materials/material-picker.ts`) · **Also bound by:** `BACKWARD_COMPATIBILITY.md`, `.ai/docs/engineering-standards.md` ("Reusable server & UI layers").

## 📝 TLDR

Planners choose customers, suppliers and locations from native selects that grow with the master data, and the Forecasts, Stock and report filters do the same for materials. After this change every one of those controls is the type-to-find `Autocomplete` that #225 gave material pickers. The filter forms still work before JavaScript loads: they render a native select first and switch to the autocomplete once hydrated. Separately, the autocomplete's list gets an accessible name everywhere, taken from the field's visible label through `aria-labelledby`. There is no new dependency, no API change and no migration.

## Resolved assumptions (autonomous defaults)

| # | Question | Answer applied | Why |
|---|---|---|---|
| Q1 | The issue bundles three capabilities (entry pickers, filter autocompletes, the listbox name). Split into separate specs? | **No.** One spec and one implementation PR, in three phases that can each ship alone. | The owner filed them as one follow-up, they share one component and one helper, and the listbox name has to be fixed before more forms use the combobox. |
| Q2 | How do the GET filter forms keep working without JavaScript? | **Progressive enhancement.** The server and the first client render show today's `NativeSelect`. After hydration the same control renders an `Autocomplete` whose hidden input has the same `name`. | It is the only way the GOV.UK pattern #217 borrowed keeps a no-JS path. It adds no API, and a reader on a slow link can filter before hydration. |
| Q3 | Do the filters offer inactive records? | **Yes, as today, marked.** An inactive record's option shows "Inactive" as its quiet `detail`. Entry forms keep offering active records only (MAT-029, LFC-019), plus the record's current value when it is inactive (customer-order edit). | This keeps today's filtering rules; only the control changes. |
| Q4 | A well-formed but unknown `?material=` / `?location=` in the Forecasts filter shows "Any" while the list is filtered to nothing. Fix it here? | **Yes, minimally.** The filter adds the URL's value as its own option, so the field shows the ID. The option's name is a new `lists.notListed` string (EN "not in the list", PL "nie ma na liście"), and it appears in both the select and the autocomplete. This follows lesson 2026-10-23 "Filter forms" and the existing `unlisted()` in `audit-filters.tsx`. | A filter switched to an autocomplete would otherwise show an empty field over a filtered list, which is worse than today's mismatch. It is a few lines and needs no API change. |
| Q5 | Are the words per kind or shared? | **Per kind.** `lists.customerPicker`, `lists.supplierPicker` and `lists.locationPicker` sit beside `lists.materialPicker`, in EN and PL. | Polish declension ("Żaden klient…", "Żadna lokalizacja…") rules out one template with a noun slot. |
| Q6 | Where does the Stock screen's empty choice go? Stock always shows one pair, and `?material=` with an empty value is a 404 today. | **An empty value means "not given".** `stock/page.tsx` treats `""` like a missing parameter, so the screen falls back to the first material or location as it does now. | Clearing a field and pressing Filter must never land on Not found. |

## 📝 Problem Statement

- #217 measured material lists of hundreds of rows, too long for a select, and gave every material picker in an entry form an `Autocomplete`. Its decision D8 deliberately left two groups as native selects, and #222 records them:
  - **Entry-form pickers of customers, suppliers and locations.** There are eleven controls in eight forms (inventory below). These masters grow too, and a planner now meets two different controls on one dialog: an autocomplete for the material and a select for the location.
  - **The material and location filters** of Forecasts, Stock, the stock report and the variance report. They are GET forms that work before hydration, so a client-only autocomplete would break them without JavaScript.
- **The list has no name.** The `ul[role=listbox]` takes its name only from `aria-label`. CrudForm fields and the BOM output field are labelled by a `<Label htmlFor>`, so their list is unnamed (WCAG 4.1.2). Naming it after the label (tried in #217) made `getByLabelText` match both the input and the list in six unit tests, so the change was reverted.

### Inventory (verified on `main@b038d3d1`)

| Form | Field(s) | File | Today |
|---|---|---|---|
| Customer order create/edit | customer, location | `customer-orders/order-form.tsx` (options from `choice()` in `order-screen.tsx`) | hand-built `NativeSelect`; active records plus the current value; locked once a line is posted |
| Purchase order create | supplier, location | `purchase-orders/order-form.tsx` | hand-built `NativeSelect` (`activeOptions`). Changing the location clears requisition links that no longer match |
| Requisition create | location | `purchase-requisitions/requisition-form.tsx` | hand-built `NativeSelect` (`activeOptions`) |
| Transfer create | source, destination | `transfers/transfer-form.tsx` | hand-built `NativeSelect` ×2 (`activeOptions`) |
| Add forecast | location | `forecasts/add-forecast-dialog.tsx` | CrudForm `select` (`locationOptions`) |
| Add safety-stock target | location | `safety-stock/add-safety-stock-target-dialog.tsx` | CrudForm `select` (`locationOptions`) |
| Add planning parameters | location | `planning-parameters/planning-parameter-fields.ts` | CrudForm `select` (`locationOptions`) |
| Production order create | location | `production-orders/production-dialog.tsx` | CrudForm `select` (inline options, label without the em dash) |
| Forecasts filter | material, location | `forecasts/forecasts-filter.tsx` | GET form, "Any" first, inactive unmarked |
| Stock screen | material, location | `stock/stock-screen.tsx` | GET form, no empty option, inactive marked |
| Stock report | material, location | `reports/stock-report-screen.tsx` | GET form, "All" first, inactive marked |
| Variance report | material, location | `reports/variance-report-screen.tsx` | GET form, "All" first, inactive marked |

These forms don't choose a customer, supplier or location, so they are out of scope: shipments, goods receipts and issues, transfer postings, completions, stock corrections, and the edit and remove dialogs keyed by a fixed material/location pair. Audit filters have no master-data select.

## 📝 Proposed Solution

1. **Name the list (`ui`).** `Autocomplete` takes an optional `aria-labelledby`, and its listbox is named by `aria-labelledby`, falling back to `aria-label`. `CrudForm` gives each field's `<Label>` an id and passes it to `Autocomplete`, and the BOM output field and every hand-built picker do the same. Unit tests that found a combobox with `getByLabelText` switch to `getByRole("combobox", { name })`. That form is unambiguous because the listbox has a different role.
2. **One helper for named-record choices (`app`).** `components/named-records/record-picker.ts` mirrors `material-picker.ts`:
   - `recordOptions(records, inactiveLabel?)` turns `{ id, name, active }` into `AutocompleteOption`s: `value`/`code` = ID, `name` = name, and `detail` = the inactive label when inactive and a label is given.
   - `activeRecordOptions(records, keep?)` returns the active records, plus `keep` (the current value) when it is inactive.
   - `customerPicker(lists)`, `supplierPicker(lists)` and `locationPicker(lists)` return `{ labels, placeholder }`.

   It replaces `locationOptions` (`master-data/references.tsx`), `activeOptions` (`purchase-requisitions/choices.ts`), the customer order's `choice()` and the production dialog's inline mapping.
3. **Entry pickers.** CrudForm fields change from `type: "select"` to `type: "autocomplete"`. Hand-built forms render `<Autocomplete id name value onChange aria-labelledby …>` in place of the `NativeSelect`, and keep their extra behaviour: the PO location still clears mismatched requisition links, and the customer-order fields stay disabled once a line is posted. Required-field errors keep showing under the field, as they do for material pickers.

   **Keyboard fix in `Autocomplete` (all pickers, material included).** Today, Enter on text that matches no choice submits the surrounding form with the *previous* value. Now it refuses the text the way blur does: it clears the value, shows the refusal and calls `preventDefault()`. Typing that clears the field no longer makes the first row active, so Enter on an empty field emits `""` and lets the form submit. This is how "Any" is chosen in a filter. It is a behaviour change for the existing material pickers, and the PR calls it out.
4. **Filter pickers (`ui`): `FilterAutocomplete`** in `ui/src/backend/forms/filter-autocomplete.tsx`, a client component. Its props are `name`, `options` (`AutocompleteOption[]`), `defaultValue`, an optional `emptyLabel` ("Any" / "All"; without one there is no empty choice), `labels`, `locale` and `aria-labelledby`/`id`.
   - Until hydrated (a `useSyncExternalStore` hydration flag: `false` on the server snapshot, `true` on the client) it renders a `NativeSelect name` with the same choices as text (`code — name`, with the detail in parentheses), so the GET form works without JavaScript.
   - Once hydrated it renders `Autocomplete name` holding its own state, so the hidden input submits the choice. That state is seeded from the select's live value, read through a ref at the switch, so a choice made before hydration survives. Focus moving off a select the reader had focused before hydration is accepted, because the switch happens within one frame of hydration.
   - It is keyed by `defaultValue` on each screen. A soft navigation that changes the URL (Clear filter, Back) then remounts it with the new value instead of keeping stale state.
   - Clearing the text means the empty choice. In a filter with no `emptyLabel` (Stock), clearing submits `""`, which the page reads as "not given" (Q6).
   - The four filter screens use it for material and location. Their pages and `<form>`s, and the URL parameters, stay unchanged.
5. **The standard changes.** `engineering-standards.md` line "GET filter forms keep `NativeSelect`" becomes "GET filter forms use `FilterAutocomplete`, which renders a `NativeSelect` until hydrated", and the autocomplete line names every master-data picker.

**Alternatives rejected.**
- *A `<datalist>`*: it accepts free text and has no refusal, its rendering differs per browser, and it can't show the code and name separately.
- *A no-JS "search then choose" round trip*: it adds a server step to every filter.
- *Leaving locations as selects because there are few of them*: the issue asks for them, and mixing two controls on one dialog is the inconsistency #222 names.

## 📝 Architecture

- `ui` gains one component (`FilterAutocomplete`) and one prop (`Autocomplete["aria-labelledby"]`). `CrudForm` wires label ids. Nothing in `ui` learns a domain word.
- `app` gains `components/named-records/record-picker.ts` and dictionary entries. It removes two option helpers that become dead.
- `core`, `db`, the API, services and validators don't change. The pages hand the same records to their screens as today.

## 📝 API Contracts

None. URL parameters of the filter pages are unchanged (`?material=&location=` plus each page's own). The forms submit the same field names and values (the record ID).

## 📝 UI/UX

- **Entry pickers** look and behave like the material pickers #225 shipped: `00000003 — Main warehouse`, type to narrow by ID or name, ↑/↓/Enter/Esc, refusal of text that isn't a choice ("Choose a location from the list."), the list opens upward low in a tall dialog, and Escape closes only the list. Placeholder: "Type an ID or a name", the same as the material picker.
- **Filters**, after hydration, look like the entry pickers, with an empty choice ("Any" / "All") shown as an empty field and the placeholder. Inactive records carry "Inactive" as the quiet detail. Enter in a filter field with the list open and a row active chooses it. A second Enter submits the form.
- **Before hydration** (or with JavaScript off) the filters are today's selects.
- **Screen readers.** The combobox is named by its visible label; once open, the list is named by the same label (`aria-labelledby`). The result count is still announced in the live region.
- Prototype: the control is the one #225 shipped. See `.ai/pipeline/runs/2026-10-24--2206UTC-list-sort-search-units/qa-artifacts/05-purchase-order-line-autocomplete.png` and `06-bom-editor-component-autocomplete.png`. No new visual is proposed.

## 📝 Edge Cases & Failure Scenarios

- **Typed text that matches no choice, then Enter.** Today Enter submits the surrounding form, a GET filter or a CrudForm, with the *previous* value under the unmatched text. `Autocomplete` itself now refuses the text (see the keyboard fix in Proposed Solution 3).
- **Clearing a filter field, then Enter.** The field submits the empty choice ("Any" / "All", or Stock's default pair). Today the empty text would activate the first row, and Enter would choose it.
- **An inactive current value on a customer-order edit** stays chosen and labelled "Inactive". Submitting it unchanged is accepted, as today.
- **A filter URL naming an unknown but well-formed ID (Forecasts)** shows that ID as its own "not in the list" option, instead of "Any" over an empty list (Q4). The stock and variance reports already answer unknown IDs with Not found. On the variance report the date-range refusal path renders the form without checking the IDs, so it gets the same "not in the list" option.
- **Two comboboxes in one dialog** (material plus location): integration selectors must be scoped by field (`[name=location]` hidden input's sibling or the combobox's accessible name), never `[role=dialog] [role=combobox]` unqualified.
- **A read-only tenant** hides the create dialogs as today, and the filters stay usable.
- **Hydration mismatch.** The server snapshot and the first client render both produce the select, so React sees no mismatch. The switch to the autocomplete happens on the next render.

## 📝 Risks & Impact Review

- **Test churn, contained:** about 40 unit-test lines across 12 form test files move from `getByLabelText`/select events to `getByRole("combobox", { name })` and typing. Five filter test files stop casting to `HTMLSelectElement`. Integration helpers in `customer-orders`, `forecasts`, `planning-parameters`, `production-orders`, `purchasing`, `transfers` and `stock-report` switch from `select` to `chooseFromList`. `purchasing.test.ts`'s `optionFor()` reads `option` elements and must read the listbox. None of this changes product behaviour.
- **One behaviour change in existing pickers:** Enter on unmatched text refuses instead of submitting the previous value. That fixes a silent wrong submission, and it is called out in the PR.
- **No protected surface changes.** The API, events, import format and URL parameters stay the same, and the submitted values are the same IDs.
- **Rollback** is a revert. No data or schema is involved.

## 📋 Phasing

1. **Listbox name and Enter.** `aria-labelledby` on `Autocomplete`, wired by `CrudForm`, the BOM output field and the existing hand-built material pickers, with tests switched to `getByRole`. Then, as its own step, the Enter fix. This phase ships alone and fixes the a11y gap and the silent wrong submission.
2. **Entry pickers.** `record-picker.ts`, the dictionary entries, and the eleven controls of the inventory. Integration helpers updated.
3. **Filter pickers.** `FilterAutocomplete`, the four filter screens, the Forecasts "not in the list" option, Stock's empty value, the engineering-standards line, and Help copy where it names the select.

## 📋 Implementation Plan

### Phase 1: Name the list, fix Enter
1. `ui/backend/forms/autocomplete.tsx`: add the `aria-labelledby` prop. The listbox is named by `aria-labelledby` when given, otherwise by `aria-label`. Unit tests cover both naming paths.
2. `ui/backend/forms/crud-form.tsx`: give each `<Label>` an `id` (`${inputId}-label`) and pass it to `Autocomplete`. Test that the list's accessible name equals the field label.
3. `app/components/boms/recipe-form.tsx` (output field) and the other hand-built material pickers labelled by a `<Label>`: pass `aria-labelledby`. Switch the affected tests (`add-forecast-dialog`, `production-dialog`, `customer-orders/order-form`, `order-dialog`, …) to `getByRole("combobox", { name })`.

4. `ui/backend/forms/autocomplete.tsx`: the Enter fix. Unmatched text with no active row refuses and calls `preventDefault()`. Text cleared to empty doesn't activate a row, and Enter then emits `""` without `preventDefault()`. Unit tests assert the value, the refusal and `defaultPrevented` for each case, because jsdom doesn't do implicit submission. The integration test in step 11 covers the real submission.

### Phase 2: Entry pickers
5. `app/components/named-records/record-picker.ts` (+ test): `recordOptions`, `activeRecordOptions`, `customerPicker`, `supplierPicker`, `locationPicker`. Add `lists.customerPicker`, `lists.supplierPicker` and `lists.locationPicker` to `en.ts`/`pl.ts`.
6. CrudForm dialogs (add forecast, add safety-stock target, add planning parameters, production order): location becomes `type: "autocomplete"`. Remove `locationOptions`. Update the unit tests.
7. Hand-built forms: customer order (customer, location; keep the current inactive value and the posted-line lock), purchase order (supplier, location; keep clearing mismatched requisition links), requisition (location), transfer (source, destination). Remove `activeOptions` and `choice()`. Update the unit tests.
8. Integration tests: switch the helpers listed under Risks to `chooseFromList` with field-scoped selectors, and rewrite `optionFor()`.

### Phase 3: Filter pickers
9. `ui/backend/forms/filter-autocomplete.tsx` (+ test): renders the select before hydration and the autocomplete after it, with an empty choice and the inactive detail; seeds from the select's live value. Tests cover:
   - the server render (`renderToString` → `<select name>`);
   - the hydrated render (`hydrateRoot` over that HTML, then the combobox);
   - that the submitted `FormData` holds the chosen ID;
   - a choice made in the select before the switch, which survives it;
   - unmounting, so the store's unsubscribe runs (100 % functions).
10. Forecasts filter: use it for material and location (keyed by the URL value), mark inactive records, and add the `lists.notListed` option for an unknown URL value (plus the variance report's refusal path). Stock screen, stock report and variance report: use it. `stock/page.tsx` treats `""` as not given. Update the page and screen tests.
11. `engineering-standards.md`: rewrite the autocomplete line. Update the Help topics (EN/PL) that describe these filters or pickers as lists to choose from. Integration tests:
   - `forecasts.test.ts`: filter through the autocomplete and submit with Enter; then clear the field, press Enter, and expect the unfiltered list;
   - `stock-report.test.ts`: through the autocomplete;
   - the no-JavaScript path: a plain HTTP `fetch` of the Forecasts page with the session cookie finds `<select name="material">` inside `form[role=search]`, and fetching the URL that form would submit returns the filtered list.
