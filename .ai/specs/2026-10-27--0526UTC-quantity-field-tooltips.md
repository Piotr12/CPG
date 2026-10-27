# Quantity-field tooltips on the production-order and master-data forms

**Status:** ready
**Created:** 2026-10-27 05:26 UTC
**Issue:** #290 (E20-S01, epic #272) · **Scenario:** UX-014 (`.ai/specs/research/CPG-acceptance.md`) · **Builds on:** `CrudForm` (`packages/ui/src/backend/forms/crud-form.tsx`), the shadcn `Popover` (`packages/ui/src/components/popover.tsx`), the BOM form's own controls (`packages/app/src/components/boms/recipe-form.tsx`) · **Also bound by:** `.ai/docs/engineering-standards.md` ("Reusable server & UI layers"), lessons 2026-10-25 "A popup inside a Radix dialog" and 2026-10-24 "A label passed to a client component must be plain data".

## 📝 TLDR

Admins entering master data and users planning production type quantities into fields that say little about the unit CPG expects or how it stores the number. Planned quantity and the BOM component quantity have no explanation at all. After this change every quantity field on the production-order form and on the master-data forms has an info button beside its label. Hovering, tapping or tabbing to the button opens a short explanation in English or Polish: which unit the field takes and how the entry becomes a six-decimal base-unit quantity. The explanation names the material's real units where the form knows them. The change is UI only: a reusable `InfoTip` control in `@cpg/ui`, an optional `tooltip` on `CrudField`, and dictionary copy. There is no API change, no migration and no change to how quantities are converted or stored.

## Resolved assumptions (autonomous defaults)

| # | Question | Answer applied | Why |
|---|---|---|---|
| Q1 | Is an always-visible hint under the field a "tooltip" in UX-014's sense, and do the existing one-line hints stay? | **The info tooltip is the UX-014 tooltip; every existing hint stays word for word.** The tooltip gives the full explanation and may restate the rule a hint summarises (for example "0 means no minimum"). | Changing the hints would add copy churn and move unit and integration assertions for no user gain. The hint is the at-a-glance line and the tooltip the on-demand detail. They sit on different elements (the input's `aria-describedby` and the info button), so a screen reader never reads both for one control. Easy to revisit: shortening a hint later is a copy-only change. |
| Q2 | Do the completion form's actual quantities and the other documents' quantity fields (requisitions, purchase orders, customer orders, forecasts, shipments, stock corrections) get the same tooltip? | **No.** | The issue's Scope and UX-014 name only production-order and master-data quantities (D04: simplest consistent behaviour). `InfoTip` and `CrudField.tooltip` make adding them later a copy-and-one-line change. |
| Q3 | The BOM form has one quantity input per component line, and none has a visible label. Is there one info control per line or one for the column? | **One per form, beside the Components heading** ("Per 1 kg of …"), named "About Component quantity". | Every line would show the same text. One control per line adds a tab stop per line and widens a grid that already stacks at 390 px. The heading is where the "per 1 base unit of the output" rule is already shown. |
| Q4 | How does Planned quantity's tooltip name the output's alternate units ("such as bag") when the production dialog only receives `MaterialSummary` (no conversions)? | **The production list page passes the `units` map it does not load today:** `materialService.listUnits()`, which the detail page and every line form already use. The dialog reads the chosen output's units from it. | It reuses an existing service read (two queries) and changes no API or contract. The alternative, a fixed example such as "bag", would be wrong for most outputs. |
| Q5 | Should the safety-stock tooltip name the base unit, like the planning-parameter tooltips must? | **Yes.** Both name the chosen material's base unit and fall back to "the material's base unit" until a material is chosen. | The forms are the same shape. Naming the unit costs nothing once the planning-parameter forms do it. |
| Q6 | Does the brief bundle more than one independently deployable capability? | **No; one spec, one PR.** The fields are useless without the control, and a control without copy ships nothing. | The single capability is UX-014. The phases below can still land as separate commits. |
| Q7 | Should the Unit field next to Planned quantity get its own tooltip? | **No.** | It is not a quantity field. Its hint already says which units it takes, and Planned quantity's tooltip covers how the pair is converted. |

