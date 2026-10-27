# Quantity-field tooltips — spec for #290 (E20-S01)

**Date:** 2026-10-27 05:23 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task d75a69b6, `om-auto-fix-issue 290`)
**Spec:** none at start — authored by this run
**Status:** in progress

## Goal

Drive issue #290 through `om-auto-fix-issue`'s feature route: no spec exists, so `om-auto-write-spec 290` authors one on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR.

## Log

- 05:23 — Classified #290 as a feature (`feature` label, new tooltip capability). FR triage: issue open, unassigned, no PR references it, no spec in `.ai/specs/` covers it, `SDLC.md` has no Definition of Ready (step skipped), and no quantity-field tooltip exists in the code (`Tooltip` used only by the sidebar). Proceeding.
- 05:23 — Claimed #290 (assignee Piotr12, `in-progress`, claim comment). Branch `spec/quantity-field-tooltips` off `origin/main` in the cezar worktree (reused; no nested worktree).

- 05:26 — Wrote `.ai/specs/2026-10-27--0526UTC-quantity-field-tooltips.md` with `om-spec-writing --autonomous`: seven Open Questions resolved as defaults, none flagged ⚠. Key design call: a Popover-based `InfoTip` instead of the Radix `Tooltip`, which ignores touch taps and so fails the 390 px tap criterion.
- 06:20 — A fresh-context review subagent returned "revise" with 12 findings. All were checked against the code and applied:
  - the open state as hover, focus and pinned flags, with Radix outside-press handling;
  - `type="button"`, and `gap-1` (`tests/design-tokens.test.ts`);
  - an always-rendered sr-only description instead of `role="tooltip"` with `aria-expanded`;
  - blur inside the content, and the button placed outside `<legend>`;
  - `units.slice(1, 4)`, and the SU test scoped to its keys;
  - the copy: re-conversion on edit, greater than 0, the full base-unit lock list (`material.service.ts:403-411`), and the minimum versus the lot multiple (`supply-plan.ts:140`);
  - the touch path in the integration test.
- 06:37 — Docker daemon unavailable (`docker.sock` missing), so no current-app screenshots. Rendered two static mockups (1280 px and 390 px) with agent-browser into `.ai/specs/assets/quantity-field-tooltips/`. Ran `tests/ai-filenames`, `tests/spec-images` and `tests/design-tokens` through a temporary `node_modules` symlink to the main checkout. Its removal (`rm`) was denied by the harness, so it stays untracked in the worktree and is never staged.

## Changes

- `9d2a0539` docs(specs): add spec for quantity-field-tooltips (FR #290)
- `26a2c9e5` docs(specs): add UI mockups for quantity-field-tooltips

## Verification

- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts tests/design-tokens.test.ts` → 3 files, 54 tests passed.
- Spec-only change: no lint, typecheck or build impact; the full gate runs in CI.

## Follow-ups
