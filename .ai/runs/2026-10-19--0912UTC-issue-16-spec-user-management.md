# Spec for issue #16 — the admin manages normal users

**Date:** 2026-10-19 09:12 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 16` → `om-auto-write-spec 16` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/implemented/2026-10-19--0912UTC-user-management.md` (written in this run)
**Status:** done (spec PR #33 open)

## Goal

Write the spec for E01-S02 (#16) and open the design-only spec PR. The issue says "A spec is still owed before implementation". The human asked for #16 to run in parallel with #18 (PR #31/#32) and #19 (in progress), so the spec has to keep the overlap with those branches small.

## Log

- 09:05 Dependency check over the open stories: only #16 has every dependency merged (#15). #17, #20 and everything after them wait on #16.
- 09:10 FR triage: no user management in the code (`User` has only `username`/`role`, `AuthService` signs in the built-in admin only). No PR references #16 (the `#16` search hit on PR #31 is the text "Next.js 16"). `SDLC.md` has no Definition of Ready section, so the ticket-level check is skipped. Claimed #16.
- 09:12 Branch `spec/user-management` from `origin/main` in the cezar worktree (reused, not nested).
- Context: PRD §05 (one admin, admin creates/resets/deactivates users, never deletes them, a reset or deactivation ends sessions and tokens), the TEN-003…009, API-011/012, AUD-015/028 scenarios, the admin sign-in spec, `AuthService`, `LoginThrottle`, `requireAdmin`, and the engineering standards (argon2id or bcrypt; CrudForm/DataTable built with their first user).
- Finding: Node 24 (the Dockerfile's `node:24-alpine`) ships `crypto.argon2()`. argon2id at the standards' minimum takes about 24 ms here, so no dependency is needed.
- Overlap decision: `User` stays in `db/src/entities/auth/`. Moving it to a `users` folder would conflict with #18's `user-preference` entity, which imports it.

- 09:15 Spec drafted with all 8 Open Questions resolved by autonomous defaults; none is gated on a human.
- 09:16 Test env booted (Docker, port 3210); current `/admin` captured; 4 static mockups rendered with agent-browser. Test env stopped.
- 09:17 The fresh-context review returned "revise": throttle-based username enumeration (High), a reset/sign-in race, the `admin` name only reserved by a row that may not exist yet, an ungeneratable `updatedAt` backfill, and a weaker gate test. All folded in: name-keyed throttle buckets, a compare-and-set session insert, `admin` reserved in the service, `updatedAt` dropped with an `active` database default, and an explicit admin-only page list. `crypto.argon2` stability checked (no marker, so Stable; no warning) and `engines.node >=24.7` added.
- 09:20 Opened spec PR #33 (ready, labels review/documentation/skip-qa/priority-medium/risk-low), with the evidence comment and the assumptions comment on the PR and on #16.
- Hit a zsh pitfall: the descriptor's evidence loop assigns `path=`, which wipes `PATH` under zsh. Re-ran it under bash and recorded the lesson.

## Changes

- `.ai/specs/implemented/2026-10-19--0912UTC-user-management.md` (new spec)
- `.ai/specs/assets/user-management/` (1 current screenshot, 4 mockups with their HTML)
- `.ai/lessons.md` (zsh `path` lesson)

## Verification

- `npx vitest run tests/ai-filenames.test.ts`: 4 passed (file naming).
- A docs-only change; the full gate is owed by the implementation PR.

## Follow-ups

- Implement through `om-auto-implement-spec` on a separate PR (`Closes #16`, `Refs #33`).
- #17's spec must include the bearer API equivalents of the user-management actions (Q5).
