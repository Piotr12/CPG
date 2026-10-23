# Spec for issue #17 — named API tokens and bearer authentication

**Date:** 2026-10-19 10:53 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 17` → `om-auto-write-spec 17` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/implemented/2026-10-19--1053UTC-api-tokens.md` (written in this run)
**Status:** done (spec PR open)

## Goal

Write the spec for E01-S03 (#17) and open the design-only spec PR. Then `om-auto-fix-issue`'s feature route continues with `om-auto-implement-spec` on its own PR.

## Log

- 10:50 FR triage: an unbuilt feature. There is no token code, only the `require-api-user.ts` comment saying "Bearer tokens (E01-S03) authenticate here too". No PR references #17, nobody has claimed it, and there is no covering spec. `SDLC.md` has no Definition of Ready, so the ticket check is skipped. Classified as a feature from its `feature` label.
- 10:53 Claimed #17 (assignee, `in-progress`, claim comment). Branch `spec/api-tokens` from `origin/main` in the cezar worktree (reused, not nested).
- Context read: PRD §05/§06 (self-service named tokens, UI-only creation, list/revoke in UI and API, never expire, secret shown once, last use tracked, invalidated by reset or deactivation), API-001…012 and API-032, the merged specs that defer API parity to #17 (user management Q5, preferences Q9), `AuthService`, `UserService`, `apiHandler`, `requireApiUser` and the startup admin-session purge.
- Scope call: #21 (idempotency) depends on #17. Mutating parity routes for users and preferences therefore go to #21, so they are born with idempotency keys. This spec ships the token routes plus read-only `GET /api/users`, which gives API-010 a real admin-only endpoint.
- 10:58 Spec drafted with 11 Open Questions resolved by autonomous defaults; none is gated on a human.
- 11:00 Four static mockups rendered with agent-browser. Docker Desktop wasn't running, so the first test-env boot failed; started it, then booted the env and captured today's `/admin`. Test env stopped.
- 11:04 The fresh-context review returned "revise". It found two R06 gaps: a token created while a reset commits survives it, and an old container mints admin tokens during a deploy overlap. Both are folded in: a compare-and-set insert keyed on the actor's session row, with `create` typed on `SessionUser`; and an admin-password re-verification inside the create transaction, with the startup delete+store in one transaction. Also folded in:
  - a stronger minting repo test;
  - the `Idempotency-Key` requirement recorded in `BACKWARD_COMPATIBILITY.md` now;
  - read and write checks for API-011/012;
  - a last-used write that never fails a request;
  - fake timers instead of a clock binding;
  - `HEAD` in the cookie rule;
  - the secret helper moved into `services/auth/`.

## Changes

- `.ai/specs/implemented/2026-10-19--1053UTC-api-tokens.md` (new spec)
- `.ai/specs/assets/api-tokens/` (1 current screenshot, 4 mockups with their HTML)

## Verification

- `npx vitest run tests/ai-filenames.test.ts`: 4 passed (file naming).
- A docs-only change; the full gate is owed by the implementation PR.

## Follow-ups

- Implement through `om-auto-implement-spec` on a separate PR (`Closes #17`, `Refs` the spec PR).
- The implementation PR posts the deferred mutating parity routes (users, preferences) on #21.
