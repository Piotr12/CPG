# CI integration job cancelled when the browser install is slow (#167)

**Date:** 2026-10-23 10:08 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, cezar)
**Spec:** none (bug #167)
**Status:** done

## Goal

Stop a slow "Install Chrome for agent-browser" step from cancelling the integration suite (and with it `main`'s deploy) at the job's 20-minute limit, without skipping or weakening any test.

## Log

- 10:00 Triage: no PR or commit references #167; `ci.yml` still had one 20-minute limit for the whole job.
- 10:05 Root cause from the CI logs. The Chrome download is not the slow part (2 s, run 39922326590). `--with-deps` runs `apt-get install` for Chrome's libraries and fonts; on the runner image everything is already present except `fonts-noto-cjk` (61.2 MB) and `fonts-freefont-ttf`, fetched from `azure.archive.ubuntu.com`. In run 39916474362 that fetch stalled from 07:16:28 to 07:21:01, was ignored and retried (install 7 min 18 s); in run 39914046472 it never finished and the job was cancelled after 19 min in the install step.
- Decision: so caching the Chrome download (the issue's first suggestion) would not help. Took the issue's second option: the install gets its own `timeout-minutes: 10`, the suite its own `timeout-minutes: 20` (the most it ever had), and the job `35` = setup allowance 5 + 10 + 20. A slow install that finishes within 10 minutes still runs the whole suite; one that doesn't fails on the install step with GitHub's "has timed out" error.
- Kept `--with-deps` and its fonts: dropping them would change how text renders in the layout-measuring tests (sidebar fit, table overflow), which the issue rules out.
- Regression test `tests/ci-workflow.test.ts` parses `ci.yml` (added `yaml` 2.9.1, already in the lockfile as a transitive dependency, as a root devDependency). Two of its three tests fail against `origin/main`'s workflow.

## Changes

- `.github/workflows/ci.yml` — step and job limits on `integration-tests`.
- `tests/ci-workflow.test.ts` — new.
- `package.json`, `package-lock.json` — `yaml` devDependency.

## Verification

- `npx vitest run tests/ci-workflow.test.ts`: 3 passed; against `origin/main`'s `ci.yml`, 2 failed ("job limit 20 min < 5 + Infinity + Infinity min").
- `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (486 files, 3,317 tests, 100 %), `npm run build` 0.
- `npm audit`: the 10 known `braces` advisories only (engineering-standards.md); `yaml` adds none.
- No integration file touched; the PR's own CI run exercises the new limits.

## Follow-ups

- If slow installs keep costing minutes (not cancellations), consider caching the apt `.deb`s or pre-installing the two font packages elsewhere; dropping them would change text rendering in layout tests.
