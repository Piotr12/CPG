# Fix #164: a second account's sign-in doesn't stick under `next dev`

**Date:** 2026-10-23 10:07 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 164`)
**Spec:** none
**Status:** done

## Goal

`tests/integration/stock-import-api.test.ts` fails in `beforeAll` against `next dev`: the normal user's sign-in never shows as signed in. Find the cause and make it pass under `next dev` (issue #164).

## Log

- 10:07 — Reproduced on a fresh `DATA_DIR` with `next dev -p 3164`: `wait --fn … [data-signed-in-as] …` times out after 25 s, 7 tests skipped. Dev log: `POST /login 200`, `GET /admin`, `GET /admin`, `GET /login`.
- Root cause: `signIn()` in `tests/integration/sign-in.ts` clicks submit and returns at once. The callers that go straight on to `openTokens()` call `browser.open("/admin")` while the sign-in server action is still in flight. The navigation cancels the action's response, which carries the `cpg_session` cookie, so the browser never stores it and `/admin` sends it back to `/login`. The production build answers fast enough to win the race; `next dev` doesn't. `import.test.ts` already worked around it ("signIn doesn't wait for the page it lands on"). Roughly 15 files call `signIn` then `openTokens` directly, so all of them were exposed.
- Fix: `signIn` waits until the submission has settled, either because the page has left `/login` (signed in) or because the form shows its `[role=alert]` (refused). That fixes every caller, not just this file.

- 10:12 — Side problem: a second dev server, with `DATA_DIR` under `.ai/cezar/tmp/`, went into a Fast Refresh reload loop (hundreds of `✓ Compiled`, `/login` reloading every second), so even the admin's login form never hydrated. With a `DATA_DIR` from `mktemp -d` there were no recompiles at all. The first server sat in the same place and didn't loop, so the cause is unconfirmed. Recorded as a lesson.
- 10:20 — Before/after on identical setups (fresh `next dev` on port 3164, fresh `DATA_DIR` outside the repo): with the fix, 7/7 pass. With `sign-in.ts` restored from `HEAD`, it fails with the same `[data-signed-in-as]` timeout as the issue.

## Changes

- `tests/integration/sign-in.ts`: `signIn` waits for `signInAnswered` (left `/login`, or `[role=alert]` shown) after submitting.
- `tests/integration/import.test.ts`: dropped the comment that worked around the old behaviour.
- `.ai/lessons.md`: replaced the 2026-10-21 "standalone, not `next dev`" lesson with the cause. Added the dev reload-loop lesson.

## Verification

- `CPG_BASE_URL=http://localhost:3164 … npm run test:integration -- tests/integration/stock-import-api.test.ts` against `next dev` on a fresh data dir: 7 passed. The same run without the fix: failed in `beforeAll`, 7 skipped.
- The same dev server, `api-users`, `users`, `import`, `transfers-api` (the refused path and the sign-in-then-open path): 4 files, 32 tests passed.
- `npm run lint`: 0 errors, 1 warning that was already there (`bom.service.ts` `lineError`). `npm run typecheck`: passed. `npm run test:coverage`: 100% on every metric, 485 files and 3314 tests passed. `npm run build`: passed.
- Not run locally: the full integration suite against the Docker image.
- PR #173 CI ([run 39938709060](https://github.com/Piotr12/CPG/actions/runs/39938709060)): lint, typecheck, unit-tests, build and integration-tests all passed, the integration suite with 54/54 files. The first integration attempt was cancelled at its 20-minute timeout in "Install Chrome for agent-browser": the runner's apt mirror stalled on `fonts-noto-cjk`, and no test ran. The rerun of that job passed.

## Follow-ups

- The reload loop under `next dev` has no confirmed cause (see lessons).
