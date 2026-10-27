# Execution plan — quantity-field tooltips (#290, E20-S01)

**Date:** 2026-10-27 05:42 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task d75a69b6, `om-auto-fix-issue 290` → `om-auto-implement-spec` → `om-auto-create-pr`)
**Source doc:** .ai/specs/2026-10-27--0526UTC-quantity-field-tooltips.md
**Spec PR:** #296 (design-only, `Refs #290`)
**Issue:** #290
**Status:** in progress

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

- [ ] 1.1 InfoTip control in @cpg/ui with tests
- [ ] 1.2 CrudField.tooltip and CrudFormProps.infoLabel with tests

### Phase 2: CrudForm field tooltips and copy

- [ ] 2.1 Dictionaries, forms.infoLabel and labels builders
- [ ] 2.2 Production order Planned quantity tooltip with units
- [ ] 2.3 Material base unit and conversion tooltips
- [ ] 2.4 Planning parameters and safety stock tooltips

### Phase 3: BOM form, integration, acceptance

- [ ] 3.1 BOM component quantity tooltip
- [ ] 3.2 Integration test field-tooltips
- [ ] 3.3 UX-014 acceptance and spec to implemented

## Log

- 05:42 — Slot free (no `feat/quantity-field-tooltips` on the remote, no PR besides spec PR #296). Worktree created and `npm ci` done (913 packages).
