# Execution plan — quantity-field tooltips (#290, E20-S01)

**Date:** 2026-10-27 05:42 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task d75a69b6, `om-auto-fix-issue 290` → `om-auto-implement-spec` → `om-auto-create-pr`)
**Source doc:** .ai/specs/2026-10-27--0526UTC-quantity-field-tooltips.md
**Spec PR:** #296 (design-only, `Refs #290`)
**Issue:** #290
**Status:** complete

## Goal

Every quantity field on the production-order form and on the master-data forms has an info control. It opens on hover, tap or keyboard focus and explains, in EN and PL, the unit the field takes and how the entry becomes a six-decimal base-unit quantity (UX-014).

## Scope

- `packages/ui`: a new `backend/forms/info-tip.tsx`, plus `CrudField.tooltip` and `CrudFormProps.infoLabel` in `crud-form.tsx`.
- `packages/app`:
  - the production-order dialog, content and screen;
  - material and conversion fields;
  - planning-parameter fields;
  - safety-stock add and change dialogs;
  - the BOM `recipe-form.tsx`;
  - the EN/PL dictionaries and the labels builders.
- `tests/integration/field-tooltips.test.ts`, and the `setDevice` helper in `tests/integration/browser.ts`.
- `.ai/specs/research/CPG-acceptance.md` (UX-014 → Passed (automated)), and the spec moves to `implemented/`.

**Non-goals:** other documents' quantity fields, the completion form, stock corrections, the MRP screens; any API, schema or conversion change; rewording existing hints.

## Deviations

- **Stacked on the spec branch.** `feat/quantity-field-tooltips` branches from `spec/quantity-field-tooltips` (PR #296) rather than `origin/main` with the spec materialized uncommitted. That way this PR can move the spec to `implemented/` and keep `tests/spec-images.test.ts` green (lesson 2026-10-23 "Close the paperwork"). #296 merges first; this PR's diff then shrinks to the implementation.
- **Separate worktree.** The run works in `.ai/cezar/tmp/d75a69b6-…/impl`, not the task's cezar worktree. That worktree holds an untracked `node_modules` symlink to the main checkout, which the harness would not let the run remove, and `npm ci` there would empty the main checkout's install (lesson 2026-10-27).
- **No local Docker.** The daemon is down, so the integration file runs against a local standalone server (lesson 2026-10-23 "Running integration tests against a local standalone server"), or else in CI only. The result is recorded below.

## Risks

- Radix Popover dismissal versus the pinned state: a press on the `PopoverAnchor` button counts as "outside" (spec Proposed Solution 1). Covered by unit tests inside a real `Dialog`.
- The always-rendered sr-only text joins `innerText`: grep the existing assertions on whole-form text.

## Implementation Plan

As in the spec's Implementation Plan, Phases 1–3, Steps 1–9.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: InfoTip and CrudField.tooltip

- [x] 1.1 InfoTip control in @cpg/ui with tests — ff3a744b
- [x] 1.2 CrudField.tooltip and CrudFormProps.infoLabel with tests — f858e454

### Phase 2: CrudForm field tooltips and copy

- [x] 2.1 Dictionaries, forms.infoLabel and labels builders — 2e5ad3d9
- [x] 2.2 Production order Planned quantity tooltip with units — fee5d472
- [x] 2.3 Material base unit and conversion tooltips — 344a630f
- [x] 2.4 Planning parameters and safety stock tooltips — b01651b1

### Phase 3: BOM form, integration, acceptance

- [x] 3.1 BOM component quantity tooltip — efe2da29
- [x] 3.2 Integration test field-tooltips — 6908ada7
- [x] 3.3 UX-014 acceptance and spec to implemented — b93ba3a6

## Log

- 05:42 — Slot free (no `feat/quantity-field-tooltips` on the remote, no PR besides spec PR #296). Worktree created and `npm ci` done (913 packages).
- 06:48 — Phase 1 done. Two findings while testing, both now in `InfoTip` with tests:
  - a dialog focuses its first tabbable control when it opens, so a tooltip field first in the form (production-order edit, change target, change factor) would pop its tip unasked. Focus now opens the tip only when the button matches `:focus-visible`, which is keyboard focus; a click or tap pins it anyway;
  - a blur while the tip is closed found no content ref, so it is read with `?.`.

  This Radix version defers an outside press to its `click`, so the `onInteractOutside` guard matters for hover-then-click. A mutation check confirmed the test fails without the guard.
- 07:05 — Phase 2 done. The shared `baseUnitTip` and `chosenBaseUnit` helpers in `components/forms/form-labels.ts` name the chosen material's base unit (the picker option's `detail`) on the add forms. The change forms pass `row.baseUnit`. `ProductionContent` now loads `listUnits()` on the list page too.
- 07:15 — Phase 3 done. `tests/integration/field-tooltips.test.ts` passed 3/3 against a local standalone server (Docker is down; lesson 2026-10-23), and so did the touched screens' files: production-orders, planning-parameters, materials and boms, 41/41. QA screenshots with a tooltip open were taken at 1280 px (production order by keyboard, planning parameters by hover, BOM) and at 390 px (conversion by tap).
- 07:20 — Full gate green:
  - `npm run lint` exit 0;
  - `npm run typecheck` exit 0;
  - `npm run test:coverage`: 597 files, 4634 tests, 100% statements, branches, functions and lines;
  - `npm run build` exit 0.
- 07:45 — `om-auto-review-pr 297 --autofix`. A fresh-context review requested changes: one major (dialogs whose first field has a tooltip gave first focus to the info button) and five minors or nits. All six were fixed:
  - `7dd6db7d` — `CrudForm` autofocuses that field, mutation-checked;
  - `84e4b664` — the unmount test asserts the component's own timer id, mutation-checked; the pinned-tip-closes-on-Tab deviation is recorded and tested; the 390 px test waits for a shown button and finished animations; the doc comment is placed correctly.

  Re-review: **approve**. Its one nit is documented in `CrudField.tooltip`. Gate green again: 4638 tests, 100% coverage, build. On a fresh standalone build: field-tooltips, production-orders, planning-parameters, materials, boms and statistical-units, 47/47.
