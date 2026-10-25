# Statistical unit (SU): one factor per product, used only in reports

**Status:** implemented
**Created:** 2026-10-25 09:13 UTC
**Issue:** #239 (decided by the owner on the issue) · **First consumer:** #240, `2026-10-25--0913UTC-demand-review.md` · **Decision:** D08 (`research/decisions/D08-statistical-unit-and-demand-review.md`) · **Builds on:** the unit registry (#217, `core/src/validators/units/unit-registry.ts`), material conversions (`implemented/2026-10-19--1858UTC-materials.md`), the Test datasets (`implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md`) · **Design authority:** `.ai/specs/product-brief.md` (R03 exact decimals, R05 tenant isolation, D04 baseline, D08)

The issue holds the mockups and the question table. This spec is the decided end state, and it wins where the mockups differ (for example, it has no "valid from" column and no editable SU definition).

## 📝 TLDR

Planners can't add 40 letterboxes to 12 workshop cabinets. Each product gets **one factor saying how many statistical units (SU) one of its base units counts as** (`1 each = 1.5 SU`). Reports convert quantities to SU when they read them, so different products add up.

**SU is for reports only.** Every document, forecast, BOM and import keeps its physical units (each, kg, pallet…), and SU is refused wherever a quantity is entered. The rule for a report filtered by products: **two or more products (or all of them) ⇒ only SU can be shown; exactly one product ⇒ its base unit, any of its other conversions, or SU.**

SU is a reserved entry in the existing unit registry, and a product's factor is an ordinary material conversion. So the factor reuses the exact-decimal maths, the conversion API, the master-data import and the audit as they are. There is no new entity and no migration.

## Resolved decisions (owner, #239)

| # | Question | Decision |
|---|---|---|
| Q1 | Where SU lives | A reserved unit `SU` in the unit registry, dimension `statistical`. Each product's factor is a material conversion `1 SU = numerator / denominator` base units. |
| Q2 | How many SUs | **One, the same in every tenant and across the whole application.** Factors are per material, so they are per tenant (R05). |
| Q3 | Which materials have a factor | Optional on any material, set in practice on finished products. A report leaves a product without a factor out of SU totals and **names it** in a warning. A read-only **Statistical units** page under Master data lists every finished product with its factor or "Not set". It does the job the issue's "no SU factor" filter would have done, in one place, without filtering infrastructure on the Materials list. |
| Q4 | Dating | None. Today's factor applies to all history, and screens say "SU at current factors". Stored documents keep their own entered unit and factor (MAT-027), so nothing posted is revalued. |
| Q5 | The selection rule | Strict, by the number of products selected: two or more, or "all", ⇒ SU only, even if they share a base unit. |
| Q6 | SU on entry | **Never.** Quantities are entered in physical units only. SU appears only in reports. |
| Q7 | Code and wording | Symbol `SU` in both languages. Name EN "statistical unit", PL "jednostka statystyczna". Registry code `ZSU` (UN/ECE Rec 20 keeps `Z…` for local codes). |
| Q8 | Per-tenant SU definition | None (follows Q2): the name is fixed text in the registry, and the Statistical units page explains what SU is for. |
| Q9 | Test datasets | Both Test datasets get an SU factor for all ten finished products (table below). |
| Q10 | Baseline | Recorded as D08 together with #240. |

## 📝 Proposed Solution

**Registry.** `unit-registry.ts` gains the dimension `statistical`, listed last in `UNIT_DIMENSIONS`, and one unit:

```ts
{ code: "ZSU", symbol: "SU", name: { en: "statistical unit", pl: "jednostka statystyczna" }, dimension: "statistical" }
```

It also exports `STATISTICAL_UNIT = "SU"` and `isStatisticalUnit(symbol)` (exact match, like `isRegisteredUnit`). Registry users in `core` and `app` read the symbol from the constant, never as a literal.