## 📝 Problem Statement

- UX-014 (P1, *Not executed*): "Given a user edits a production order or master-data quantity, when they inspect the tooltip for the component's UoM or meaning, then the tooltip explains the expected entry and the BUoM behaviour for that field." No field in CPG has a tooltip today: `Tooltip` is used only by the sidebar's icon rail.
- The help spec deferred contextual tooltips to "the screens that have fields" (`.ai/specs/implemented/2026-10-19--0855UTC-user-preferences-footer-help.md` Q8). The second slice 2 closing pass left UX-014 open for the owner (`.ai/runs/2026-10-23--2123UTC-close-slice-2-epics-second-pass.md`).
- **Inventory (verified on `main@7a6ad058`):**

  | Form (component) | Quantity field | Hint today |
  |---|---|---|
  | Production order create/edit (`production-orders/production-dialog.tsx`) | Planned quantity | **none** |
  | Material create/edit (`materials/material-form-fields.ts` → `materialFormFields`) | Base unit | "Every quantity of this material is stored in this unit, exactly to six decimals." |
  | Add conversion / Change factor (`materialFormFields.ts` → `conversionFormFields`) | Alternate quantity, Base quantity | example "1 case = 12 each"; "How many {baseUnit} … six decimals" |
  | Planning parameters add/change (`planning-parameters/planning-parameter-fields.ts` → `valueFields`) | Minimum lot, Lot multiple | "In the material's base unit. 0 means no minimum." / "… 0.000001 means no rounding." |
  | Safety-stock add/change target (`safety-stock/add-safety-stock-target-dialog.tsx`, `safety-stock-target-actions.tsx`) | Target | "In the material's base unit. 0 ends the buffer from this date." |
  | BOM create/edit (`boms/recipe-form.tsx`, its own `control()`/`note()`) | each component's Quantity | **none**; the heading says "Per 1 {baseUnit} of {output}" |

- The rules users need are R03 (exact six-decimal base-unit decimals, half-up rounding, the entered unit and factor kept), R02 (the base unit locks once the material is referenced) and D08 (SU is a reporting unit and never entered). Today they are visible only in Help topics, away from the field.

## 📝 Proposed Solution

1. **`InfoTip` in `@cpg/ui`** (`packages/ui/src/backend/forms/info-tip.tsx`). It is a small round info button (`<Button type="button" variant="ghost">` with lucide `Info` at `size-3.5`) that shows a non-modal Popover of plain text. Its state is three flags, and it is open while any flag is set:
   - **`hovered`**: set on `pointerenter` and cleared on `pointerleave` about 150 ms later, for a `mouse` or `pen` pointer only, on the button or the content. Entering the content cancels a pending clear (WCAG 1.4.13: hoverable). Touch pointers never set it.
   - **`focused`**: set on the button's `focus` and cleared on its `blur`, unless `relatedTarget` is inside the content. Radix's FocusScope gives the content `tabIndex=-1`, so pressing the text would otherwise close it.
   - **`pinned`**: a click or tap on the button toggles it. When it unpins, it clears all three flags, so a second click closes the tip even while the pointer is over it or the button has focus. It reopens on the next pointer entry or focus. A hover-then-click and a focus-then-click (Android focuses a button on tap) both leave the tip **open**.

   Escape and a press outside clear all three. The press outside is Radix's `onDismiss`, with `onInteractOutside` ignoring the button itself, since a `PopoverAnchor` button is "outside" to Radix and its deferred dismiss would otherwise undo the click. Opening never moves focus (`onOpenAutoFocus` prevented).

   Props: `label` (the accessible name, required), `children` (the text, a string), optional `className`. **Accessibility:** the button permanently carries `aria-describedby` → an always-rendered `sr-only` copy of the text, so a screen reader announces it on focus whether or not the tip is open. The visible Popover content is `aria-hidden="true"`, so it is never read twice. The button has no `aria-expanded` and no `role="tooltip"`: the sr-only description is the accessible channel, and the Popover is presentation only.
