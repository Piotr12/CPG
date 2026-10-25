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

## Risks

- Integration tests run on a local standalone build (Docker isn't available on this machine; lesson 2026-10-23). CI runs the full suite on the PR.
- The spec file is on spec PR #232, not on `main` yet. Moving it to `implemented/` waits until #232 merges.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Name the list, fix Enter

- [ ] 1.1 Autocomplete aria-labelledby
- [ ] 1.2 CrudForm label ids
- [ ] 1.3 BOM output and hand-built material pickers labelled; tests use getByRole
- [ ] 1.4 Autocomplete Enter fix

### Phase 2: Entry pickers

- [ ] 2.1 record-picker helper and dictionary entries
- [ ] 2.2 CrudForm dialogs (W1)
- [ ] 2.3 Hand-built forms (W2)
- [ ] 2.4 Integration helpers for entry pickers (W1, W2)

### Phase 3: Filter pickers

- [ ] 3.1 FilterAutocomplete
- [ ] 3.2 Filter screens, Forecasts unknown value, Stock empty value (W3)
- [ ] 3.3 Standards, Help and filter integration tests (lead, W3)