**Factor = conversion.** A product's SU factor is a `MaterialConversion` with `unit = "SU"`. The conversion's existing meaning applies unchanged: `1 SU = numerator / denominator` base units. For "1 each = 1.5 SU" that is numerator `1`, denominator `1.5`.

The Add conversion dialog on the material page offers `SU` in its own *Statistical* group. When SU is chosen, a one-line hint appears under the factor fields: "For SU, enter Alternate quantity 1.5 and Base quantity 1 when 1 each = 1.5 SU." The form asks for *Alternate quantity* (the denominator) first, then *Base quantity* (the numerator), so both exact values can be typed and nothing has to be rounded first (R03). The material page already shows each conversion's inverse (MAT-021), so the SU row also reads as `1 each = 1.5 SU`. Changing or removing the SU conversion works like any other conversion: optimistic version, audited.

**Where SU is refused.** All entry goes through two choke points:

1. **As a base unit.** Material create and edit refuse `SU`. `material-create.schema.ts`'s `baseUnit` becomes `registeredUnitSchema` refined with `!isStatisticalUnit`. In `MaterialService`, `assertRegisteredUnit(field, unit)` (about line 400) is shared by base units (lines 126 and 154) and conversion units (line 202), so it refuses SU **only when `field === "baseUnit"`**. A test proves that `addConversion` with `SU` still succeeds. The field message is a new fixed text: "The statistical unit can't be a base unit." (PL "Jednostka statystyczna nie może być jednostką bazową."), with screen translation by exact message as usual.
2. **As an entered unit.** `convertToBaseQuantity` (`services/materials/base-quantity.ts`) is the one function every entered quantity passes through: 15 call sites, among them BOM lines, forecasts, purchase requisitions and orders, customer orders, shipments, goods receipts and issues, transfers, production orders and completions, stock corrections and the stock import. After its base-unit shortcut (`unit === material.baseUnit` stays 1:1, so a legacy material whose base unit is `SU` keeps working), for `isStatisticalUnit(unit)` it throws exactly what a unit without a conversion throws today: `AppError("UNIT_NOT_CONVERTIBLE", …)`, 400. For entry purposes SU is not one of the material's units. This reuses every existing translation and field mapping (`conversion-field-error.ts`, `line-error.ts`, the 12 screen label maps), and an API client sees no new code. A test per refusal path proves it.

**Where SU is never offered for entry.** Entry unit pickers drop it:

- `MaterialService.listUnits()`, which feeds the BOM, purchase-order, customer-order and shipment line pickers;
- `ProductionCompletionService` (its `units` map, about line 175);
- the Stock page's unit list (`app/admin/[tenant]/stock/page.tsx`, about line 41);
- the demo catalogue's `unitsOf` (`domain/demo/test-tenant-config.schema.ts`), so the generator never enters a line in SU.

The only screens that offer SU are the conversion dialog and reports.

**Report helpers** (new `core/src/domain/units/report-units.ts`, pure, `bigint` micro-units, R03):

- `fromBase(base: bigint, factor: { numerator: bigint; denominator: bigint }): bigint` returns `base × denominator ÷ numerator`, half-up once to six decimals. It is `convertToBase(base, denominator, numerator)`, the same rounding as every conversion. Reports convert **each material's** bucket total once and then add the converted totals. They never add base quantities across materials.
- `reportUnits(selected: ReportMaterial[]): { units: string[]; defaultUnit: string }`, the selection rule. Here `ReportMaterial = { code, baseUnit, conversions: { unit, numerator, denominator }[] }`.
  - With 0 (meaning "all") or 2+ materials, it returns `units = ["SU"]`.
  - With exactly 1, it returns `[baseUnit, …non-SU conversion units in unit order, "SU" if it has an SU factor]`.
  - The default is the base unit for a single product and SU otherwise.