2. **`CrudField.tooltip`** — `tooltip?: string | ((values: Record<string, string>) => string | undefined)`, typed like `description` (a function only in a client component). When it yields text, `CrudForm` renders the label row as `flex items-center gap-1`: `<Label>` then `<InfoTip label={…}>`. Use `gap-1` rather than `gap-1.5`, which `tests/design-tokens.test.ts` allows only under `packages/ui/src/components/`. The accessible name comes from a new `CrudFormProps.infoLabel` template, default `"About {field}"`, with `{field}` replaced by the field's label. The input's `aria-describedby` keeps pointing at the hint or error only.
3. **The BOM form** puts one `InfoTip` right after the `<legend>`, not inside it, in a `flex items-center gap-1` wrapper (Q3). A button inside the legend would join the fieldset's accessible name. The form takes the button's accessible name from its labels.
4. **Copy** in `en.ts` / `pl.ts`, per concept section (table below). A new top-level `forms: { infoLabel }` dictionary section holds the shared accessible-name template. Each concept's labels builder picks that plain string out, never the whole section.
5. **Planned quantity's units**: `ProductionContent` loads `listUnits()` for the list page too (today only for the detail page) and `ProductionScreen` passes `units` to `ProductionDialog` (Q4).

**Alternatives considered:**

- **The shadcn/Radix `Tooltip`**, as the issue's implementation notes suggest first. It loses because Radix Tooltip ignores touch: it opens on mouse hover and focus, and a tap neither opens it nor keeps it open. That fails the 390 px "user taps the info control" criterion. The issue allows a popover "if touch needs it", and the shadcn `Popover` is already in `packages/ui`, so no `shadcn add` is needed.
- **Only lengthening the visible hints.** That puts five lines of text under each field and doesn't meet UX-014's "tooltip". Rejected.
- **Putting the explanation in the input's `aria-describedby`.** A screen reader would then read the whole paragraph each time the field is focused. Rejected; the button carries it instead.

### Copy

Placeholders follow `fill()`: `{baseUnit}` and `{units}`. "Not SU" is said wherever a unit is entered, and the glossary guards apply ("BOM", never "recipe"). Polish keeps the existing terms (jednostka bazowa, jednostka alternatywna, przelicznik).

