# One name for an extra component, and a refusal that names the missing pinned component — #153

Source doc: .ai/specs/implemented/2026-10-20--2221UTC-production-completions.md
Status: in-progress
Engine: om-auto-create-pr (steps: 4, --loop: no)

## Goal
A component outside the pinned recipe is called "Extra" (PL "Dodatkowy") on the completion form, the completion history and the variance report. The owner decisions the issue asks for are recorded with its defaults: Q1 keeps history-only variance, Q2 makes `POST …/completions` that omits a pinned component name it in `params.material`, and the screen translates that refusal in EN and PL (issue #153, E10-S04).

## Scope
- `app/src/i18n/messages/{en,pl}.ts`: the completion history's flag and the form's added-input labels use the variance report's term.
- `core/src/http/`: `ValidationError` takes optional message parameters, and both wrappers (`api-handler.ts`, `server-action.ts`) pass them through as `params` (lesson "Preserve error context through every adapter").
- `production-completion.service.ts`: the missing-component refusal sets `params.material` to the missing codes, in recipe order.
- `components/production-orders/`: `completionFieldError` and the form name the material when the parameter is there.
- The production-completions spec's implementation notes, and a decision comment on #153.

Non-goals: how variance is recorded or reported; a live per-row variance column (Q1 kept as shipped); the core English messages (`MISSING_COMPONENT_MESSAGE`, `EXTRA_INPUT_QUANTITY_MESSAGE`), which screens match by text and API callers may read.

## Decisions
- Applied the issue's defaults, since this is an autonomous run: Q1 accept history-only variance; Q2 name the missing component. Posted on #153 for the owner to override.
- The spec named by the issue is already implemented, so the issue itself is the brief; no new spec was written.
- The term follows the variance report: "Extra" / "Dodatkowy". The form's "Add input" button keeps its verb.
- Several missing components are named together, comma-separated, in recipe order, under the one `material` key.

## Risks
- Adding `params` to `VALIDATION_FAILED` is additive; clients that ignore it are unaffected.
- `tests/integration/production-completions.test.ts` clicks "Add input", which is unchanged.

## Log
- 14:07 UTC — Began on `feat/issue-153-extra-label-missing-component` from `origin/main` (8adea42) in the cezar worktree. Feature route: no Definition of Ready in `SDLC.md`, no PR or claim on #153.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: One term for an extra component

- [ ] 1.1 EN/PL completion labels use "Extra" / "Dodatkowy", with label tests asserting the three screens agree.

### Phase 2: Name the missing pinned component

- [ ] 2.1 `ValidationError` carries optional params through both wrappers.
- [ ] 2.2 The completion service names the missing components, and the form shows them in EN and PL.

### Phase 3: Paperwork

- [ ] 3.1 Spec implementation notes, decision comment on #153, lessons.
