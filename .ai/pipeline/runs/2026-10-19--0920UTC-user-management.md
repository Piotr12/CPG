# Execution plan: the admin manages normal users

**Date:** 2026-10-19 09:20 UTC
**Agent:** Claude Code / claude-opus-5-5. cezar → `om-auto-fix-issue 16` → feature route → `om-auto-write-spec 16` (spec PR #33) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--0912UTC-user-management.md (design on spec PR #33, not yet on `main`)
Issue: #16

## Goal

The admin creates normal users with an initial password, resets their passwords, and deactivates or reactivates them at `/admin/users`. Normal users sign in and reach `/admin` without admin rights. A reset or deactivation ends all of that user's sessions at once, and users are never deleted.

## Scope

- `packages/db`: `entities/auth/user.entity.ts` (`passwordHash`, `active`), plus one migration with its snapshot and index.
- `packages/core`:
  - `http/{errors,auth}.ts`;
  - `services/auth/{password-hash,auth.service,login-throttle}.ts`;
  - `services/users/user.service.ts`;
  - `validators/users/*`;
  - `config.ts` (the argon2 runtime check);
  - container, cradle and index.
- `packages/ui`: shadcn `table`, `dialog`, `alert-dialog` and `dropdown-menu`; `backend/{tables,forms,feedback}`.
- `packages/app`:
  - `auth/require-admin.ts` (`requireUser`);
  - `app/admin/page.tsx`, `app/login/page.tsx`;
  - `app/admin/users/{page,actions}`;
  - `components/users/*`.
- Tests: unit tests next to every file; `tests/admin-pages-require-admin.test.ts`; `tests/integration/users.test.ts`.
- Root `package.json` `engines.node`; `.ai/docs/engineering-standards.md` (`requireUser`, the shared UI layers, and the names that changed).

**Non-goals:**
- the bearer API for user management (#17);
- audit (#20);
- tokens (#17);
- moving `User` out of `auth/`;
- pagination or sorting in `DataTable`;
- help and translations: #18 is not on `main`, so a follow-up issue is filed instead.

## Risks

- **Parallel branches.** #18 (PR #32) and #19 also add migrations and append to the container, cradle, index and entity lists. Whichever lands later regenerates its migration on the new `main`.
- **The spec isn't on `main` yet.** It sits on spec PR #33 and is read from there; this branch doesn't commit it.
- **`crypto.argon2`.** It needs Node 24.7 or later; `assertServerConfig` refuses to start on older runtimes.

## Implementation Plan

Follows the spec's Implementation Plan, Steps 1–10, unchanged.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Accounts and sign-in

- [ ] 1.1 Errors and authorization helpers
- [ ] 1.2 Password hashing
- [ ] 1.3 Schema
- [ ] 1.4 UserService
- [ ] 1.5 Sign-in for normal users
- [ ] 1.6 Gates and /admin

### Phase 2: The users screen

- [ ] 2.1 Shared UI layers
- [ ] 2.2 Actions
- [ ] 2.3 Page and components
- [ ] 2.4 Integration tests and full gate

## Notes

## Verification
