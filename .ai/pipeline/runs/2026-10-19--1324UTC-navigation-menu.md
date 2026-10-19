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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Menu, account panel, homepage button

- [ ] 1.1 UI primitives
- [ ] 1.2 Entries and copy
- [ ] 1.3 Account panel and menu
- [ ] 1.4 Retire the per-page headers
- [ ] 1.5 Homepage
- [ ] 1.6 Integration
