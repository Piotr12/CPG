# Spec for issue #43 — role-based navigation menu and a homepage Sign in button

**Date:** 2026-10-19 13:12 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 43` → `om-auto-write-spec 43` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/2026-10-19--1312UTC-navigation-menu.md` (written in this run)
**Status:** done (spec PR open, draft)

## Goal

Write the spec for #43 and open the design-only spec PR. Then `om-auto-fix-issue`'s feature route continues with `om-auto-implement-spec` on its own PR.

## Log

- 13:11 FR triage: an unbuilt feature (`feature` label). `/` has no sign-in link, and there is no menu, `nav-items` or `Sheet` in the code. No PR references #43, nobody had claimed it, and there is no covering spec. `SDLC.md` has no Definition of Ready, so the ticket check is skipped. The issue's prerequisites (#41, #42) are merged.
- 13:11 Claimed #43 (assignee, `in-progress`, claim comment). Branch `spec/navigation-menu` from `origin/main` in the cezar worktree (reused, not nested).
- Context read: `AppBar`, `SignedInBar`, `PreferencesControls`, the root layout, every `/admin` page, `/help`, `/login`, `require-admin.ts`, the `nav`/`admin`/`home` messages, the help topics, the repo-wide page tests and the integration helpers that click the header.
- 13:15 Spec drafted with 8 Open Questions resolved by autonomous defaults. Q1 (top bar) and Q3 (Open CPG, no redirect) repeat the issue author's own assumptions, which the issue marks as needing human confirmation, so both carry ⚠.
- 13:20 Docker is unavailable to this macOS account: Docker Desktop runs under another user (`piotrekhl`), and `~/.docker/run/docker.sock` doesn't exist. `test-env-up.sh` failed. Instead, built `main` and ran `next start` on port 3311 with a temp `DATA_DIR`, then captured three current screenshots with agent-browser. Rendered three static mockups.
- 13:20 The fresh-context review returned "revise". Folded in:
  - Q4 also gets ⚠: the account popover is one click more than "without extra clicks".
  - An account button truncated and labelled "Account: *name*", checked at 768 px in Polish with a 32-character username.
  - `<header>` root and labelled navs.
  - `SheetClose asChild` on the sheet links instead of a path effect.
  - The shadcn-on-public-pages exception stated, and the CTA as a plain-Tailwind link.
  - `HomeContent` reads `currentUser()`.
  - Tenant labels from `TENANT_NAMES`.
  - `lang` on portaled content.
  - Fuller help-copy changes.
  - An idempotent popover helper, and measurable footer, dark and Polish checks in the integration plan.

## Changes

- `.ai/specs/2026-10-19--1312UTC-navigation-menu.md` (new spec)
- `.ai/specs/assets/navigation-menu/` (3 current screenshots, 3 mockups with their HTML)

## Verification

- `npx vitest run tests/ai-filenames.test.ts` (file naming), see the PR.
- A docs-only change; the full gate is owed by the implementation PR.

## Follow-ups

- Confirm Q1, Q3 and Q4 on the spec PR (they keep it a draft).
- Implement through `om-auto-implement-spec` on a separate PR (`Closes #43`, `Refs` the spec PR).
