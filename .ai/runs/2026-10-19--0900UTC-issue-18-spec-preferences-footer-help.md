# Spec for #18 — language and theme preferences, the exact footer and in-app help

**Date:** 2026-10-19 08:50 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar, `om-auto-fix-issue 18` → feature route → `om-auto-write-spec 18`
**Spec:** .ai/specs/implemented/2026-10-19--0855UTC-user-preferences-footer-help.md
**Status:** done

## Goal

Write the spec for issue #18 (E01-S04) and open a design-only spec PR. The implementation follows on its own PR via `om-auto-implement-spec`.

## Log

- 08:50 — FR triage passed. #18 is a feature with no lock and no open PR. #15 (sign-in) merged in #29. `SDLC.md` has no Definition of Ready. Nothing on `origin/main` implements preferences, the footer or help, and no spec covers them. Claimed #18.
- 08:55 — Drafted the spec under `om-spec-writing --autonomous` with 10 resolved assumptions and none needing human confirmation. Sources: the PRD (§05–§06), UX-001…UX-013, the brief (R11, D03–D05) and the Next.js 16 docs. `migrating-to-cache-components.md` and `preventing-flash-before-hydration.md` drove the theme design (Q6).
- 09:00 — A fresh-context review returned "revise" with 4 Medium and 6 Low findings and nothing Critical. All were applied: a server-rendered `lang` on localized wrappers, signed-in preferences on every page, sign-in surviving a failed preference read, `core` re-exporting the locale and theme types, text-free fallbacks, the phase order, the page-to-route rule, no stale reads after `refresh()`, `await connection()` in the root slot, and hardening for `THEME_SCRIPT`.
- 09:00 — Captured current screenshots (`/`, `/login`, `/admin`) from the test env, and rendered 3 static mockups with agent-browser.

## Changes

- The spec, its assets (`.ai/specs/assets/user-preferences-footer-help/`) and this log.

## Verification

- `vitest run tests/ai-filenames.test.ts`: 4 passed. Docs-only change; no code touched.

## Follow-ups

- Implementation: `om-auto-implement-spec` on the spec, with `Closes #18` on the implementation PR.
- Bearer API and audit for preference changes are owed by #17/#21 and #20 (spec Q9).
