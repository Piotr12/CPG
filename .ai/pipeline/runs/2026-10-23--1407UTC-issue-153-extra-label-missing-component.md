# One name for an extra component, and a refusal that names the missing pinned component — #153

Source doc: .ai/specs/implemented/2026-10-20--2221UTC-production-completions.md
Status: complete
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
- 14:30 UTC — `om-auto-qa-pr` evidence only: PASS on the three screens in EN and PL, plus 390 px, with 7 screenshots on #174. The API refusal's evidence is `production-completions.test.ts`. CI shard 4 failed in `document-lifecycle.test.ts` ("Close Early — Transfers" button not found 253 ms after a 390 px `open`). That screen is outside this change, so the failed job was re-run.
- 14:18 UTC — `om-auto-review-pr 174 --autofix`: approve, no blockers or majors. Gate re-run on 3c9e20a: lint (only the existing `bom.service.ts` warning), typecheck, `test:coverage` 100% (487 files, 3,327 tests), build all pass. `production-completions.test.ts` passed 4/4 against a fresh standalone copy of that build on port 3175 (the 3174 server's data dir already held the suite's fixtures, so its `beforeAll` got a 409). Two nits: `BACKWARD_COMPATIBILITY.md`'s route envelope now lists `params?` (0d0fe80); `EXTRA_INPUT_QUANTITY_MESSAGE` still says "added input" in the English API text, left as is because the issue covers the three screens and English API messages stay stable.
- 14:14 UTC — Gate on this source: lint (only the existing `bom.service.ts` warning), typecheck, `test:coverage` 487 files / 3,327 tests at 100%, build. Docker isn't running here, so `production-completions.test.ts` (4 tests) ran against a fresh standalone copy (static + public, empty `DATA_DIR`) on port 3174 and passed, including the new 400 with `params.material`.
- 14:12 UTC — Phases 1–3 committed (2cfe98a, 08c7787, 37d4871). Decision comment posted on #153. The compatibility notes and the standards' envelope description now mention `params` on `VALIDATION_FAILED`.
- 14:08 UTC — Draft PR #174 opened.
- 14:07 UTC — Began on `feat/issue-153-extra-label-missing-component` from `origin/main` (8adea42) in the cezar worktree. Feature route: no Definition of Ready in `SDLC.md`, no PR or claim on #153.

## Progress

PR: #174

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: One term for an extra component

- [x] 1.1 EN/PL completion labels use "Extra" / "Dodatkowy", with label tests asserting the three screens agree. — 2cfe98a

### Phase 2: Name the missing pinned component

- [x] 2.1 `ValidationError` carries optional params through both wrappers. — 08c7787
- [x] 2.2 The completion service names the missing components, and the form shows them in EN and PL. — 08c7787

### Phase 3: Paperwork

- [x] 3.1 Spec implementation notes, decision comment on #153, lessons. — 37d4871
