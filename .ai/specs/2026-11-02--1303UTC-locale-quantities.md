# Every quantity on screen in the reader's locale, as the MRP report already shows them

**Status:** ready
**Created:** 2026-11-02 13:03 UTC
**Issue:** #304 (follow-up of #284) · **Depends on:** the MRP report (`implemented/2026-10-31--0907UTC-mrp-report.md`, Q6), which added `localeQuantity` · **Design authority:** `.ai/specs/product-brief.md` (R03, D03), `.ai/docs/engineering-standards.md` "Exact quantities (R03)"

## 📝 TLDR

Since #284 the MRP screens show quantities in the reader's locale through `localeQuantity(text, locale)`: `1,234.5` in English and `1234,5` in Polish, with a no-break space grouping five digits or more. Every other screen still shows them with `shownQuantity`, which uses a dot and no grouping, so a Polish planner reads `1234,5` on the MRP page and `1234.5` for the same stock on the Stock page. After this change, every screen that shows a quantity or a conversion factor as text will format it with `localeQuantity`, every digit kept. Form fields keep the dot form they accept today, and the API keeps its six-decimal texts.

## 📝 Problem Statement

R03 asks for exact six-decimal quantities, and #284's Q6 settled how a screen shows one: `Intl.NumberFormat(locale, { maximumFractionDigits: 6 })` applied to the decimal **text**, never to a float. It applied the rule to the MRP screens only and left the others to this issue. Today:

- **The app has two conventions.** 28 component files outside MRP format quantities with `shownQuantity` (7 more `labels.ts` files only re-export it), and the seven MRP files use `localeQuantity`. A Polish reader sees commas on one page and dots on the next. An English reader sees `12500` on the Stock page and `12,500` in the MRP report.
- **Some figures skip both helpers.** Entered quantities and conversion factors are printed as stored (`${line.enteredQuantity} ${line.enteredUnit} (${line.denominator} … = ${line.numerator} …)` in `customer-orders/order-screen.tsx`, `production-orders/production-screen.tsx`, `boms/labels.ts` and `purchase-orders/labels.ts`; `conversionText` and the indicative inverse in `materials/labels.ts`, shown by the client `materials/conversions-table.tsx`; the factor on the Stock page's movement detail).
- **`shownQuantity` has two jobs.** It formats display text, and it prefills form fields (`initialValues` in the forecast, safety-stock and planning-parameter actions, and the completion form's pinned rows). Only the first should change, because quantity fields accept `\d{1,12}(\.\d{1,6})?` only (`core/src/domain/quantities/decimal.ts`).

## Resolved assumptions (autonomous defaults)

The issue's open edges, each answered with the most reversible choice. None changes an API, a schema or a stored value, so every answer is a screen-only change a later release can revert.

| # | Question | Applied default | Why |
|---|---|---|---|
| Q1 | What counts as "a quantity on screen"? | **Every six-decimal figure a screen renders as text:** base quantities, entered quantities, and conversion factors, including those inside composed texts (hints, option labels, line summaries, dialog descriptions, a refusal the screen fills itself, such as `TRANSFER_IN_TRANSIT`). IDs, line numbers, counts, dates and input values are not quantities. | A factor printed next to a localized quantity (`1234,5 kg (12 box = 144.5 each)`) would bring the two conventions back inside one line. Factors are decimal texts under the same R03 rule (engineering standards). |
| Q2 | Form fields: prefill in the locale, or as today? | **As today: the dot form, without trailing zeros.** `shownQuantity` is renamed `formQuantity` and keeps only that job. Hints and option labels around a field are display text, so they follow Q1, except copy that tells the reader what to *type*. For example, the Polish `statisticalHint` ("wpisz … 1.5") keeps the dot, because that is what the field accepts. | The issue keeps inputs unchanged, and a prefilled `1234,5` would be refused on save (`parseDecimal`). After the rename, a display use of `formQuantity` reads as wrong in review. Accepting a comma in entry would be a separate story. |
| Q3 | The demand review's figures? This narrows the issue's criterion "every digit kept" for one screen it names. | **Unchanged.** It already formats with `Intl.NumberFormat(locale)` (`formatFigure` in `ui/src/backend/charts/stacked-column-chart.tsx`), and it rounds on purpose: at most one decimal under 100, none from 100 up, and zero shows as "–". | It is already in the reader's locale. Its rounding is the reports' rule, chosen in its own spec. Showing every digit there would change a reviewed report design. The issue most likely listed the screen expecting `shownQuantity` there, and the screen uses neither helper. The owner can reverse this before merge, by asking for exact figures in the grid and tooltips. Its material filter's SU factor is a plain figure, so it follows Q1. |
| Q4 | Refusal messages whose quantity comes from the server's `params` (`TRANSFER_OVER_DISPATCH`'s `{available}` and the like)? | **Unchanged: filled with the server's text.** `errorMessage` fills any code's params and can't tell which of them are quantities. | Localizing them means tagging params by kind, a change to the error contract (structured `params`, lesson 2026-10-23) that costs more than this display sweep. A refusal is a transient message, not a screen's figure. |
| Q5 | The audit history's recorded values? | **Unchanged.** | The audit shows each snapshot field as recorded, the same for every field kind. It is a record of stored values, not a quantity display. |
| Q6 | How do screens get the locale? | **As a `locale: Locale` prop**, from the page's `getMessages()`, as the MRP screens and the date-formatting screens already do. No React context. | It is the existing pattern. Most quantity screens are server components, where a context would not reach. Pure label helpers (`labels.ts`) take `locale` as an argument. |
| Q7 | Signs and zero tests? | **Signs keep today's rule.** A movement shows `+` before a positive figure, and `localeQuantity` keeps the hyphen-minus (U+002D) on a negative one in both locales (#284 Q6). Code that asks "is it zero?" from text (`shownQuantity(x) !== "0"`, `shownVariance`'s `shown === "0"`, `inverseText`'s `inverse === "0"`) asks `isNothing(x)` (`@cpg/core`) instead. | A test of a value is not a display, and it must not depend on how a locale writes zero. |
| Q8 | Lists joined with a comma? | **Joined with `" · "` where a joined item holds a quantity.** The BOM list's Components column (`boms/boms-table.tsx`, `lineSummary(…).join(", ")`) would read `2,5 kg …, 3 kg …` in Polish. | A middle dot is already the app's separator between figures (`stock-screen.tsx`'s movement detail, the completion form). A comma separator next to a decimal comma is ambiguous. |

## 📝 Proposed Solution

One sweep of the app's display code, with no core, API or schema change:

1. **`form-labels.ts`.** `localeQuantity` stays as it is. `shownQuantity` becomes `formQuantity`, documented as "what a form field prefills", and is re-exported under the new name from each concept's `labels.ts`. A screen-level helper that composes quantity texts (`lineSummary`, `enteredAs`, `conversionText`, `shownVariance`, the goods-receipt `outstanding` hint, `requisitionOption`) takes `locale` and formats through `localeQuantity`.
2. **Every display call site** listed under Architecture moves to `localeQuantity(text, locale)`, and every raw entered quantity and factor gets it too.
3. **Pages pass `locale`** from `getMessages()` to each screen that lacks it.
4. **Tests.** Unit tests cover English and Polish at each changed helper and screen. The integration assertions that read quantity text move to the localized form, and one integration test reads a few screens in Polish.

**Alternatives considered.**
- *A `<Quantity>` component, or a React locale context.* Rejected: most of the texts are composed strings (`fill(...)` hints, option labels, DataTable cells built as strings), which a component can't produce, and server components can't read a client context.
- *Formatting in core, so views carry display texts.* Rejected: the API must keep six-decimal texts (R03, BACKWARD_COMPATIBILITY.md), and display belongs to the app layer.
- *Accepting the locale's decimal separator in entry, so prefills can follow the locale too.* Out of scope: the issue keeps inputs as they are (Q2).

## 📝 Architecture

App layer only (`packages/app/src/components/**` and the pages that render them). `localeQuantity` keeps one cached `Intl.NumberFormat` per locale, so no screen builds a formatter per figure.

Display call sites to move. Grep `shownQuantity`, `enteredQuantity`, `numerator` and `denominator` under `packages/app/src/components` (excluding tests) to confirm the list at implementation time:

| Area | Files | Figures |
|---|---|---|
| Stock | `stock/stock-screen.tsx`, `stock/reversal-dialog.tsx` (client), the movement handed to it by `goods-issues/issues-table.tsx` | balance, in transit from/to, movement (signed), entered quantity, factor, balance after, original and inverse |
| Reports | `reports/stock-report-screen.tsx`, `reports/variance-report-screen.tsx` (also a caller of `shownVariance`), `reports/demand-review-filters.tsx` (the SU factor in a material's detail) | every amount column; the factor |
| Purchasing | `purchase-orders/order-screen.tsx`, `purchase-orders/choices.ts` (`requisitionOption`), `purchase-orders/labels.ts` (`enteredAs`), `purchase-requisitions/requisitions-table.tsx` | quantity, received, outstanding, abandoned, lifecycle quantities, entered-as conversion |
| Goods receipts and issues | `goods-receipts/receipts-table.tsx`, `goods-receipts/labels.ts` (`outstanding` hint), `goods-receipts/receipt-dialog.tsx` (client, the excess warning), `goods-issues/issues-table.tsx` | line summaries, hints, the reversal movement shown to the dialog |
| Customer orders and shipments | `customer-orders/order-screen.tsx`, `shipments/shipment-screen.tsx`, `shipments/shipments-table.tsx`, `shipments/line-choices.ts` | quantity, fulfilled, outstanding, abandoned, entered (with conversion), issued, to issue, outstanding hints |
| Transfers | `transfers/transfers-screen.tsx`, `transfers/transfer-screen.tsx`, `transfers/ledger-table.tsx` (also builds the reversal legs that `transfer-reversal-dialog.tsx` shows) | amounts, limits, in transit, entered, ledger and reversal legs |
| Production | `production-orders/production-screen.tsx`, `production-requirements.tsx`, `completion-history.tsx` (`shownVariance`, and the reversal legs that `completion-reversal-dialog.tsx` shows), `completion-form.tsx` (client: expected, available, the over-target warning), `completion-dialog.tsx` (the summary's output) | quantity, abandoned, produced, outstanding, entered, required, available, shortage, variance, the reversal legs |
| Master data | `boms/recipe-table.tsx`, `boms/boms-table.tsx` (the Components column, through `lineSummary`), `boms/labels.ts` (`lineSummary`, `enteredAs`), `materials/labels.ts` (`conversionText`, `inverseText`) with their client caller `materials/conversions-table.tsx`, `materials/statistical-units-screen.tsx` (factor), `planning-parameters/planning-parameters-table.tsx`, `safety-stock/safety-stock-table.tsx`, `forecasts/forecasts-table.tsx` | BOM lines, conversions and their inverses (`< 0.000001` for one that rounds to zero is then built in code from `localeQuantity("0.000001")`, and the `conversions.tiny` text leaves both dictionaries), SU factors, minimum and multiple, target and forecast quantities |

These keep `formQuantity`, because they fill form fields: `planning-parameters/planning-parameter-actions.tsx`, `safety-stock/safety-stock-target-actions.tsx`, `forecasts/forecast-actions.tsx`, `completion-form.tsx`'s pinned-row state, and `materials/conversion-actions.tsx` (raw factors today, unchanged). These prefill the raw entered quantity and keep doing so: `shipments/line-choices.ts`'s `initial`, `production-orders/production-dialog.tsx`'s `initialValues`, `boms/bom-controls.tsx`'s components and `customer-orders/order-dialog.tsx`'s lines.

No core service, validator, route or entity changes. `mrp/*` already uses `localeQuantity` and stays as it is.

## 📝 UI/UX

Only the text of figures changes: no layout, column or copy change. English groups thousands with a comma (`12,500 kg`). Polish uses a comma for decimals and groups five digits or more with a no-break space (`12 500 kg`, `1234,5 kg`), as `Intl.NumberFormat("pl")` does. Amount columns stay `kind: "quantity"` (right-aligned, tabular figures), and the existing data hooks (`data-stock-balance`, `data-shortage`, …) stay on the same elements. A field's hint reads `1234,5 kg outstanding` in Polish while the field itself takes `1234.5`, as the issue accepts (Q2).

## 📝 Edge Cases & Failure Scenarios

- **Twelve integer digits and six decimals.** `localeQuantity` formats the text itself: `"12345678901234.123456"` keeps all 20 digits in both locales (`form-labels.test.ts`, #284), so the largest stored figure, 18 digits, is exact. Node 24 renders the server components.
- **Client components on older browsers.** The client screens (the receipt dialog, the completion form, the stock-reversal dialog and the conversions table) format in the browser too. An engine without Intl.NumberFormat v3 (before Chrome 106, Safari 15.4 or Firefox 116) reads the string as a Number, so only figures with more than 15 significant digits could lose digits there, and hydration would then warn about a text mismatch. The repository declares no browser support range, and the MRP screens already accept the same limit. A figure needs ten integer digits and six decimals to reach 16 significant digits.
- **Negative and zero.** `-15.500000` shows `-15.5` / `-15,5`, and `0.000000` shows `0`. Zero checks use `isNothing` (Q7), never the formatted text.
- **Search highlighting.** No list's `Highlight` cell is a quantity column (the searched fields are IDs and names), so nothing a search marks changes.
- **Copy-paste into a field.** A Polish reader who copies `1234,5` from a hint into a field gets the field's existing quantity refusal. That is today's entry rule, and it is unchanged (Q2).

## 📝 Risks & Impact Review

- **Contracts.** No API, event, schema or config change. BACKWARD_COMPATIBILITY.md's surfaces are untouched. Screen text isn't a protected surface, but scrapers of the HTML would see `1,234.5`, so the PR notes it.
- **Tests that read figures.** Integration tests match quantity text on screen, and every figure of 1,000 or more changes in English. Grep `tests/integration` for quantities of four digits or more, for numbers built with `toFixed` or `String(n)` in expectations, and for screen text parsed with `Number(` or `parseFloat`. `list-quantity-sort.test.ts` reads `"1900 kg"` with `Number(cell.split(" ")[0])`, which gives `NaN` for `1,900`, and `planning-parameters.test.ts` reads a cell with `parseFloat`, which reads `1,234` as 1. Run the files of every screen touched (lesson 2026-11-01, "Two features merged together need a check at their seam").
- **Rollback.** Reverting the PR restores the old texts. Nothing is stored.

## 📝 Decisions in play

R03 honoured: texts are formatted as texts, never as floats, and the API keeps six decimals. D03 honoured: EN/PL rendering grows screen by screen, and this issue completes the quantity part. None is superseded.

## 📋 Phasing

One phase, one PR: a display sweep is only consistent once it covers every screen, and each step below still leaves the app working.

## 📋 Implementation Plan

1. **Helpers.** In `form-labels.ts`, rename `shownQuantity` to `formQuantity` (doc: a form field's prefill) and update its re-exports and callers mechanically, with no behaviour change. Replace the zero tests on text with `isNothing`: `shownQuantity(x) !== "0"` in `completion-history.tsx` and `production-requirements.tsx`, `shownVariance`'s `shown === "0"`, and `inverseText`'s `inverse === "0"`. Tests: the renamed helper's tests, plus the zero tests' existing cases.
2. **Stock and reports.** Move `stock-screen.tsx`, `reversal-dialog.tsx`, `stock-report-screen.tsx`, `variance-report-screen.tsx` and the demand-review filter's factor to `localeQuantity`, passing `locale` from their pages. Unit tests: EN and PL for a figure of five digits or more with a fraction, and a negative fraction where the screen shows signed figures.
3. **Purchasing, receipts, issues, customer orders, shipments, transfers.** Same move for the files in those rows, including the composed hints, option labels, line summaries, lifecycle quantities and the entered-as conversions. Unit tests per screen and helper, EN and PL.
4. **Production and master data.** Same for production orders (screen, requirements, completion history, form and dialog), BOMs, materials conversions, statistical units, planning parameters, safety stock and forecasts. The prefills keep `formQuantity`. The BOM list joins its lines with `" · "` (Q8). Unit tests as above, plus one on `completion-form.tsx`, which receives `locale`: under `pl` its displayed figures use a comma while its pinned rows prefill the dot form.
5. **Integration tests.** Update every assertion that reads a quantity of 1,000 or more, or a factor, on the screens above. Fix the readers that parse screen text (`list-quantity-sort.test.ts`, `planning-parameters.test.ts`). Add one test that switches a user to Polish with `choosePreference(…, "pl")` and reads a stock balance, a purchase-order line and a BOM line entered in another unit (its conversion factor included), each with a decimal and five integer digits. Run the integration files of every touched screen.
6. **Docs.** `.ai/docs/engineering-standards.md` "Exact quantities (R03)": one sentence saying that screens show quantities and factors with `localeQuantity`, and that forms prefill with `formQuantity`. Move this spec to `implemented/`.
