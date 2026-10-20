# Fix #38: the build logs a spurious "Route handler failed" while prerendering API routes

**Date:** 2026-10-20 05:32 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 38`, dispatched by cezar
**Spec:** none (bug)
**Status:** done

## Goal

`npm run build` shouldn't log "Route handler failed" for request-time API routes (issue #38).

## Log

- 05:20 Concurrency check: no assignee, no `in-progress` label, no open PR referencing #38. Labelled `bug`, so this is the bug route.
- 05:25 Triage (`om-verify-in-repo`): reproduced on `main` at 3e46bf8. The baseline `npm run build` logged "Route handler failed: Error: Route /api/{audit,tenants,tokens} needs to bail out of prerendering at this point because it used request.headers." 6 times. It still exits 0. No fix found in the PR search or in `git log origin/main --grep '#38'`.
- 05:30 Root cause (`om-root-cause`): `core/src/http/api-handler.ts` catches everything the handler throws, logs whatever isn't an `AppError` and answers 500. Under Cache Components, Next.js prerenders `GET` handlers at build time and stops them by throwing a control-flow error (`NEXT_PRERENDER_INTERRUPTED` on `request.headers`, `HANGING_PROMISE_REJECTION` on `cookies()`). The wrapper swallowed and logged it. The same catch would also turn a `redirect()`/`notFound()` in a route into a logged 500.
  - The fix calls `unstable_rethrow` first in the catch. `core` must not import `next`, so `core` exports `createApiHandler(rethrow)` instead of `apiHandler`, and `app/src/routing/api-handler.ts` builds `apiHandler` with `unstable_rethrow`.
  - Removing the core export means no route can pick up the unwired version by mistake.
  - Rejected `await connection()`, the issue's other suggestion: it also stops the prerender by rejecting, so the wrapper would still log it.
- 05:32 Claimed #38 (assignee, `in-progress`, claim comment).
- 05:40 Implemented. The new regression test fails 4/6 with a no-op `rethrow` and passes with `unstable_rethrow`.

## Changes

- `packages/core/src/http/api-handler.ts`: `createApiHandler(rethrow)` replaces `apiHandler`; the `Rethrow` type.
- `packages/app/src/routing/api-handler.ts` (new): `apiHandler = createApiHandler(unstable_rethrow)`, with its test.
- The 15 `route.ts` files and `auth/api-write.ts` import `apiHandler` from `routing/api-handler`.
- Route tests and `tests/setup/api-write.ts`: mocks pass `createApiHandler` through, and the stand-ins use the app wrapper.
- `.ai/docs/engineering-standards.md`, `.ai/lessons.md`.

## Verification

- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: 213 files, 1376 tests passed; the 100% thresholds hold.
- `npm run build`: exit 0, with 0 "Route handler failed" lines (6 before the fix). Every `/api` route is still dynamic (`ƒ`).
- `npm run test:integration` (Docker): 20 files, 145 tests passed.
- Regression proof: with a no-op `rethrow`, `routing/api-handler.test.ts` fails 4 of 6 tests.

## Follow-ups

- None. `serverAction` has the same catch-all, but server actions are never prerendered, and redirects stay with the caller by design.
