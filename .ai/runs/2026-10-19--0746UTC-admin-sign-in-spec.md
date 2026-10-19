# Spec for admin sign-in and the startup password guard (#15)

**Date:** 2026-10-19 07:46 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue` → `om-auto-write-spec` → `om-spec-writing --autonomous`)
**Spec:** `.ai/specs/2026-10-19--0746UTC-admin-sign-in.md`
**Status:** done

## Goal

Turn issue #15 (E01-S01: the admin signs in with the environment password; CPG refuses to start without it) into an implementable spec on a design-only PR. This is the first story of the product-brief backlog, and the authentication spec the engineering standards require before anything sensitive goes into `/admin`.

## Log

- 07:46 — Claimed #15. Spec worktree on `spec/admin-sign-in` from `origin/main`.
- Read the issue, the product brief (R06, N05, D03, D04, Q03), PRD §05, `AGENTS.md`, the engineering standards (security minimums, layering, reusable layers), `.ai/lessons.md`, the current `core`/`app` code, and the Next.js 16 auth, cookies and instrumentation docs.
- Resolved 8 open questions with autonomous defaults; none needs human confirmation (see the spec's table). The main one is server-side sessions with hashed tokens, because R06 requires immediate revocation.
- A fresh-context architectural review returned "revise". Applied:
  - redirects stay outside the core server-action wrapper (layering);
  - the startup purge uses a short-lived ORM, not the shared container (lesson on one ORM per bundle);
  - an account-wide throttle cap, pruning, and pinning kamal-proxy `forward_headers: false`;
  - startup refusal confirmed from Next.js source (`process.exit(1)`), so the Dockerfile fallback was dropped;
  - a repo-wide `requireAdmin` check for admin pages;
  - the tests that will break are listed;
  - the deploy secret is needed before the Phase 1 merge;
  - `auth` declared cross-cutting; `isActive` dropped (YAGNI).
- Recorded the deploy-overlap rotation window as a known limitation instead of storing a password-derived verifier, which the standards don't allow outside argon2id/bcrypt.

## Changes

- `.ai/specs/2026-10-19--0746UTC-admin-sign-in.md` (new)
- this run log

## Verification

- Spec-only change: no code. `npx vitest run tests/ai-filenames.test.ts` checks the file names.

## Follow-ups

- Operator: create the `CPG_ADMIN_PASSWORD` GitHub Actions secret before the implementation's Phase 1 merges.
- After merge: close brief Q03 in `.ai/specs/product-brief.md` (resolved by the spec's Q5).
