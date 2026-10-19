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

PR: #34

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Accounts and sign-in

- [x] 1.1 Errors and authorization helpers — 29dfd8d
- [x] 1.2 Password hashing — d04982d
- [x] 1.3 Schema — 973e0cf
- [x] 1.4 UserService — 5226b62
- [x] 1.5 Sign-in for normal users — efea17a
- [x] 1.6 Gates and /admin — db987a0

### Phase 2: The users screen

- [x] 2.1 Shared UI layers — fa778d6
- [x] 2.2 Actions — eafde57
- [x] 2.3 Page and components — c8e4f6b
- [x] 2.4 Integration tests and full gate — ff70e99

## Notes

- **The throttle got one addition the spec didn't name: `MAX_FAILURES_PER_IP = 50`.** Keying buckets by the submitted name (the spec's enumeration fix) removed the old shared unknown-name bucket, which had capped one IP at 5 guesses across unknown names. The IP-wide cap restores a bound on name spraying without telling an existing account from an unknown one.
- **Race test.** It hooks the service's `em.transactional` so the reset or deactivation commits just before the session transaction opens. Reverting the compare-and-set makes both race tests fail, which is checked.
- **Lockfile.** `npm install --package-lock-only` added unrelated wasm bundle entries. Only the `engines` hunk was kept, and `npm ci --dry-run` passes.

- **React 19 transitions.** State set after an `await` inside `startTransition` leaves the transition, so an error could render while the button still said "Saving…". This showed up as a flaky unit test under the full parallel run. `CrudForm` and `SetActiveDialog` now wrap the post-await updates in `startTransition`; five consecutive full runs passed.
- **Username conflicts.** "That username is taken." is a form-level alert, not a field error: `ConflictError` carries no field. The mockup's under-the-field placement is illustrative only.
- **Help for `/admin/users`.** While the PR was open, #18 merged and the PR started conflicting. The review loop merged `main` (`b48338c`):
  - registrations kept from both sides;
  - `/admin` rebuilt on #18's translated page;
  - the users migration regenerated on top of `user_preferences` (now `Migration20261019094413`) rather than merging the snapshot.

  Then `614e894` brought the users screen up to #18's conventions: en/pl messages, translated schema and server errors, a "Managing users" help topic (required by `tests/every-page-has-help.test.ts`) and an updated Cave control topic. Follow-up #37 is therefore done in this PR.
- **Integration helper fix.** `wait --fn` must return a boolean: a DOM element fails with "Object reference chain is too long". Fixed in my test, and in `restoreDefaultPreferences` from #18.

- **Review autofix** (`om-auto-review-pr --autofix`; a fresh-context review asked for changes: 1 major, 2 minor, 3 nits):
  - `errorMessage()` now takes an errors map, and the users screen merges its own `CONFLICT`/`NOT_FOUND`/`FORBIDDEN` over the shared errors (`usersLabels`); the duplicate translator is gone.
  - Requests with no client address (`UNKNOWN_CLIENT`, now exported by core) get no IP-wide bucket.
  - `recordSuccess` runs only after the session exists.
  - The unused `LoadingMessage` is dropped.
  - The confirm dialog's mode is fixed when it opens.
  - Declined: moving `requestScope()` inside the action wrapper, which would diverge from the existing actions' pattern.
- **Spec deviation:** the per-IP cap (`MAX_FAILURES_PER_IP = 50`) isn't in the spec; it was added with the name-keyed buckets, see the throttle note above. Noted on spec PR #33.

## Verification

- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm run test:coverage`: 297 tests, 100% statements, branches, functions and lines.
- `npm run build`: OK; `/admin/users` is partially prerendered.
- `npm run test:integration`: 5 files, 22 tests passed, including the new `users.test.ts` (TEN-004…009 flows).
- After merging `main` (#18): lint and typecheck clean; 415 unit tests at 100%; build OK; `test:integration` 8 files, 36 tests passed.
- After the review fixes: lint and typecheck clean; 417 unit tests at 100%; build OK; `test:integration` 8 files, 36 tests passed.
- `npm audit`: only the known `braces` advisories (10 high); no dependency changes.
