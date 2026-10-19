# Execution plan: one role-based navigation menu on every page, and a homepage Sign in button

**Date:** 2026-10-19 13:24 UTC
**Agent:** Claude Code / claude-opus-5-5. cezar → `om-auto-fix-issue 43` → feature route → `om-auto-write-spec 43` (spec PR #45) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--1312UTC-navigation-menu.md (design on spec PR #45, a draft until Q1, Q3 and Q4 are confirmed; not committed on this branch)
Issue: #43

## Goal

Every page shows one menu with the screens the current account can open (Users for the admin only) and its account controls; it is usable on a 360 px phone through a sheet and inline from 768 px. The homepage gets a Sign in / Open CPG button and keeps the R11 footer in view.

## Scope

- `packages/ui`: `components/sheet.tsx`, `components/popover.tsx` (shadcn) and their tests.
- `packages/app`:
  - `components/layout/{nav-items.ts,nav-menu.tsx,account-panel.tsx,app-bar.tsx}`;
  - `components/auth/signed-in-bar.tsx` (deleted);
  - `app/page.tsx`, `app/admin/(global)/{page,users/page,tokens/page,audit/page}.tsx`, `app/admin/[tenant]/page.tsx`;
  - `components/audit/audit-view.tsx`, `components/api-tokens/labels.ts`, `components/users/labels.ts`;
  - i18n (en, pl) and help topics.
- Tests: unit tests next to every changed file; `tests/integration/navigation.test.ts`; updates to `sign-in.ts`, `auth.test.ts`, `preferences.test.ts` and `audit.test.ts`.

## Non-goals

- New pages or features; access rules (`requireUser()`/`requireAdmin()` stay the gates); the tenant strip; product brief Q03 beyond this menu.

## Risks

- Every page's header changes, so integration helpers that click the header must follow.
- The inline list must fit at 768 px in Polish with a 32-character username.
- Docker is unavailable to this macOS account, because Docker Desktop runs under another user. Integration tests run against a local `next start` through `CPG_BASE_URL`, and CI runs the Docker image build.

## Implementation Plan

The spec's Implementation Plan, steps 1–6, one Step each.

## Deviations from the spec

- `isCurrentPath` lives in its own dependency-free `current-path.ts`. `nav-items.ts` imports `@cpg/core`, and importing from it in the client menu broke the build.
- The account button's accessible name comes from an `aria-label` ("Account: *name*") rather than a visually hidden prefix (see lessons).
- The popover and the sheet are controlled and close on every path change, besides `SheetClose` on the sheet links. The bar keeps its state across navigations, and a popover left open covered the next page.
- `data-action="account-menu"` and `data-action="open-menu"` mark the two triggers for integration tests, like the existing `data-action="sign-out"`.
- `tests/integration/tenants.test.ts` now waits for hydration before clicking; the heavier bar made its early clicks get lost.
- `nav.menu` is "Menu" in both languages, so `messages.test.ts` lists it next to the product name as a deliberate copy.

## Verification

Docker isn't available to this macOS account (see lessons), so the integration suite ran against `next start` of this branch with `CPG_BASE_URL`. Two full runs on a fresh database each: 71 passed, 1 skipped (`startup-guard` needs the Docker image). Lint, typecheck, `test:coverage` (756 tests, 100%) and `build` are green.

## Review

A fresh-context `om-auto-review-pr` pass approved the PR, with no Critical or High findings. One autofix round (742c3a4):
- the admin's bar is checked at 768 px in Polish;
- a visible-strip assertion in `tenants.test.ts`;
- a modal account popover;
- the shadcn-on-public-pages exception in the standards;
- the Polish "Zaloguj się";
- help copy.

Accepted, not changed: the overlays don't close when the window crosses `md`.

After the round: lint, typecheck, `test:coverage` (756 tests), build and integration (72 passed, 1 skipped) are green. CI was green on ebcbc3d.

## Follow-ups

- Confirm Q1, Q3 and Q4 on spec PR #45. That gates both drafts.
- Once #45 merges, move the spec to `.ai/specs/implemented/`. It isn't on `main` yet, so this branch can't move it.

## Progress

PR: #46

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Menu, account panel, homepage button

- [x] 1.1 UI primitives — 510a0b1
- [x] 1.2 Entries and copy — 34120f8
- [x] 1.3 Account panel and menu — 34120f8, 19ead93, 93272ec
- [x] 1.4 Retire the per-page headers — 34120f8
- [x] 1.5 Homepage — 1df199c
- [x] 1.6 Integration — 365750b
