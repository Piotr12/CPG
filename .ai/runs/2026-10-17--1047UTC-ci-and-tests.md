# CI for pull requests, unit tests with 100% coverage, browser integration tests

**Date:** 2026-10-17 10:47 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none (request from the human)
**Status:** done (PR opened for the human's review)

## Goal

A GitHub Actions workflow that runs on every pull request with build, lint, a TypeScript unit-test framework and an integration-test framework (Testcontainers + agent-browser driving an ephemeral app instance). `AGENTS.md` must require 100% unit-test coverage for every new feature, and the existing code must reach 100%.

## Plan

1. **Unit tests: Vitest** (TS/TSX out of the box, workspace projects, v8 coverage with thresholds). Root `vitest.config.mts`, two projects: `node` (core, db, root `tests/`) and `jsdom` (app, ui, React Testing Library). Coverage thresholds 100% for lines/branches/functions/statements over `packages/*/src/**` and `packages/*/scripts/**`.
2. Convert `tests/ai-filenames.test.mts` (node:test) to Vitest so `npm test` is one runner.
3. **Integration tests:** `vitest.integration.config.ts` + `integration/`. The global setup builds the production `Dockerfile` with Testcontainers, starts it with an empty `DATA_DIR`, waits for `/up` and hands the URL to the tests, which drive Chrome through the `agent-browser` CLI.
4. **CI:** `.github/workflows/ci.yml` on `pull_request` + `workflow_call`, with jobs for lint, typecheck, unit tests + coverage, build and integration. `deploy.yml` calls it instead of its own test job, so `main` is gated by the same checks.
5. `AGENTS.md` + engineering standards: the testing rules (100% coverage per change, no lowering thresholds or ignore comments without the human's approval, integration tests for user-visible flows), commands.
6. Write the unit tests for all existing code until coverage reaches 100%.
7. Verify: lint, typecheck, test, coverage, build, integration (local Docker), npm audit.

## Log

- 10:47 PostgreSQL conflict: the human asked for a "testcontainers PostgreSQL instance", but the app is SQLite-only (a non-negotiable stack decision in `AGENTS.md`). The human then confirmed: no PostgreSQL, ignore that part, but keep an ephemeral app instance tested with agent-browser. So Testcontainers runs the **app's own production image** (SQLite inside it, empty data dir per run).
- 10:50 Vitest 5 + @vitest/coverage-v8, jsdom, React Testing Library; Testcontainers 12, agent-browser 0.39 (dev dependencies at the root). Unit projects split by extension: `*.test.ts` → Node, `*.test.tsx` → jsdom.
- 10:52 Root Vitest config renamed to `.mts`: the root `package.json` has no `"type"`, so Vite loaded the `.ts` as CommonJS (warning).
- 10:53 **Bug found by the new tests:** `getMigrationStatus` ran `getExecuted()` and `getPending()` under `Promise.all`; on a never-migrated database both create `mikro_orm_migrations` and the second fails ("table already exists"). Made them sequential (`packages/db/src/orm.ts`), regression test in `orm.test.ts` and `system-status.service.test.ts`.
- 10:53 Two test mistakes fixed: cezar's `TMPDIR` is inside the repo (so a temp dir has a workspace above it), and MikroORM reconnects after `close()` (dropped the "ping fails when closed" test).
- 10:54 React DOM can't render async server components (it suspends and shows the fallback). The admin page test awaits them first (`resolveServerComponents`), then renders.
- 10:55 100% coverage reached (118 statements, 52 branches, 46 functions, 110 lines). Checked that the threshold works: an uncovered probe file made `vitest run --coverage` exit 1.
- 10:56 Integration: Testcontainers `withBuildkit()` failed with "archive/tar: invalid tar header", so it uses the classic builder, which builds the Dockerfile fine. agent-browser `eval` output is pretty-printed, so `--json eval` + `.data.result`.
- 10:58 CI workflow written; `deploy.yml` now calls it instead of running `npm test` on its own. Concurrency cancels superseded PR runs only (deploy-called runs are keyed by SHA).
- 11:00 Ran lint/typecheck/coverage/build in a `node:24` (Debian, glibc) container from a clean `npm ci` to check the macOS-generated lockfile installs on Linux: all passed.
- 11:01 The human asked for a PR to review in the GitHub UI rather than a push to `main`: branch `ci-and-tests`.

## Changes

- `.github/workflows/ci.yml` (new): lint, typecheck, unit tests + coverage, build, integration tests on every PR and as `workflow_call`. `deploy.yml` calls it.
- `vitest.config.mts` (unit, 100% thresholds), `vitest.integration.config.mts`, `tests/setup/dom.ts`, root `tsconfig.json` (typechecks `tests/` and the configs; `npm run typecheck` runs it first).
- `tests/integration/`: `global-setup.ts` (Testcontainers builds and starts the production image, waits for `/up`; `CPG_BASE_URL` skips it), `browser.ts` (agent-browser wrapper), `smoke.test.ts` (`/up`, home page, admin page on a fresh database).
- 21 unit test files next to the code in `packages/*/src` and `packages/core/scripts`. `tests/ai-filenames.test.mts` → `.ts` on Vitest.
- `packages/db/src/orm.ts`: sequential migration status (bug fix).
- `package.json`: `test` → `vitest run`, new `test:coverage`, `test:integration`; typecheck includes the root project. `eslint.config.mjs` and `.dockerignore` ignore `coverage/`.
- Docs: `AGENTS.md` (new "Testing — mandatory" section: 100% coverage per change, no lowering thresholds or ignore comments, integration tests per page/flow; CI; verification step), `.ai/docs/engineering-standards.md` (checklist, concept recipe step 8, structure, enforcement, adoption status), `README.md`, `.ai/lessons.md` (new Testing section, outdated `node --test` lesson replaced).

## Verification

- `npm run lint`: clean.
- `npm run typecheck`: root + all four packages clean.
- `npm run test:coverage`: 22 files, 66 tests passed; Statements 100% (118/118), Branches 100% (52/52), Functions 100% (46/46), Lines 100% (110/110). The same in a Linux `node:24` container after a clean `npm ci`.
- `npm run build`: compiled; `/`, `/admin` (partial prerender), `/up`. Standalone output contains no test tooling.
- `npm run test:integration` (local Docker 29.8): image built, container started, 3 tests passed (health check, home page, admin page showing "1 migrations applied / 0 pending / 0 settings" on the fresh database).
- `npm audit`: 10 high, unchanged: the known `braces` chain (awilix, eslint-config-next, shadcn). The new dependencies add none.
- Not verified here: the workflow on GitHub's runners (`agent-browser install --with-deps`, Docker there) — it runs on the PR.

## Follow-ups

- Make the CI jobs required status checks in the `main` branch protection rules (GitHub settings), so a red PR can't be merged.
- `gh` is not authenticated on this machine (`GITHUB_TOKEN` invalid), so the PR has to be opened from the pushed branch.
