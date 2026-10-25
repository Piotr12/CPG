# Autocomplete for customer, supplier and location pickers and the report filters (#222)

Source doc: .ai/specs/2026-10-25--0751UTC-autocomplete-pickers-report-filters.md
Spec PR: #232 (design-only)
Issue: #222
Engine: om-auto-create-pr (steps: 11, --loop: no)

## Goal

Implement the spec: every customer, supplier and location picker in an entry form, and the material/location filters of Forecasts, Stock, the stock report and the variance report, use the `Autocomplete` (filters through a `FilterAutocomplete` that is a native select until hydration). The autocomplete's list is named by the field label, and Enter no longer submits a stale value under unmatched text.

## Scope

- `ui`: `forms/autocomplete.tsx` (`aria-labelledby`, Enter), `forms/crud-form.tsx` (label ids), new `forms/filter-autocomplete.tsx`.
- `app`: new `components/named-records/record-picker.ts`; the eleven entry pickers; the four filter screens; `stock/page.tsx` empty value; `i18n/messages/{en,pl}.ts` (`lists.customerPicker`, `supplierPicker`, `locationPicker`, `notListed`); Help topics that describe the changed controls.
- Tests: unit tests next to every changed file; the integration helpers that drive these selects.
- Docs: `engineering-standards.md` (autocomplete line), lessons as found.

**Non-goals:** API, services, validators, schema, URL parameters. No new dependency. No change to forms that don't choose a customer, supplier or location.

## Delivery

