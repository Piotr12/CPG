# MRP report pinned columns: the date, the balance and the shortage stay in view at 1280 px however many figures the day table gains

**Status:** implemented
**Created:** 2026-11-02 13:03 UTC
**Issue:** #311 (follow-up from #307's QA) · **Depends on:** the MRP report (`implemented/2026-10-31--0907UTC-mrp-report.md`, #284), its weeks and marks (`implemented/2026-11-01--1105UTC-mrp-report-weeks.md`, #285), its explanations (`implemented/2026-11-02--0652UTC-mrp-report-explanations.md`, #286), production and transfer supply (#277, PR #307), all merged · **Design authority:** `.ai/docs/engineering-standards.md` (lists use `DataTable`), lesson 2026-10-20 "Tall dialogs and dense tables need real-browser checks", lesson 2026-11-01 "Two features merged together need a check at their seam"

## 📝 TLDR

Today a pair's day table on the MRP page has 14 columns: the date, 12 figures and Warnings. At 1280 px with the menu expanded, only the date stays in view while the table scrolls sideways, and Projected after proposals and Shortage start past its right edge (#307's QA). Projected before proposals sits right at that edge. This spec proposes that, from 1024 px (`lg`) up, `DataTable` can pin up to two columns to the table's right edge. The day table pins **Projected before proposals** and **Shortage**, and the week table pins **Lowest projected balance** and **Peak shortage**. A planner then sees the date, the balance and the shortage at once, and scrolls the other figures between them. Column order and count stay the same, so a new figure only widens the scrolling middle.

## 📝 Problem Statement

#307 (E15-S03) added dependent demand, transfer out and transfer in to the day table. With 12 figures, the table no longer fits beside the expanded menu at 1280 px. #307's QA measured Projected after proposals and Shortage 193 px past the right edge of the table's scroll region. The page itself still fits, and `tests/integration/mrp-report.test.ts` only checks that. #285 and #286 have since merged and added no day column. The week table has 15 columns (week, 11 figures, Lowest projected balance, Peak shortage, Warnings), so the same thing happens there.

The day table answers two questions: is this pair short on this day, and why. The answer is in the date, the balance and the shortage, and it is the part that scrolls out of view. Every figure the backlog adds widens the table again. A layout that only fits today's columns breaks with the next story.

At 1280 × 800, the content column is 1280 − 256 (the menu) − 48 (`md:px-6`) = 976 px. The day table needs about 112 px (date) + 12 × 96 px (figures) + 128 px (warnings) ≈ 1,390 px.

## Resolved assumptions (autonomous defaults)

