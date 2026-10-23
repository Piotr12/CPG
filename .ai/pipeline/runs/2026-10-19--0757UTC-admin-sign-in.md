# Execution plan: admin sign-in and the startup password guard

**Date:** 2026-10-19 07:57 UTC
**Agent:** Claude Code / claude-opus-5-5. `om-auto-fix-issue 15` → feature route → `om-auto-implement-spec 28` → `om-auto-create-pr`
Source doc: .ai/specs/implemented/2026-10-19--0746UTC-admin-sign-in.md (design on spec PR #28)
Issue: #15

## Goal

CPG refuses to start without a valid `CPG_ADMIN_PASSWORD`. The built-in admin signs in at `/login` and gets a server-side session; every `/admin` page requires it, as the spec describes.

## Scope

- `packages/core`:
  - `config.ts` (`adminPassword`, `assertServerConfig`);
  - `database.ts` (`revokeBuiltInAdminSessions`);
  - `http/{errors,result,server-action}.ts`;
  - `validators/auth/sign-in.schema.ts`;
  - `services/auth/{auth.service,login-throttle}.ts`;
  - container, cradle and index; the `zod` dependency and the `./validators/*` export.
- `packages/db`: `entities/auth/{user,session}.entity.ts`, `entities/index.ts`, and one migration with its snapshot and index.
- `packages/app`:
  - `instrumentation.ts`;
  - `src/auth/{session-cookie,require-admin}.ts`;
  - `src/app/login/{page.tsx,actions.ts}` and the login form component;
  - `src/app/admin/page.tsx` plus its sign-out control.
- Tests: unit tests next to every file; `tests/admin-pages-require-admin.test.ts`; `tests/integration/{auth,startup-guard}.test.ts`; updates to `smoke.test.ts` and `global-setup.ts`.
- Ops and docs: `config/deploy.yml`, `.kamal/secrets`, `.github/workflows/deploy.yml`, README development notes, `.ai/docs/engineering-standards.md`.

**Non-goals** (from the spec): normal users and password hashing (#16), API tokens (#17), language, theme and footer (#18), tenants (#19), audit (#20), and a `proxy.ts` redirect layer.

## Risks

- **Docker.** It was not running when the run started; I launched Docker Desktop for the integration tests. If it can't run them, CI runs them on the PR, and the summary says so.
- **Deploy prerequisite.** The `CPG_ADMIN_PASSWORD` GitHub Actions secret must exist before this PR merges, or the deploy fails safely (the old container keeps serving).
- **CI.** CI's integration job needs the test password. It's set in the harness (`global-setup.ts`), not as a CI secret.

## Implementation Plan

Follows the spec's Implementation Plan, Steps 1–9, unchanged.

### Phase 1: Startup guard

1. Config: `adminPassword`, `assertServerConfig` and their tests.
2. Guard in `register()`; the test password in the integration harness; an integration test that the container exits without it.
3. Deploy and dev plumbing.

### Phase 2: Sign-in

4. The shared HTTP layer, `zod` and the sign-in schema.
5. The `User` and `Session` entities and the migration.
6. `LoginThrottle`, `AuthService` and the startup purge, with DI registration.
7. App auth helpers, the purge call in `register()`, and the standards update.
8. The `/login` page, actions and form; `/admin` gated; the repo-wide gate test.
9. Integration tests and the full gate.

## Progress

PR: #29

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Startup guard

- [x] 1.1 Config adminPassword and assertServerConfig — 61b21ce
- [x] 1.2 Startup guard in register and integration harness — b42df95
- [x] 1.3 Deploy and dev plumbing — ff7f7dc

### Phase 2: Sign-in

- [x] 2.1 Shared HTTP layer and sign-in schema — e2bc3d6
- [x] 2.2 User and Session entities and migration — 7461152
- [x] 2.3 LoginThrottle, AuthService and startup purge — 0c69dbb
- [x] 2.4 App auth helpers and standards update — 9145ece
- [x] 2.5 Login page, actions and gated admin — 10d43d4
- [x] 2.6 Integration tests and full gate — b8e954e

## Notes

- 1.2 deviation from the spec: in the standalone server (`node server.js`, the Docker image), a throwing `register()` doesn't exit. Next.js logs "Failed to prepare server" and answers every request with a 500 (verified with `docker run` and no password). The spec's claim, taken from `next start`'s `start-server.js`, doesn't hold for standalone. So `register()` logs the guard's message and calls `process.exit(1)` itself. `tests/integration/startup-guard.test.ts` proves the container exits non-zero.
- 1.3 also updates `.ai/scripts/test-env-up.sh` (QA env): it passes a test admin password and records it as the admin credential, because otherwise the QA container wouldn't start.
- 2.2: the generated migration's `down()` dropped `user` before `session`. I swapped the order before the migration was ever pushed, because `session` references `user`.
- 2.3: the built-in admin row is created with `em.upsert(… onConflictAction: "ignore")` on the unique username. A test runs two first sign-ins at once and checks that only one admin row results.
- 2.5: adds the shadcn `input` and `label` components (`npx shadcn@latest add`). The `resolveServerComponents` test helper moved from `admin/page.test.tsx` to `tests/setup/server-components.ts` so the login page test can reuse it.
- Pitfall: `beforeEach(() => mock.mockResolvedValue(x))` returns the mock, and Vitest runs a function returned from a hook as teardown. Recorded in `.ai/lessons.md`.

- Review (`om-auto-review-pr`, independent reviewer): request changes, with 1 major, 4 minors and 2 nits. All were fixed in e177a59 and 11ea5c3.
  - Major: `/login` opened SQLite during the build. `currentUser()` now reads the cookie first, and the redirect awaits `connection()`. Verified: a build with an empty `DATA_DIR` creates no database, and one with an unusable `DATA_DIR` keeps `/login` postponed.
  - Minors and nits:
    - `signOut` moved to `admin/actions.ts`;
    - the throttle caps its map at 10,000 buckets and prunes once a minute;
    - startup rejects a padded password;
    - over-long credentials get the generic message;
    - the cookie uses `maxAge`;
    - `BACKWARD_COMPATIBILITY.md` and `CODE_REVIEW.md` are updated.
- Re-review: every earlier finding was fixed, but there was one new major. The size cap could evict a blocked `account:admin` bucket under a many-IP flood. Fixed in 0e3b015: eviction drops only client buckets, unblocked ones first, and never the bucket just counted. Regression tests added.

## Verification

- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 42 files, 182 tests, 100% coverage (after the re-review fix).
- `npm run build`: pass (`/admin` and `/login` partially prerendered).
- `npm run test:integration` (Docker): 4 files and 15 tests pass. One run first failed with an agent-browser daemon error (`os error 35`) in unrelated tests and passed when rerun unchanged:
  - startup guard: the container exits without `CPG_ADMIN_PASSWORD`;
  - sign-in: redirect from `/admin`, generic error, `HttpOnly`, `Secure` and `Lax` cookie, `/login` → `/admin` once signed in, sign-out, throttling;
  - smoke test, signed in.
- `npm audit`: only the known `braces` → `fast-glob`/`micromatch` chain listed in the engineering standards; `zod` adds nothing.