- `resolveReportUnit(requested: string | undefined, selected)` returns the requested unit when `units` contains it, and otherwise the default. A stale `unit=` left over from a previous selection silently becomes the default, and the response says which unit it used.
- `statisticalFactor(material)` returns the material's SU factor or `null`. A report puts a material whose factor is `null` into its `excluded` list (code `NO_STATISTICAL_FACTOR`) whenever the unit is SU.

**Statistical units page** (`/admin/[tenant]/statistical-units`, Master data, nav id `statisticalUnits` with `ScaleIcon` in `sidebar-nav.tsx`'s `ICONS`, after BOMs). It is read-only and open to every signed-in account, read-only tenants included, like the reports:

- a `PageHeader` with the intro "One statistical unit (SU) lets reports add up different products. Each product's factor is one of its conversions: set or change it on the product's page.";
- a count line "8 of 10 finished products have an SU factor.";
- one row per finished product: ID — description (inactive marked), "1 each = 1.5 SU", its other units in SU ("1 pallet = 15 SU", via `fromBase` of the other conversion), and a "Change" link to the material page;
- a missing factor shows the warning token with an icon and "Not set";
- rows sorted by ID.

The page is served by `MaterialService.statisticalFactors()`, which returns finished materials with their conversions in two queries (materials, then their conversions), never one per row. It gets a help topic (`tests/every-page-has-help.test.ts`) and EN/PL labels.

**Test datasets.** `test-tenant-config.json` gives every finished product an SU conversion based on product weight (1 SU = 30 kg of finished steel product; numerator `1`, denominator = SU per each). The tiny and realistic datasets share the catalogue, so both get them:

| Product | SU per each | Product | SU per each |
|---|---|---|---|
| Cabinet, red | 1 | Steel shelf unit, 5 shelves | 0.9 |
| Office cabinet, grey, 2 doors | 1.2 | Letterbox, galvanised | 0.15 |
| Locker, 2 compartments | 0.8 | Tool tray, powder-coated | 0.1 |
| Locker, 4 compartments | 1.4 | Document box, A4 | 0.05 |
| Workshop cabinet, 4 shelves | 1.5 | Key cabinet, wall-mounted | 0.2 |

Alternatives rejected:
- A `statisticalFactor` column on Material, which would duplicate the conversion maths, API, import and audit.
- A dated factor table, ruled out by Q4.
- Per-tenant SU definitions, ruled out by Q2 and Q8.

Market practice agrees with this choice: SAP's "statistical unit" and Odoo's UoM categories both treat a reporting unit as a conversion of the product, never as an entry unit.

## 📝 Architecture

- **`@cpg/core`**:
  - registry entry and helpers;
  - `report-units.ts` (pure);
  - the base-unit refusal (schema and service);
  - the entry refusal in `convertToBaseQuantity`;
  - the `listUnits` and completion-units filters;
  - `MaterialService.statisticalFactors()`;
  - the demo `unitsOf` filter and config factors.
- **`@cpg/app`**:
  - the unit picker's *Statistical* group (from `unitChoices`, which already groups by dimension and only needs the dimension label EN "Statistical" / PL "Statystyczne");
  - the material form's base-unit select drops the `statistical` group, but keeps a stored base unit `SU` as its current option. `unitSelect` today keeps only *unregistered* current values (`unit-choices.ts`, about line 33), so it must also keep a current value whose group was dropped;
  - the SU hint in the Add conversion dialog;
  - the Stock page filter;
  - the Statistical units page, nav entry, help topic and EN/PL texts.
- **`@cpg/db`**: nothing. No entity, no migration.

## 📝 API Contracts

No new route, and every change rides an existing surface:

- `POST /api/tenants/{t}/materials/{id}/conversions` with `unit: "SU"` creates the factor (already allowed, since SU becomes a registered unit). `PATCH` and `DELETE …/conversions/SU` change or remove it.
- `POST`/`PATCH …/materials` with `baseUnit: "SU"` answers 400 `VALIDATION_FAILED`, field `baseUnit`.
- Any document, forecast, BOM or stock line with `unit: "SU"` answers 400 `UNIT_NOT_CONVERTIBLE`, exactly as a unit without a conversion does today. Before this change, `SU` got the same answer because no material had an SU conversion, so no client sees a behaviour change (BACKWARD_COMPATIBILITY.md).
- The master-data import's unit-conversion sheet accepts `SU` rows. Its BOM sheet refuses an SU component unit through `convertToBaseQuantity`.

## 📝 Edge Cases & Failure Scenarios

- **A free-text `SU` stored before the registry (#217)** is read as the SU factor from now on, and lines can no longer be entered in it: a narrowing for that material. Step 0 of the plan checks production for it. A material whose base unit is `SU` counts 1:1 in SU totals (its base *is* SU), keeps accepting entry in its base unit, and keeps showing it on the material page.
- **A factor that rounds to zero** (an SU per base unit below 0.000001) is refused by the existing factor validation. A small per-material total can still round to `0.000000` SU, and it then shows as 0, never as an error.
- **A product without a factor** in an SU report is excluded and named in a warning callout, never counted as zero silently (#240).
- **Removing a factor** while someone has a report open: the next read excludes the product and says so.
- **Inactive products** keep and show their factor. Reports still convert their history.

## 📝 Risks & Impact Review

- Protected surfaces (BACKWARD_COMPATIBILITY.md): the unit registry gains one unit and one dimension, which is additive. Entry refusals answer the code clients already get. No schema change, so rollback is a revert. Factors stored by then stay harmless conversions that nothing offers for entry.
- **Changing a base unit gets harder.** An SU factor is a conversion, so changing a product's base unit is refused with `BASE_UNIT_HAS_CONVERSIONS` until the SU factor is removed too. This applies to all ten dataset products. That is the existing rule, now hit more often; the Statistical units page says so in its intro.
- `BACKWARD_COMPATIBILITY.md` is updated in step 5: 26 registry units; document lines accept any unit their material converts **except `SU`**; the new UI route `/admin/{tenant}/statistical-units` with help topic `statistical-units`.
- Test churn: tests that enumerate `UNIT_DIMENSIONS`/`UNITS`, the material form's unit groups, and the dataset's conversion counts change. `test-reset` and realistic-reset duration tests see 10 more conversion rows (negligible).

## 📝 Decisions in play

- **D04** (baseline frozen): extended by **D08**, owner-approved on #239/#240.
- **R03** (exact decimals): all SU maths is `bigint`, rounded once per material total.

## 📋 Phasing

One phase, one PR (size S–M). It ships before or with #240's first phase, which uses `report-units.ts`.

## 📋 Implementation Plan

### Phase 1 — statistical unit

0. **Production check.** On cpg.baby, read-only, count `material_conversion.unit = 'SU'` and `material.base_unit = 'SU'` in both tenants, and record the result in the PR. If any exists, stop and ask the owner before shipping the entry refusal.
1. **Registry and refusals.**
   - Add the `statistical` dimension, the `SU` unit, `STATISTICAL_UNIT` and `isStatisticalUnit`.
   - Refuse SU as a base unit (schema, service and form) with the new EN/PL message.
   - Refuse SU in `convertToBaseQuantity` with `UNIT_NOT_CONVERTIBLE`.
   - Tests:
     - registry lookups;
     - the base-unit refusal on create and edit (UI action and API);
     - one service test per entry family proving the 400 and that nothing is written: BOM line, forecast, purchase-order line, customer-order line, shipment line, stock correction, stock-import row.
2. **Entry pickers.** Filter SU out of `listUnits()`, the completion `units` map, the Stock page's units and the demo `unitsOf`. Add the *Statistical* group label and the SU hint in the Add conversion dialog. Unit and component tests prove that SU is offered in the conversion dialog only, and that a material with an SU conversion still lists only physical units on every line form.
3. **Report helpers.** Add `domain/units/report-units.ts` (`fromBase`, `reportUnits`, `resolveReportUnit`, `statisticalFactor`). Tests cover:
   - exact half-up rounding, against hand-computed values (`3 each × 1.5 = 4.5 SU`, `1 each ÷ 0.333333`);
   - the 0/1/2+ selection rule;
   - a stale unit;
   - a material without a factor;
   - a legacy base unit `SU`.
4. **Statistical units page.** Add `MaterialService.statisticalFactors()` (two queries, tested at 50 products), the page, the nav entry (`nav-tree.ts`, `ICONS`) and its EN/PL labels, the help topic and EN/PL texts. The menu-shape tests change: `nav-items.test.ts`, `nav-tree.test.ts`, `sidebar-nav.test.tsx` and `tests/integration/navigation.test.ts`, so run that integration file too. Page and component tests cover "Not set", inactive products and the count line. Integration test `tests/integration/statistical-units.test.ts`: create a finished product, add an SU conversion over the API, see it on the page, and see a line in SU refused.
5. **Datasets and docs.**
   - Add the ten factors to `test-tenant-config.json` and run the reset and dataset tests.
   - `engineering-standards.md` gets one line under units: "SU is report-only: entered quantities never use it".
   - Update `BACKWARD_COMPATIBILITY.md` as listed under Risks.
   - Run `smoke.test.ts` only if a migration slipped in (none expected).

## Implementation notes

Implemented on PR #242 (run plan `.ai/pipeline/runs/2026-10-25--0940UTC-statistical-unit.md`).

- **Step 0 (production check) was not run by the agent.** Reading cpg.baby's database needs production access, which an autonomous run doesn't take. The owner runs it before merging (the PR says how); if any `SU` row exists, the owner decides before shipping the entry refusal.
- **The count line reads "Finished products with an SU factor: 8 of 10."** (PL "Wyroby gotowe ze współczynnikiem SU: 8 z 10."), not "8 of 10 finished products have an SU factor.". The label form needs no plural forms in either language, where the sentence would agree with two different numbers.
- **The SU hint follows the unit choice.** `CrudField.description` may now be a function of the form's values (`ui/backend/forms/crud-form.tsx`). The conversion form's Base quantity hint gains the SU sentence while SU is chosen. The form already asked for Alternate quantity before Base quantity, so that order needed no change.
- **`unitSelect` takes `physicalOnly`.** It leaves the statistical group out of the base-unit select and keeps a stored `SU` first under its registry name, as it keeps an unregistered unit.
- **Entry refusal.** `convertToBaseQuantity` refuses `SU` before looking for a conversion, with the same code and the message "Material {id} can't be entered in SU: the statistical unit is for reports only." (the generic "has no conversion" text would be untrue when a factor exists). The document services report it as `VALIDATION_FAILED` on `lines.N.unit` (or `components.N.unit`, `unit`), as they report any unit without a conversion; stock corrections and the stock import keep the `UNIT_NOT_CONVERTIBLE` code.
- **`MaterialService.statisticalFactors()`** returns `StatisticalFactorView` rows: `perBaseUnit` (SU per base unit, or `null`) and `otherUnits` (each other conversion in SU: `1 unit = (n × sd) / (d × sn)` SU, rounded once, R03). `report-units.ts` has no core barrel export yet; #240 imports what it needs.
- **The "Not set" warning** uses the warning text and icon in the factor cell, not a row tone, so the icon isn't shown twice.
- **`fromBase` rounds a negative total away from zero**, as its positive twin, since #240 may convert net totals.
- **The Add conversion and Change factor forms explain SU.** With SU chosen, the unit hint reads "For reports only: SU adds up different products, and nothing is entered in it.", and Change factor on an SU row shows the factor hint too. Its description says reports use the new factor for all of history (Q4), instead of "Only new entries use the new factor".