| # | Question | Default | Rationale |
| --- | --- | --- | --- |
| Q1 | Pin the columns, group the figures, or reorder them? | **Pin**: Projected before proposals and Shortage stick to the table's right edge (CSS `position: sticky; right: …`), in their current DOM order. | It is the frozen pane spreadsheets and AG Grid's "pinned right" use. Order and count stay unchanged, so readers that count `thead th` (14) or read `[data-mrp-figure]` keep working (lesson 2026-11-01). New figures widen the scrolling middle, not the pinned part. Grouping several figures into one cell makes numbers harder to scan and still grows. Reordering breaks the PRD §07 order (demand, supply, balances, shortage). |
| Q2 | Does the week table get the same treatment? | **Yes**: pin **Lowest projected balance** and **Peak shortage**, the week's equivalents of the day's balance and shortage (#285). | The Day/Week switch should not move the shortage out of view. The week table is wider than the day table, and it costs only two `pin` flags on columns that are already adjacent. |
| Q3 | At which widths are the columns pinned? | **From `lg` (1024 px) up.** Below that, only the date sticks, as today. | At 390 px, the date plus two 128 px columns would fill the whole region (≈ 358 px), leaving no room to scroll. At 1024 px with the menu expanded, about 350 px remain for the scrolling figures, at 1280 px about 610 px. |
| Q4 | Is Projected after proposals pinned too? | **No.** It stays between the pinned pair in DOM order (`projectedBefore, projectedAfter, shortage`), so it comes into view, in its own place, at the end of the scroll. | The issue names the date, the balance and the shortage. A third pinned column would leave about 220 px at 1024 px. Moving it out from between the pair would change the PRD order (before, after). Being reachable at the end of the scroll is enough to meet the acceptance criterion "every other figure stays reachable". |
| Q5 | Does the pair list (the page's first table) pin columns? | **No.** | It has five columns and fits at 1280 px. |

## 📝 Proposed Solution

1. **`DataTable` (in `@cpg/ui`) gains `pin?: "end"` on a column.** From `lg` up, a pinned-end column is sticky against the right edge of the table's scroll region, with a fixed width so the neighbour's offset is known. The last pinned column (in DOM order) takes `right: 0`, and the one before it `right: 8rem`. Below `lg`, the flag does nothing. Up to two columns can be pinned. Pinning a third, pinning the first column (already sticky at the left) or pinning a column that isn't priority 1 throws, as a `status` column that isn't priority 1 does today. Nothing else about `DataTable` changes, and every table that doesn't set `pin` renders exactly as before.
2. **The MRP report sets `pin: "end"`** on `projectedBefore` and `shortage` in `PlanDays`, and on `lowestProjectedBefore` and `peakShortage` in `PlanWeeks`. Their header text, their `data-mrp-figure` hooks and the column order stay the same.
3. **The integration test** checks, in a real browser at 1280 × 800 with the menu expanded, that the three columns are in view and unobstructed, scrolled to the start and to the end, in English and Polish. It also checks that every other figure can be scrolled into the gap between them, and that at 390 px nothing but the date is sticky.

**Alternatives considered.**

- *Grouped figures* (a Demand cell listing firm, forecast, dependent and transfer out, and so on). It needs fewer columns, but the numbers no longer line up in a column a planner can scan, and each new demand or supply term makes its group taller. Rejected.
- *Move the balance and shortage after the date, unpinned.* They would be in view at the start, but scrolling to the demand terms hides them again. It also changes column indices that tests read. Rejected.
- *Pin them on the left after the date.* It needs the same fixed widths as pinning on the right, but it breaks the PRD order and moves every figure column's index. Rejected.
- *Measure the widths in the browser* (a `ResizeObserver` sets the offsets). It needs a client component in a server-rendered table, and the offsets would be wrong until hydration. Fixed widths are simpler and correct on the first frame. Rejected.
- *Let the user hide columns.* It adds a new control and a stored preference, and doesn't keep the three columns in view by default. Out of scope.

## 📝 Architecture

Only presentation changes: no data, service, API or migration change.

- `packages/ui/src/backend/tables/data-table.tsx`:
  - `DataTableColumn.pin?: "end"`;
  - `columnClasses` (or a sibling helper that `DataTable` calls with the column's index among pinned columns) adds the pinned classes;
  - the throws, next to the existing `status` check.
  
  The classes are complete strings in a constant, since Tailwind generates only classes it finds whole in the source:
  - shared by header and cells: `lg:sticky lg:w-32 lg:min-w-32 lg:bg-background lg:whitespace-normal lg:wrap-anywhere`;
  - the offset: `lg:right-0` for the last pinned column, `lg:right-32` for the one before it;
  - the first pinned column (the left edge of the frozen part): a 1 px inset shadow in the border token, `lg:shadow-[inset_1px_0_0_var(--color-border)]`, showing where the pinned part starts while figures scroll under it. Not `border-l`: Tailwind's preflight sets `border-collapse: collapse`, so the table paints that border, not the cell. The border could be left behind as the sticky cell moves, and its half-pixel would blur the edge measurements;
  - the header: `lg:z-10`, as the sticky first header has.
  
  The pinned classes go after the kind and priority classes, and before `column.className`, so a caller can still override them. They don't clash with a quantity's `min-w-24 whitespace-nowrap`: they're different variants, and `lg:` wins in the cascade.

  The fixed width makes the right-hand column's offset exact. In auto table layout, a column is never narrower than its min-content. `wrap-anywhere` keeps the min-content small, so an unusually long figure wraps inside its 128 px instead of widening the column and sliding under its pinned neighbour. 128 px fits a value such as `−12 345 678,5` on one line. The trade-off: a longer value can break mid-number. Only `wrap-anywhere` lowers the min-content. `wrap-break-word` doesn't, so it would widen the column instead.
- `packages/app/src/components/mrp/mrp-report.tsx`: the four `pin: "end"` flags. `PlanDays`'s `figure()` sets it for `projectedBefore` and `shortage` only. The comment above `PlanDays` changes from "every figure in view at any width: the table scrolls sideways" to state what stays pinned.
- Nothing else uses `pin`. Other dense tables can opt in later (stock report, variance report), but that is out of scope.

Sticky stacking: a sticky cell paints above the non-positioned cells that scroll under it. A right-sticky cell stays pinned while its own place is past the right edge. Shortage pins until only Warnings' width is left to scroll, Projected before proposals until only Projected after proposals' and Warnings' widths are left. In the day table, Projected after proposals sits between the pair. It stays under the pinned cells or past the edge until the last part of the scroll, and Warnings stays past the edge. Both come into view in their own places at the end, where every column is in its natural position. In the week table the pinned pair is adjacent, and only Warnings behaves that way. At `lg` and wider, the date (sticky left) and the pinned pair never meet: about 350 px stay free between them at 1024 px.

## 📝 API Contracts

None. The report's HTML keeps every column, header text and `data-mrp-*` hook. `DataTableColumn.pin` is an additive, optional prop of an internal UI package (not a `BACKWARD_COMPATIBILITY.md` surface).

## 📝 UI/UX

The one-pair section of the MRP page, in Day and Week view, from 1024 px up:

- **Scrolled to the start:** the date, then the demand and supply figures as far as they fit, then, at the right edge, **Projected before proposals** and **Shortage**, separated from the scrolling figures by a 1 px edge. A negative balance stays danger-toned in the pinned cell, and a short day keeps the danger edge on its date cell.
- **Scrolling sideways** (wheel, trackpad, or arrow keys in the focused region, which stays labelled "Days of the plan"): the demand and supply figures move through the gap between the date and the pinned pair.
- **Scrolled to the end:** the pinned pair returns to its own place, so Projected after proposals shows between Projected before proposals and Shortage, and Warnings shows last, in natural order. Those two are the only columns that need the full scroll.
- **Week view:** the same, with **Lowest projected balance** and **Peak shortage** pinned.
- **Below 1024 px** (tablet, 390 px phone): unchanged. Only the date sticks, and the whole row scrolls in the table's region. The page never scrolls sideways at any width.
- **Headers:** a pinned header wraps within 128 px, for example "Projected before / proposals" and "Prognozowany stan / przed propozycjami". The longest single words fit: "propozycjami" and "zapotrzebowanie" are about 100 px at `text-sm`.
- **Hover:** as on the sticky date cell, a pinned cell keeps the page background when its row is hovered. The row's hover tint shows on the scrolling cells only, which is today's behaviour for the first column.
- **Dark mode:** `bg-background` and `border` are theme tokens, so pinned cells follow the theme.

Prototype: none. The change is the position of existing columns, and the integration test's measurements are the evidence. The implementation PR attaches 1280 px screenshots, scrolled to the start and to the middle, in both languages.

## 📝 Edge Cases & Failure Scenarios

- **A figure wider than 128 px** (a balance of many millions with decimals): it wraps inside its cell rather than widening the column, so it never overlaps its pinned neighbour. The row gets taller. The unit test asserts the wrapping classes, and a real-browser check with a long value is part of the implementation's QA.
- **A table with no rows:** the empty state's single `colSpan` cell isn't pinned and renders as today.
- **Fewer columns than the region's width** (a wide monitor): the pinned columns are already at the right edge of a table that doesn't scroll, so `sticky` has no visible effect.
- **A future figure:** it goes before the pinned pair in DOM order (or after Warnings, if a reader counts on Warnings' index) and scrolls with the others. The pinned part keeps its 256 px, so at 1280 px about 610 px stay for scrolling figures however many there are.
- **A third pinned column, a pinned first column, or a pinned column that isn't priority 1:** `DataTable` throws at render with the column's id. A developer error, caught by the component's unit test.
- **Browser support:** `position: sticky` on `th`/`td` is supported by every evergreen browser the app targets, and the first column already relies on it.

## 📝 Risks & Impact Review

- **Reversibility:** removing the four `pin` flags restores today's layout exactly. No stored state, URL parameter or API is involved.
- **Seam with other tables:** `DataTable` renders every list screen. The change only applies to columns with `pin`, and the existing `data-table.test.tsx` assertions must keep passing unchanged. That proves columns without `pin` get no new class.
- **Seam with the readers of the MRP tables:** `mrp-report.test.ts` counts 14 day headers and reads figures through `[data-mrp-figure]`, and `mrp-accept.test.ts` and `mrp-report-api.test.ts` read the same tables. Column order is unchanged, so they must pass unmodified. Their files run in CI.
- **Visual risk:** a sticky cell with a transparent background would show the scrolling text through it. `bg-background` on both header and body cells prevents that, and the integration test checks the pinned cells are on top with `elementFromPoint` at their centre.

## 📋 Phasing

One phase: the `DataTable` option and the MRP report's use of it ship together, with their unit and integration tests. Without a user, the option alone would be dead code that the 100% coverage gate still has to cover.

## 📋 Implementation Plan

1. **`DataTable` pinned-end columns** (`packages/ui/src/backend/tables/data-table.tsx`, `data-table.test.tsx`).
   - Add `pin?: "end"` to `DataTableColumn`, with a doc comment: from `lg` up, sticky at the right edge, a fixed 8rem width, two at most.
   - Compute each pinned column's position among the pinned columns, and add the shared, offset, edge and header classes from the Architecture section to header and body cells.
   - Throw for a third pinned column, a pinned first column, and a pinned column whose priority isn't 1, naming the column id.
   - Unit tests, rendered through Testing Library:
     - two pinned columns get `lg:sticky`, `lg:w-32`, `lg:bg-background` and `lg:wrap-anywhere`, the last gets `lg:right-0`, the one before `lg:right-32`, and only the first gets the inset-shadow edge;
     - the pinned header gets `lg:z-10`;
     - a single pinned column gets `lg:right-0` and the edge;
     - a `className` given by the caller is applied after the pinned classes;
     - the unpinned columns of the same table and the existing sticky first column are unchanged;
     - each of the three throws, with its message.

     These tests check classes only. Step 3 proves the layout in a real browser.
2. **The MRP report's pinned columns** (`packages/app/src/components/mrp/mrp-report.tsx`, `mrp-report.test.tsx`).
   - Set `pin: "end"` on `projectedBefore` and `shortage` in `PlanDays`, and on `lowestProjectedBefore` and `peakShortage` in `PlanWeeks`.
   - Update the `PlanDays` comment.
   - Component tests:
     - in Day view, the Projected before proposals and Shortage headers and cells carry `lg:sticky` and their offsets, and no other figure does;
     - the same in Week view for Lowest projected balance and Peak shortage;
     - the header count and order are unchanged (14 day, 15 week).
3. **Real-browser proof** (`tests/integration/mrp-report.test.ts`). Add one test, next to the existing "keeps the page itself from scrolling sideways" test, with the same pair (`?material=${ids.sheet}&location=${ids.plant}`).
   - At 1280 × 800, assert the menu is expanded (`[data-slot=sidebar][data-state=expanded]`).
   - Find each header by its column: the index of a figure's `td` in the first body row (found by `[data-mrp-figure=…]`) is its `thead th` index. `th` cells carry no hook, and Warnings is the last `th`.
   - In the Days region, at `scrollLeft` 0, at half its maximum and at its maximum, assert that:
     - the date, Projected before proposals and Shortage headers, and the first row's cells, each lie inside the region's bounding box horizontally;
     - Projected before proposals' right edge ≤ Shortage's left edge + 1 px, and the date's right edge ≤ Projected before proposals' left edge + 1 px;
     - `document.elementFromPoint` at each pinned header's centre is that header or inside it.
   - For every figure header before Projected before proposals in DOM order, set `scrollLeft` so the header is centred between the date's right edge and Projected before proposals' left edge. Assert it then lies entirely in that gap, which proves it is reachable and unobstructed.
   - At the maximum `scrollLeft`, assert that `elementFromPoint` at the centre of Projected after proposals' header and of Warnings' header returns that header. Those are the two columns that only come into view at the end of the scroll.
   - Repeat the checks for the Weeks region (`bucket=week`), pinning Lowest projected balance and Peak shortage. Only Warnings needs the end-of-scroll check there.
   - Switch the preference to Polish, repeat the Day checks, and restore English in a `finally` (as the explanations test does).
   - At 390 × 844, assert the Shortage header's computed `position` is not `sticky`, and that the page's `scrollWidth ≤ innerWidth`.
   - Restore 1280 × 800 in `finally`.
   - Run with `npm run test:integration -- tests/integration/mrp-report.test.ts`, then `mrp-accept.test.ts` and `mrp-report-api.test.ts`, the other readers of these tables.
4. **Close the paperwork.**
   - Move this spec to `.ai/specs/implemented/`, with `Status: implemented` and implementation notes.
   - Attach 1280 px screenshots, scrolled to the start and to the middle, in EN and PL, to the implementation PR.
   - Run `npx vitest run tests/ai-filenames.test.ts` once the spec PR has merged and `main` has been merged in (lesson 2026-10-23).

## Implementation notes

Implemented on PR #342, branched from `main` (the spec merges through #341).

- **`DataTable`.** `pinnedClasses(columns)` sits beside `columnClasses`. It computes each pinned column's classes from its position among the pinned columns and throws the three refusals. The pinned header also gets `lg:z-10`. The order is kind, priority and first-column classes, then pinned, then `column.className`.
- **MRP report.** The day table's pinned set is `PINNED_DAY_FIGURES`. The week's two columns carry `pin: "end"` inline.
- **The integration test.** One page-side `evaluate` scrolls the region and measures, and Node asserts the results (`measurePinned` / `expectPinned` in `tests/integration/mrp-report.test.ts`):
  - three positions: 0, the middle and the end;
  - nine (day) or eleven (week) figures centred in the gap;
  - the end-of-scroll columns, read with `elementFromPoint`.

  It also asserts that the table is still wider than its region, so a table that simply fits can't pass. At 390 px it asserts the pinned headers aren't sticky.
- **No deviation from the spec.** The spec review's two corrections were folded into the spec before implementation: Projected after proposals is reachable only at the end of the scroll, and the edge is an inset shadow rather than a collapsed `border-l`.