| Key (section) | EN | PL |
|---|---|---|
| `forms.infoLabel` | About {field} | Informacje o polu {field} |
| `productionOrders.quantityTip` | Enter a target greater than 0 in {baseUnit} or in a physical alternate unit this output converts, such as {units} (not SU). CPG converts it once, at the exact factor in force when you save, into {baseUnit}, rounded half up to six decimals, and keeps the unit and factor you entered with the order. Changing the quantity or unit later converts it again. | Wpisz cel większy od 0 w {baseUnit} albo w fizycznej jednostce alternatywnej, którą ten wyrób przelicza, np. {units} (nie SU). CPG przelicza go raz, dokładnym przelicznikiem obowiązującym przy zapisie, na {baseUnit}, z zaokrągleniem połówkowym w górę do sześciu miejsc po przecinku, i zapisuje przy zleceniu wpisaną jednostkę i przelicznik. Późniejsza zmiana ilości lub jednostki przelicza go ponownie. |
| `productionOrders.quantityTipBaseOnly` | Enter a target greater than 0 in {baseUnit}, to six decimals: this output converts no other physical unit yet, and SU is never entered. CPG stores it in {baseUnit} and keeps the unit you entered with the order. | Wpisz cel większy od 0 w {baseUnit}, do sześciu miejsc po przecinku: ten wyrób nie przelicza jeszcze żadnej innej fizycznej jednostki, a w SU nic się nie wpisuje. CPG zapisuje go w {baseUnit} i zapisuje przy zleceniu wpisaną jednostkę. |
| `productionOrders.quantityTipAny` | Enter a target greater than 0 in the output's base unit or in a physical alternate unit it converts (not SU). CPG converts it once, at the exact factor in force when you save, into the base unit, rounded half up to six decimals, and keeps the unit and factor you entered with the order. Changing the quantity or unit later converts it again. | Wpisz cel większy od 0 w jednostce bazowej wyrobu albo w fizycznej jednostce alternatywnej, którą wyrób przelicza (nie SU). CPG przelicza go raz, dokładnym przelicznikiem obowiązującym przy zapisie, na jednostkę bazową, z zaokrągleniem połówkowym w górę do sześciu miejsc po przecinku, i zapisuje przy zleceniu wpisaną jednostkę i przelicznik. Późniejsza zmiana ilości lub jednostki przelicza go ponownie. |
| `materials.form.baseUnitTip` | Every quantity of this material is stored in this unit, exactly to six decimals: other units are converted into it. It locks for good once stock moves, or once a BOM, production order, customer order, purchase requisition, purchase order or transfer uses the material. While conversions, planning parameters, safety-stock targets or forecasts hold values in it, remove them before changing it. | Każda ilość tego materiału jest zapisywana w tej jednostce, dokładnie do sześciu miejsc po przecinku: inne jednostki są na nią przeliczane. Blokuje się na stałe, gdy zapas się zmieni albo materiał trafi do BOM, zlecenia produkcyjnego, zamówienia klienta, zapotrzebowania zakupowego, zamówienia zakupu lub przesunięcia. Dopóki przeliczniki, parametry planowania, cele zapasu bezpieczeństwa lub prognozy mają w niej wartości, usuń je przed zmianą. |
| `materials.conversions.denominatorTip` | A conversion reads “Alternate quantity alternate units = Base quantity base units”, for example 1 bag = 25 {baseUnit}. Enter the exact factor, greater than 0. Changing it later never revalues earlier postings. SU is a reporting unit only. | Przelicznik czyta się „Ilość w jednostce alternatywnej jednostek alternatywnych = Ilość w jednostce bazowej jednostek bazowych”, np. 1 worek = 25 {baseUnit}. Wpisz dokładny przelicznik, większy od 0. Późniejsza zmiana nigdy nie przelicza wcześniejszych księgowań. SU jest wyłącznie jednostką raportową. |
| `materials.conversions.numeratorTip` | How many {baseUnit} the alternate quantity is, up to six decimals: “Alternate quantity alternate units = Base quantity {baseUnit}”. The factor must be exact and greater than 0. Changing it later never revalues earlier postings. SU is a reporting unit only. | Ile {baseUnit} to ilość w jednostce alternatywnej, do sześciu miejsc po przecinku: „Ilość w jednostce alternatywnej jednostek alternatywnych = Ilość w jednostce bazowej {baseUnit}”. Przelicznik musi być dokładny i większy od 0. Późniejsza zmiana nigdy nie przelicza wcześniejszych księgowań. SU jest wyłącznie jednostką raportową. |
| `planningParameters.form.minimumTip` | In {baseUnit}, the material's base unit, to six decimals. A planned supply is never smaller than this, even when the minimum is not a whole lot multiple. 0 means no minimum. | W {baseUnit}, jednostce bazowej materiału, do sześciu miejsc po przecinku. Planowana dostawa nigdy nie jest mniejsza, nawet gdy minimum nie jest pełną wielokrotnością partii. 0 oznacza brak minimum. |
| `planningParameters.form.lotMultipleTip` | In {baseUnit}, the material's base unit, to six decimals. Planned supply is rounded up to whole multiples of this, then raised to the minimum lot if it is still below it. 0.000001 means no rounding. | W {baseUnit}, jednostce bazowej materiału, do sześciu miejsc po przecinku. Planowana dostawa jest zaokrąglana w górę do pełnych wielokrotności tej ilości, a potem podnoszona do minimum, jeśli nadal jest mniejsza. 0,000001 oznacza brak zaokrąglania. |
| `safetyStock.form.quantityTip` | In {baseUnit}, the material's base unit, to six decimals. The target applies from its date until the next target. 0 ends the buffer from this date. | W {baseUnit}, jednostce bazowej materiału, do sześciu miejsc po przecinku. Cel obowiązuje od swojej daty do następnego celu. 0 kończy zapas od tej daty. |
| `boms.form.quantityTip` | Per one {baseUnit} of the output. Enter it in the component's base unit or in a physical unit it converts (not SU). CPG stores it in the component's base unit to six decimals. | Na jeden {baseUnit} wyrobu. Wpisz ją w jednostce bazowej składnika albo w fizycznej jednostce, którą składnik przelicza (nie SU). CPG zapisuje ją w jednostce bazowej składnika do sześciu miejsc po przecinku. |
| `boms.form.quantityInfo` | Component quantity | Ilość składnika |

