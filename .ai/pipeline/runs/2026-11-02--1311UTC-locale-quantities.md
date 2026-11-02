# Execution plan — every quantity in the reader's locale (#304)

**Date:** 2026-11-02 13:11 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`; lead with cezar workers
**Source doc:** .ai/specs/implemented/2026-11-02--1303UTC-locale-quantities.md (spec PR #343)
**Issue:** #304
**Status:** in progress

## Goal

Every screen that shows a quantity or a conversion factor as text formats it with `localeQuantity(text, locale)`, as the MRP screens do. Form fields keep the dot form (`formQuantity`), and the API keeps six-decimal texts.

## Scope

App layer only: `packages/app/src/components/**`, the pages that render them, and their unit and integration tests. No core, API, schema or stored-value change.

**Non-goals** (spec Q3–Q5): the demand review's rounded figures, refusal-message params from the server, audit values, and accepting a comma in entry.

## Implementation Plan

Phase 1 is done by the lead, because every later unit depends on it. Phase 2's units run in parallel as cezar workers on disjoint files, cut by concept folder. The lead merges them one at a time and re-runs the checks after each merge.

### Phase 1: Shared helpers (lead)

- 1.1 Rename `shownQuantity` to `formQuantity` everywhere (helpers, re-exports, callers, tests), with no behaviour change. Replace the zero tests on text with `isNothing` (`completion-history.tsx`, `production-requirements.tsx`, `shownVariance`, `inverseText`). The stock `ReversalControls`/`ReversalDialog` take `locale` and format with `localeQuantity`, and their three callers pass it: `stock-screen.tsx`, `receipts-table.tsx` and `issues-table.tsx`, through the stock page, the purchase-order screen and the shipment screen.

### Phase 2: Screens (parallel units)

- 2.1 Unit A: stock (`stock-screen.tsx`), reports (`stock-report-screen.tsx`, `demand-review-filters.tsx`), materials (`labels.ts` `conversionText`/`inverseText`, `conversions-table.tsx`, `statistical-units-screen.tsx`, and the `conversions.tiny` dictionary key), and BOMs (`recipe-table.tsx`, `boms-table.tsx` joined with ` · `, `labels.ts`), with their pages, unit tests and integration tests.
- 2.2 Unit B: purchase orders, purchase requisitions, goods receipts, goods issues, customer orders and shipments, with their pages, unit tests and integration tests.
- 2.3 Unit C: transfers, production orders (screen, requirements, completion history, form, dialog, `shownVariance`) and `variance-report-screen.tsx`, with their pages, unit tests and integration tests.
- 2.4 Unit D (lead): planning parameters, safety stock and forecasts tables, with their pages, unit tests, and the integration readers that parse screen text (`list-quantity-sort.test.ts`, `planning-parameters.test.ts`).

### Phase 3: Integration and docs (lead)

- 3.1 A Polish integration test that reads a stock balance, a purchase-order line and a BOM line entered in another unit, each with a decimal and five integer digits.
- 3.2 Engineering standards "Exact quantities (R03)": add a sentence on `localeQuantity` and `formQuantity`. Set the spec to Status: implemented and add its implementation notes.

## Risks

- Integration tests read figures of 1,000 or more and parse screen text: every unit greps its integration files (spec "Risks").
- Merging the workers' branches: each unit owns its concept folders and pages. Only the lead edits `form-labels.ts`, the stock reversal files, and the EN/PL dictionaries, except for Unit A's single `conversions.tiny` key.

## Worker brief (units A–C)

Every worker reads `AGENTS.md`, `.ai/lessons.md` and the spec (`Source doc:` above) first. The rules:

- **Scope.** Edit only the files your order names, plus the page and page test of each screen, the components' own tests, and the integration files your order names. Never edit `components/forms/form-labels.ts`, `components/stock/reversal-*.tsx`, `goods-receipts/receipts-table.tsx`, `goods-issues/issues-table.tsx` (Phase 1 already converted them), the EN/PL dictionaries (Unit A's `conversions.tiny` key is the one exception), this plan, the spec, or another unit's folders. If you need a change outside your scope, don't make it: name it in your report's suggestions.
- **The pattern.** Every figure a screen shows as text goes through `localeQuantity(text, locale)` (`../forms/form-labels`). That covers base quantities, raw `enteredQuantity`, and conversion factors, including both sides of `${denominator} ${unit} = ${numerator} ${baseUnit}`. It applies inside every composed text: `fill(...)` hints, option labels, line summaries, the lifecycle `quantities` strings and dialog descriptions. `formQuantity` is only for values that fill a form field. Raw `initialValues` / `initial` entered quantities stay as they are.
- **Locale.** Take `locale: Locale` as a prop (`import type { Locale } from "@cpg/core"`). It comes from the page's `getMessages()`, and most pages already destructure it. Pure helpers take `locale` as an argument.
- **Client components** (`"use client"`, and anything a client component imports) never import a *value* from `@cpg/core`. Type imports are fine (lesson 2026-10-19).
- **Signs and zero.** Keep today's sign rule: `+` is prefixed in code where it is today, and `localeQuantity` keeps the `-`. Zero checks stay on raw or `formQuantity` text, never on localized text.
- **Unit tests** cover 100% of what you change. Every changed screen and helper asserts English and Polish with a figure of five integer digits and a fraction, for example `"12345.500000"` → `12,345.5` (en) and `12 345,5` (pl). Testing Library's text matchers turn the no-break space into a plain space, so match `12 345,5`. Add `locale` to existing renders.
- **Integration tests.** In the files your order names, update every assertion that reads a quantity of 1,000 or more or a factor, and every reader that parses screen text with `Number(` or `parseFloat` (strip the `,` grouping first). Don't run the integration suite: the lead runs it on the merged tree.
- **Gate before you report.** `npm run lint` and `npm run typecheck` must exit 0 (check the exit code, never a piped tail). Run your folders' and pages' tests with coverage in your own directory: `npx vitest run <paths> --coverage.enabled --coverage.include='<your component folders>/**' --coverage.reportsDirectory=$(mktemp -d)`, at 100% for your files.
- **Commits.** Use conventional commits on your own branch, for example `feat(app): show transfer quantities in the reader's locale (#304)`, each ending with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer. Don't push, don't open a PR, and don't touch the plan's Progress section. Report with `cez task report`, listing the files changed, the tests run and their results, and the integration assertions you changed.

## Log

- 13:11 UTC — Plan drafted with 7 steps, which is under the loop threshold of 20. Branch `feat/locale-quantities` from `origin/main`. It carries the spec straight into `implemented/` and deletes the stray active copy of the MRP automatic mode spec, as #341 does, because `main` fails `ai-filenames.test.ts`.

- 13:25 UTC — Step 1.1: zero checks stay on `formQuantity` text instead of `isNothing`. `production-requirements.tsx` and `materials/labels.ts` reach client bundles (`production-dialog.tsx`, `conversions-table.tsx`), where a value import of `@cpg/core` would pull in the ORM (lesson 2026-10-19). `formQuantity` doesn't depend on the locale, so the checks were already correct. Spec Q7 is updated in its implementation notes. Receipts and issues tables were converted in 1.1, because they pass `locale` to the stock reversal controls. App/UI unit suite: 391 files, 2,625 tests passed.
- 13:50 UTC — Unit D done in `a367973a` (100% coverage of its three folders). The Polish integration test is in `e4a789e7`, and it runs once A and B are merged. Docker isn't available here, so integration runs on a local standalone server (lesson 2026-10-23).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared helpers

- [x] 1.1 Rename to formQuantity, zero tests via isNothing, locale-aware stock reversal — 03537460

### Phase 2: Screens

- [ ] 2.1 Unit A: stock, reports, materials, BOMs
- [ ] 2.2 Unit B: purchasing, receipts, issues, customer orders, shipments
- [ ] 2.3 Unit C: transfers, production, variance report
- [x] 2.4 Unit D: planning parameters, safety stock, forecasts — a367973a

### Phase 3: Integration and docs

- [ ] 3.1 Polish integration test
- [ ] 3.2 Standards and spec paperwork