Lead (this run) does Phase 1 and the shared foundations: `record-picker.ts`, the dictionary entries and `FilterAutocomplete`. Then three Opus workers, each in its own worktree, own disjoint files (owner's preference for cross-cutting work: one PR, a lead and workers cut by file ownership). The lead merges, runs the full gate, the review and QA.

- **W1 — CrudForm dialogs.** `forecasts/add-forecast-dialog.tsx`, `safety-stock/add-safety-stock-target-dialog.tsx`, `planning-parameters/planning-parameter-fields.ts`, `production-orders/production-dialog.tsx`, their screens (`forecasts-screen.tsx` only for the dialog's props, `safety-stock-screen.tsx`, `planning-parameters-screen.tsx`, the production-orders screen that builds the dialog's options), `master-data/references.tsx` (`locationOptions` removed), their unit tests. Integration: `planning-parameters.test.ts`, `production-orders.test.ts`.
- **W2 — hand-built forms.** `customer-orders/{order-form,order-screen,order-dialog}.tsx`, `purchase-orders/{order-form,orders-screen,create-order-dialog}.tsx`, `purchase-requisitions/{requisition-form,requisitions-screen,create-requisition-dialog,choices}.ts(x)`, `transfers/{transfer-form,transfers-screen,create-transfer-dialog}.tsx`, their unit tests. Integration: `customer-orders.test.ts`, `purchasing.test.ts`, `transfers.test.ts`.
- **W3 — filters.** `forecasts/forecasts-filter.tsx` (and the filter's props in `forecasts-screen.tsx`: one hunk, the `<ForecastsFilter …>` element and the options built for it), `app/admin/[tenant]/forecasts/page.tsx`, `stock/stock-screen.tsx`, `app/admin/[tenant]/stock/page.tsx`, `reports/stock-report-screen.tsx`, `reports/variance-report-screen.tsx`, `app/admin/[tenant]/reports/*/page.tsx`, their unit tests, `help/topics.ts`. Integration: `forecasts.test.ts` (including its `addForecast` helper, which W1's dialog change breaks), `stock-report.test.ts`, the no-JS test.

`forecasts-screen.tsx` is shared by W1 and W3 in disjoint hunks (lesson 2026-10-24): W1 touches only the `<AddForecastDialog …>` element and the `locationOptions` import, W3 only the filter.

## Worker briefs

### Common (every worker)

- Start: `npm ci` in your worktree (lesson 2026-10-19). Read `AGENTS.md`, `.ai/lessons.md` (UI and React; Integration tests and agent-browser), `.ai/docs/engineering-standards.md` and the spec (`Source doc:` above; it is not on `main` yet, so read it from `git show origin/spec/autocomplete-pickers-report-filters:.ai/specs/2026-10-25--0751UTC-autocomplete-pickers-report-filters.md`).
- Already built by the lead, so use them and don't change them (ask the lead first):
  - `Autocomplete` (`packages/ui/src/backend/forms/autocomplete.tsx`) with `aria-labelledby`;
  - `CrudField` `type: "autocomplete"` (`choices`, `autocompleteLabels`, `placeholder`; CrudForm wires the label id);
  - `FilterAutocomplete` (`packages/ui/src/backend/forms/filter-autocomplete.tsx`);
  - `recordOptions`, `activeRecordOptions` and `recordPicker` (`packages/app/src/components/named-records/record-picker.ts`);
  - every concept's labels already carry `locationPicker` / `customerPicker` / `supplierPicker` (`{ labels, placeholder }`) beside `picker`;
  - `lists.notListed` in both dictionaries.
- A hand-built picker gives its `<Label>` the id `${fieldId}-label`, where `fieldId` ends with `-<name>` (e.g. `…-location`), and passes `aria-labelledby` to the `Autocomplete`. Integration tests can then select a field with `[role=combobox][aria-labelledby$="-location-label"]`, scoped to the open dialog (`[role=dialog][data-state=open]`). Never use an unqualified `[role=dialog] [role=combobox]` or `input[aria-autocomplete=list]`: a dialog now has two or more.
- Unit tests find comboboxes with `getByRole("combobox", { name })` (not `getByLabelText`, which also matches the named list), and assert behaviour:
  - the list's name;
  - an inactive current value kept and marked;
  - refusal of typed text;
  - what the form submits.

  Every file you touch stays at 100 % lines, branches, functions and statements (`npx vitest run --coverage --coverage.include='<your files>' --coverage.thresholds.100=false <tests>`).
- Integration tests: Docker isn't available on this machine. Use a local standalone build exactly as in lesson 2026-10-23 ("Running integration tests against a local standalone server"): `npm run build`, copy `.next/standalone` into a new empty directory (with `.next/static` and `public`), and start `node packages/app/server.js` with a fresh `DATA_DIR`, `CPG_ADMIN_PASSWORD` and `KEEP_ALIVE_TIMEOUT=3600000` on **your port** (W1 3311, W2 3312, W3 3313). Then run `CPG_BASE_URL=http://localhost:<port> CPG_ADMIN_PASSWORD=… npm run test:integration -- tests/integration/<file>.test.ts` for each file in your scope, and stop the server by port at the end.
- Gate before reporting: `npm run lint` (the one existing warning in `bom.service.ts` stays), `npm run typecheck`, and the unit tests of every package you touched. Record the exit codes, never a piped tail (lesson 2026-10-23).
- Commit on your own branch with conventional subjects ending `(#222)` and the `Co-Authored-By` trailer from your session. Don't push to `feat/autocomplete-pickers-report-filters`; the lead merges you. Report with `cez task report`, giving the commands you ran and what they printed.

### W1 — CrudForm dialogs

Scope (only these files and their tests):
- `forecasts/add-forecast-dialog.tsx`;
- in `forecasts/forecasts-screen.tsx`, only the `<AddForecastDialog …>` element and the `locationOptions` import (W3 owns the filter hunk);
- `safety-stock/add-safety-stock-target-dialog.tsx` and `safety-stock/safety-stock-screen.tsx`;
- `planning-parameters/planning-parameter-fields.ts` and `planning-parameters/planning-parameters-screen.tsx`;
- `production-orders/production-dialog.tsx`, plus whatever production-orders file builds its `locations`;
- `master-data/references.tsx`: remove `locationOptions` once it is unused;
- integration: `tests/integration/planning-parameters.test.ts` and `tests/integration/production-orders.test.ts`.

Each dialog's location becomes `type: "autocomplete"`, with `choices: activeRecordOptions(locations)` and `autocompleteLabels`/`placeholder` from `labels.locationPicker`. The production dialog's inline `${id} ${name}` mapping goes. Its edit form has no location, which stays as it is.

Integration:
- `addSet`, `addTarget` and the inactive-location test currently read `select[name=location] option`. They now type into the combobox, and the inactive check asserts that the inactive location is **not offered**: type its ID and see "No location matches".
- `production-orders.test.ts` picks the location with `chooseFromList` and scopes the output picker by its label.
- `forecasts.test.ts` belongs to W3, even though your dialog change breaks its `addForecast` helper.

### W2 — hand-built forms

Scope (only these files and their tests, plus `tests/setup/customer-orders.ts` and any other fixture under `tests/setup/` for these concepts):
- `customer-orders/{order-form,order-screen,order-dialog}.tsx`;
- `purchase-orders/{order-form,orders-screen,create-order-dialog}.tsx`;
- `purchase-requisitions/{requisition-form,requisitions-screen,create-requisition-dialog}.tsx` and `purchase-requisitions/choices.ts`;
- `transfers/{transfer-form,transfers-screen,create-transfer-dialog}.tsx`;
- integration: `tests/integration/customer-orders.test.ts`, `purchasing.test.ts` and `transfers.test.ts`.

Each `NativeSelect` that chooses a customer, supplier or location becomes an `Autocomplete`, with the label id convention above, the concept's `customerPicker`/`supplierPicker`/`locationPicker` words, and options from `record-picker.ts`. Keep each form's behaviour:
- customer order: active records plus the edit's current value, marked "Inactive" with the concept's inactive word (`activeRecordOptions(…, { keep, inactive })`); both fields disabled once a line is posted;
- purchase order: a location change still clears the requisition links that no longer match;
- transfer: source and destination share one option list.

Remove `activeOptions` (`choices.ts`) and `choice()` (`order-screen.tsx`) once they are unused. Grep for other callers first: anything outside your scope that still uses them stays, and you tell the lead.

Integration:
- `openCreate` (customer orders), `createRequisition`/`createOrder` (purchasing) and the transfer test switch from `select` to `chooseFromList`, using field-scoped selectors;
- `optionFor()` in `purchasing.test.ts` reads `<option>` elements: rewrite it to find the record's code through the combobox's list (or the API);
- make the existing material selectors `[role=dialog] input[aria-autocomplete=list]` field-scoped.

### W3 — filters

Scope (only these files and their tests):
- `forecasts/forecasts-filter.tsx`;
- in `forecasts/forecasts-screen.tsx`, only the hunk that builds the filter's options and renders `<ForecastsFilter …>`;
- `app/admin/[tenant]/forecasts/page.tsx`, `stock/stock-screen.tsx` and `app/admin/[tenant]/stock/page.tsx`;
- `reports/stock-report-screen.tsx`, `reports/variance-report-screen.tsx` and `app/admin/[tenant]/reports/{stock,variance}/page.tsx`;
- `materials/material-picker.ts` (add a filter-options helper if you need one);
- `help/topics.ts`;
- integration: `tests/integration/forecasts.test.ts` (including its `addForecast` helper, now a location combobox), `stock-report.test.ts`, and a new no-JS check.

Each material and location select becomes a `FilterAutocomplete`, keyed by the URL value (`key={value}`) so a soft navigation such as Clear filters or Back resets it:
- inactive records are offered with the concept's inactive word as `detail`;
- the empty choice is `emptyLabel` ("Any" / "All" as today);
- Stock has no empty choice, and `stock/page.tsx` treats `?material=` / `?location=` with an empty value as not given (the first record), never Not found;
- Forecasts, and the variance report's date-refusal path, add a well-formed URL ID that matches no record as its own option `{ value: id, code: id, name: lists.notListed }`;
- every filter `<Label>` gets an id passed as `aria-labelledby`.

Help: update the EN/PL topics only where they say these filters or pickers are lists to choose from.

Integration:
- forecasts: filter through the autocomplete and submit with Enter, then clear the field, press Enter, and expect the unfiltered list;
- stock report: through the autocomplete;
- no-JS: a plain `fetch` of the Forecasts page with the session cookie finds `<select … name="material"` inside `form[role="search"]`, and fetching the URL that select would submit returns the filtered list.

## Risks

- Integration tests run on a local standalone build (Docker isn't available on this machine; lesson 2026-10-23). CI runs the full suite on the PR.
- The spec file is on spec PR #232, not on `main` yet. Moving it to `implemented/` waits until #232 merges.

## Progress

PR: #233

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Name the list, fix Enter

- [x] 1.1 Autocomplete aria-labelledby — 8bede809
- [x] 1.2 CrudForm label ids — 8bede809
- [x] 1.3 BOM output and hand-built material pickers labelled; tests use getByRole — 8bede809
- [x] 1.4 Autocomplete Enter fix — 8bede809

### Phase 2: Entry pickers

- [x] 2.1 record-picker helper and dictionary entries — cc6a460f, 22e7f265
- [x] 2.2 CrudForm dialogs (W1) — 77bc03e5, merged 81524dfd
- [x] 2.3 Hand-built forms (W2) — 211dac85, merged 2a99600f
- [x] 2.4 Integration helpers for entry pickers (W1, W2) — 4211fb0c, 68954ebb

### Phase 3: Filter pickers

- [x] 3.1 FilterAutocomplete — cc6a460f
- [x] 3.2 Filter screens, Forecasts unknown value, Stock empty value (W3) — 561cb03f, merged db554dc3
- [x] 3.3 Standards, Help and filter integration tests (lead, W3) — 64b3922b, 0f26f1d2, c807d3a3

## Verification log

- 2026-10-25, after merging W1–W3 (db554dc3) and the dictionary cleanup:
  - `npm run lint`: exit 0, with the one existing warning in `bom.service.ts`;
  - `npm run typecheck`: exit 0;
  - `npm run test:coverage`: exit 0, 555 files and 4,112 tests, 100 % statements, branches, functions and lines;
  - `npm run build`: exit 0.
- Integration on a local standalone build of that tip (port 3320, fresh `DATA_DIR`; Docker unavailable): exit 0, 11 files and 81 tests passed. The files: planning-parameters, production-orders, customer-orders, purchasing, transfers, forecasts (including the no-JS check), stock-report, variance-report, stock, boms and production-completions.
- Browser QA on the same server, at 1440×900 and 390×844, in `.ai/qa/pr-233/`:
  - the Forecasts location filter is named by its label; "plant", Enter and Enter filters to `location=00000001`;
  - the customer-order customer picker;
  - the stock report material filter;
  - 390 px, with no horizontal overflow (`scrollWidth` 390 = `clientWidth` 390).
- Workers: W1 $3.16, W2 $2.91, W3 $5.32. Each worker ran its own integration files green before merging; their reports are in the cezar tree.