The texts that name a unit have a "material not chosen yet" variant, which replaces `{baseUnit}` with the existing wording "the material's base unit" / "the output's base unit". It is a sibling key with the suffix `Any`: `minimumTipAny`, `lotMultipleTipAny`, `safetyStock.form.quantityTipAny`, `boms.form.quantityTipAny`. The implementer writes the `Any` variants in the same words as their named siblings. The exact Polish declension (`{baseUnit}` is a unit code, so "w kg", "na jeden kg") is checked in review. The exact wording may be polished in review as long as every acceptance criterion's clause stays.

## 📝 Architecture

- **`packages/ui`**: a new `backend/forms/info-tip.tsx`, beside `autocomplete.tsx`, domain-agnostic, with its tests. `crud-form.tsx` gains `CrudField.tooltip` and `CrudFormProps.infoLabel`. No other `ui` change.
- **`packages/app`**: the five form modules in the inventory set `tooltip` on their fields, and `recipe-form.tsx` renders an `InfoTip`. `production-content.tsx` loads `listUnits()` on the list page too, and `production-screen.tsx` and `production-dialog.tsx` pass `units` down. Plus the dictionaries and the labels builders that pick `forms.infoLabel`.
- **How a tooltip names a unit.** Each form already holds what it needs, as plain data:
  - production: the `materials` list (base unit) and `units[output]` (alternates, base first; SU already excluded by `listUnits`);
  - planning parameters and safety stock: the add form uses the chosen option's `detail`, which is the base unit (`materialOptions`), and the change form uses `row.baseUnit`;
  - conversions: the `baseUnit` argument;
  - BOM: `chosenOutput.baseUnit`.

  The tooltip functions run in the client components that build the fields today. Server components still pass only strings.
- **No `core`/`db` change, no API, no event, no migration.** `BACKWARD_COMPATIBILITY.md` surfaces are untouched; the `CrudField` and `CrudFormProps` additions are optional.

## 📝 UI/UX

- **Placement.** The info button sits after the label text on the label's line, vertically centred, `aria-label` = "About Planned quantity" / "Informacje o polu Planowana ilość". It is a sibling of `<Label>`, never inside it, so clicking the label still focuses the input. The tap target is at least 24 × 24 px (WCAG 2.5.8) through padding, while the icon stays 14 px.
- **Content.** Uses the `PopoverContent` look, `max-w-[min(18rem,calc(100vw-2rem))]`, `text-sm`, `side="top"` with `collisionPadding={8}`, so Radix flips or shifts it to stay inside a 390 px viewport. Plain text with no links and nothing focusable.
- **Inside a dialog.** Every one of these forms sits in a Radix `Dialog`. The Popover is a nested Radix layer: Radix gives Escape to the topmost layer, which calls `preventDefault()`, and both `CrudForm` and the BOM form already skip a `defaultPrevented` Escape. So Escape closes the tooltip and leaves the dialog and its form open. A second Escape cancels the form as today. Tested inside a real `Dialog` (lesson 2026-10-25). Pressing on the tooltip content doesn't dismiss the dialog. Opening it never moves focus out of the form.
- **Keyboard order.** Label's info button, then its input. Tab moves focus away, so blur closes the tooltip unless it was pinned. Enter or Space on the button pins or unpins it. It is `type="button"`, so neither key submits the form.
- **Screen readers.** The button is announced as "About Planned quantity, button" and then its description: the always-rendered `sr-only` text that its `aria-describedby` names. A virtual cursor reaches the same text right after the button. The visible Popover is `aria-hidden`, so nothing is read twice, and a click-opened tip needs no live region because the text was already announced on focus.
- Prototype: `.ai/specs/assets/quantity-field-tooltips/` (static mockups, when rendered by the spec PR).

## 📝 Edge Cases & Failure Scenarios

