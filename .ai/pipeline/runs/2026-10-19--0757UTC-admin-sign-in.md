# Execution plan: admin sign-in and the startup password guard

**Date:** 2026-10-19 07:57 UTC
**Agent:** Claude Code / claude-opus-5-5. `om-auto-fix-issue 15` → feature route → `om-auto-implement-spec 28` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--0746UTC-admin-sign-in.md (design on spec PR #28)
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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Startup guard

- [x] 1.1 Config adminPassword and assertServerConfig — 61b21ce
- [x] 1.2 Startup guard in register and integration harness — b42df95
- [x] 1.3 Deploy and dev plumbing — ff7f7dc

### Phase 2: Sign-in

- [ ] 2.1 Shared HTTP layer and sign-in schema
- [ ] 2.2 User and Session entities and migration
- [ ] 2.3 LoginThrottle, AuthService and startup purge
- [ ] 2.4 App auth helpers and standards update
- [ ] 2.5 Login page, actions and gated admin
- [ ] 2.6 Integration tests and full gate

## Notes

- 1.2 deviation from the spec: in the standalone server (`node server.js`, the Docker image), a throwing `register()` doesn't exit. Next.js logs "Failed to prepare server" and answers every request with a 500 (verified with `docker run` and no password). The spec's claim, taken from `next start`'s `start-server.js`, doesn't hold for standalone. So `register()` logs the guard's message and calls `process.exit(1)` itself. `tests/integration/startup-guard.test.ts` proves the container exits non-zero.
- 1.3 also updates `.ai/scripts/test-env-up.sh` (QA env): it passes a test admin password and records it as the admin credential, because otherwise the QA container wouldn't start.
