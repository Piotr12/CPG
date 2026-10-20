# Execution plan — audit tokens ended by a password reset or a deactivation

**Date:** 2026-10-20 05:36 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 44` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** .ai/specs/implemented/2026-10-20--0532UTC-audit-implicit-token-revocations.md (spec PR #61)
**Issue:** #44

## Goal

A password reset or a deactivation writes one `tokens.api-token.revoked` Global audit entry per API token it deletes. Each entry is attributed to the acting admin and committed in the same transaction. The startup purge of the admin's tokens is documented as unaudited (spec Q1).

## Scope

- `packages/core/src/services/api-tokens/api-token-audit.ts` (new): the token entry builders, shared by both services.
- `packages/core/src/services/api-tokens/api-token.service.ts`: switch to the builders.
- `packages/core/src/services/users/user.service.ts`: read the tokens, delete them, record the entries.
- `packages/core/src/database.ts`: doc comment.
- `packages/app/src/help/topics.ts` and its test: one sentence in the Global audit topic (en, pl).
- `tests/integration/api-tokens.test.ts`: assert the entries after the reset and the deactivation.

## Non-goals

- A `system` audit actor or channel (spec Follow-ups).
- Auditing session deletions.
- Moving the spec to `implemented/`. The spec lands on base through spec PR #61, so it moves in a follow-up once #61 is merged.

## Risks

- A same-millisecond ordering of audit entries is random (lessons). Tests assert the entries without depending on their order.
- The integration suite shares one database across files. Assertions are scoped to this file's tokens and users.

## Implementation Plan

### Phase 1: audit the tokens a reset or deactivation ends

1. Extract `tokenCreatedEntry` / `tokenRevokedEntry` into `api-token-audit.ts`, with unit tests.
2. Record one revoked entry per token in `UserService.changeNormalUser`, with unit tests.
3. Document the startup purge as unaudited: the doc comment and the help topic (en, pl), with the help test.
4. Extend the integration test for reset and deactivation.

## Progress

PR: #62

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: audit the tokens a reset or deactivation ends

- [x] 1.1 Extract the token audit entry builders — 230d93c
- [x] 1.2 Record revoked entries on reset and deactivation — ce46682
- [x] 1.3 Document the startup purge as unaudited — 8245f31
- [x] 1.4 Integration test for the entries — 45e5c7f

## Log

- 05:36 UTC: the slot is free and the branch is `feat/audit-implicit-token-revocations`. 4 Steps, plain engine.
- 05:45 UTC: Steps 1.1–1.4 landed. The new unit tests fail without the `UserService` change (2 failures with it reverted) and pass with it. Lint, typecheck, `test:coverage` (213 files, 1379 tests, 100% thresholds) and the build are green.
- 05:50 UTC: the draft PR #62 is open, with labels. The full integration suite passed on 45e5c7f (20 files, 145 tests).
- 06:00 UTC: the review (`om-auto-review-pr --autofix`, an independent reviewer) found no blockers or majors. I applied the fixes in 1d422fc: Polish copy, the test token name `tokens-auditor`, rewrapped doc comments, and `disableIdentityMap` on the token read. The `occurredAt` minor was a false alarm, because that describe fakes `Date`.
- 06:10 UTC: with `disableIdentityMap`, one full integration run failed: the reset deleted the tokens but recorded no revoked entry. The isolated file and a second full run passed. I reverted to the plain transactional read in 809f2c3, and two more full runs passed (145/145 each). This is recorded as a lesson.
- Final gate on 809f2c3: lint ✅, typecheck ✅, test:coverage ✅ (1379 tests, 100%, run on 1d422fc, which differs only by that option), build ✅, test:integration ✅ ×2.
- Follow-up: once spec PR #61 merges, `git mv` the spec to `.ai/specs/implemented/`. It isn't on base yet.