- **No output, or no material chosen yet** (create forms): the `…Any` text, with no unit named. It updates as soon as a material is chosen, because the tooltip function reads the form's values.
- **An output with no alternate unit**: `quantityTipBaseOnly`. `units[output]` lists the base unit first, so the alternates are `units[output].slice(1)`, and `length === 1` selects the base-only text. **More than three alternates**: `{units}` is `slice(1, 4)`, in the `listUnits` order (alphabetical), joined with ", ".
- **An inactive or unknown material value** (a stale draft): the value isn't in the choices, so the `…Any` text is shown. No crash.
- **Edit forms** (production order, change factor, change planning parameters, change target): the material is fixed, so its unit is always named.
- **The Change factor form for SU**: the conversion tips still say SU is a reporting unit only. The existing SU-specific hints stay (Q1).
- **A tooltip open when the dialog closes** (Cancel or Escape twice): it unmounts with the dialog, and nothing is left on the page (lesson 2026-10-19 "client state survives navigation"). Covered by the `InfoTip` unmounting with its form.
- **jsdom.** The Popover portal and the accessible description work in jsdom. Unit tests fire `pointerenter`/`pointerleave` with `pointerType: "mouse"` and `"touch"`, so the touch branch (no hover) is covered. The integration test checks the real layout.
- **No failure path reaches the server**: the change only renders text.

## 📝 Risks & Impact Review

- **Low risk.** UI and copy only, with optional props on a shared component. Every existing `CrudForm` caller renders unchanged when no field sets `tooltip`, and the existing `crud-form.test.tsx` stays green unchanged.
- **One extra read on the production list page** (`listUnits`: two queries). It already runs on the detail page and on every line form's page, so the cost is known and bounded.
- **Selectors.** Integration tests that find a label by `getByLabelText` or read a label's text still work, because the button is a sibling of the label. The always-rendered `sr-only` description is part of `innerText`, though. Before shipping, grep `tests/integration` and the unit tests for assertions on a whole dialog's or form's text (`innerText`, `toHaveTextContent` on the form) in the touched forms, and tighten any that would now match or miss.
- **Reversible**: removing a `tooltip` property removes one tooltip, and there is no data to migrate.

## 📝 Decisions in play

- R02 (BUoM locks once referenced) and R03 (six-decimal BUoM, half-up rounding, entered unit and factor kept): the copy states them and does not change them.
- D03 (translations and help grow screen by screen): every new key is added to both dictionaries.
- D04 (simplest consistent behaviour): Q2, Q3 and Q7 keep the scope to the fields the scenario names.
- D08 (SU only in reports): every tooltip of a field where a unit is chosen or converted says SU is not entered: Planned quantity, both conversion fields and the BOM quantity. The base-unit-only fields (minimum lot, lot multiple, safety-stock target, base unit) take no unit choice, so they don't mention SU.
- None superseded.

## 📋 Phasing

One implementation PR, three commits that each leave the app working: the reusable control (no visible change), the CrudForm fields, then the BOM form plus the acceptance status.

## 📋 Implementation Plan

### Phase 1: `InfoTip` and `CrudField.tooltip`

1. Add `packages/ui/src/backend/forms/info-tip.tsx` per the Proposed Solution, built on `Popover`/`PopoverAnchor`/`PopoverContent` with controlled `open` and the three flags. **Test** (`info-tip.test.tsx`), each inside a real `Dialog` that holds a `<form onSubmit>`:
   - the button's accessible name is its `label`, and its accessible description is the text, even while the tip is closed; the visible content is `aria-hidden`;
   - focus opens it, and blur closes it, except when the blur's `relatedTarget` is inside the content;
   - a click pins it, and a second click closes it even while it is focused or hovered;
   - focus followed by click and hover followed by click both leave it open;
   - with `pointerType: "mouse"`, pointer enter opens it and leave closes it after the delay (fake timers), and entering the content cancels the close; with `pointerType: "touch"`, pointer enter doesn't open it;
   - a press outside closes it, and a press on the button doesn't trigger Radix's outside dismiss;
   - Escape closes it, leaves the dialog open, and reaches a parent `onKeyDown` as `defaultPrevented`;
   - clicking it and pressing Enter on it never submit the form;
   - opening does not move focus.
