# Fix the failed main deploy: `npm ci` ECONNRESET in the image build

**Date:** 2026-10-23 21:04 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar task 9817f174)
**Spec:** none
**Status:** done

## Goal
main's Deploy run for f6f3b979 (run 40021477550) failed. Find out why and fix it.

## Log
- 21:02 Every `ci / *` job passed (lint, typecheck, unit tests, build, all 4 integration shards). Only `deploy` failed: Kamal's image build stopped at `RUN npm ci --ignore-scripts` with `npm error code ECONNRESET` ("network read ECONNRESET") after 41 s.
- The earlier failed Deploy runs (2026-10-20/21) failed in integration tests, a different cause that has since been fixed. This is the first registry blip in the deploy build.
- Root cause: a transient connection reset from the npm registry. npm retries a request only 2 times by default (10 s to 60 s backoff), and every try failed. The next Deploy run (40023602401, f9bf05a3) ships the same code, so it recovers the deploy on its own if the network holds. The fix makes the build ride out the next blip.
- Fix: the Dockerfile's deps stage sets `NPM_CONFIG_FETCH_RETRIES=5`, `NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000` and `NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000`. These are set as `ENV` in the deps stage only, so the runtime image is unchanged. The CI jobs' own `npm ci` runs use setup-node's npm cache and were not affected, so they were left alone.
- Regression check `tests/dockerfile.test.ts` finds the stage that runs `npm ci` and asserts the three settings.

## Changes
- `Dockerfile` — npm fetch-retry settings in the deps stage.
- `tests/dockerfile.test.ts` — repo-wide check of those settings.
- `.ai/lessons.md` — lesson on telling a red deploy job apart from red checks.

## Verification
- `npx vitest run tests/dockerfile.test.ts`: 2 passed. With the Dockerfile change stashed: 2 failed ("the npm ci stage does not set NPM_CONFIG_FETCH_RETRIES"), so the test catches the regression.
- `npm config get …` with the three env vars set prints 5 / 20000 / 120000; without them it prints npm's defaults 2 / 10000 / 60000.
- Docker isn't running on this machine, so the image build wasn't run locally. CI's integration job builds the production Dockerfile on every PR.
- `npm run lint` (0 errors; one warning that was already there, in a file this change doesn't touch), `npm run typecheck` (clean), `npm run test:coverage`: 496 files / 3545 tests passed, 100% statements, branches, functions and lines.
- `npm run build` and the integration tests were not run locally: the change touches only the Dockerfile's install step and a repo-wide test. The PR's CI builds the image and runs the suite.

## Follow-ups
- None. If registry resets keep happening even with the retries, consider a pull-through npm mirror or a BuildKit cache that persists between runs.