2. Add `tooltip` and `infoLabel` to `CrudForm`. **Test** in `crud-form.test.tsx`:
   - a field with `tooltip` renders the button named "About {label}" (default template and a custom one);
   - a function tooltip follows the values;
   - a field without one renders no button;
   - the input's `aria-describedby` is unchanged;
   - Escape on an open tooltip doesn't call `onCancel`, and a second Escape does.

### Phase 2: CrudForm field tooltips and copy

3. Dictionaries: add `forms.infoLabel` and every key in the Copy table (EN and PL, with the `Any` variants). Extend the labels builders to carry `infoLabel` as a plain string. **Test**:
   - `messages.test.ts` already fails on a key missing from either language and on the banned glossary words;
   - add an assertion that `productionOrders.quantityTip`, `quantityTipBaseOnly`, `quantityTipAny`, `materials.conversions.denominatorTip`, `numeratorTip`, `boms.form.quantityTip` and `quantityTipAny` contain "SU" in both languages (D08's "not SU" rule);
   - each concept's `labels.test.ts` asserts the labels hold no function.
4. Production order: load `listUnits()` on the list page in `production-content.tsx` and pass `units` through `ProductionScreen` to `ProductionDialog`. Set Planned quantity's `tooltip`, choosing between the base-only, `Any` and named variants. **Test** (`production-dialog.test.tsx`, `production-content` test):
   - kg plus bag says "kg", "bag" (not "kg, bag"), "greater than 0", "not SU", "six decimals", "half up" and that the unit and factor are kept;
   - kg only gives the base-only text;
   - no output gives the `Any` text;
   - the edit form names the order's output units;
   - the content passes `units` on the list page.
5. Material and conversions: set `tooltip` on Base unit (`materialFormFields`) and on both conversion fields (`conversionFormFields`, with `{baseUnit}`). **Test** in `create-material-dialog`, `material-controls`, `add-conversion-dialog` and `conversion-actions`: each tooltip's text, in EN and in PL for one form.
6. Planning parameters and safety stock: in `valueFields`, take the base unit as a parameter (`string | ((values) => string | undefined)`), so the Add form resolves it from the chosen material's option `detail` and the Change form passes `row.baseUnit`. Set the tooltips on Minimum lot, Lot multiple and Target (add and change). **Test**: the add form names "kg" once a kg material is chosen and gives the `Any` text before that; the change form names the row's unit.

### Phase 3: BOM form, integration, acceptance

7. `recipe-form.tsx`: an `InfoTip` right after the Components `<legend>` (outside it), named by `fill(infoLabel, { field: t.quantityInfo })`, with the text from `chosenOutput` (or `Any`). **Test** in `recipe-form.test.tsx`: the text names the output's base unit, the fieldset's accessible name is unchanged, Escape inside the BOM dialog closes only the tooltip, and the `Any` text shows when no output is chosen.
8. Integration: a new `tests/integration/field-tooltips.test.ts` that sets up its own kg material converting 1 bag = 25 kg (lesson 2026-10-25 "sets up what it reads"). At 1280 px:
   - tab to Planned quantity's info button in the Create production order dialog, assert the tooltip text names kg and bag, press Escape, and assert the dialog is still open;
   - open the Minimum lot tooltip by hover in the planning-parameters dialog and read its text.

   At 390 px, with touch emulation (`agent-browser set device "iPhone 14"`, through a new `setDevice` helper in `tests/integration/browser.ts`): tap the info button on the Add conversion form, then assert the tooltip opens and its bounding box lies inside the viewport. agent-browser's `tap` is iOS-only. If Chrome's `click` under device emulation doesn't send `pointerType: "touch"`, the test dispatches `pointerdown`/`pointerup` with `pointerType: "touch"` and a `click` through `eval` instead. The UX-014 Evidence line then says that the tap was synthesised.
9. Acceptance: move UX-014 to **Passed (automated)** in `.ai/specs/research/CPG-acceptance.md`, with an Evidence line citing the unit and integration tests that assert each clause (lesson 2026-10-21 "Cite a scenario only where a test asserts it"). Move this spec to `implemented/`.

**Verification:** `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100%), `npm run build`, `npm run test:integration -- tests/integration/field-tooltips.test.ts`, then the PR's CI. QA screenshots at 1280 px and 390 px with a tooltip open in each form family.
