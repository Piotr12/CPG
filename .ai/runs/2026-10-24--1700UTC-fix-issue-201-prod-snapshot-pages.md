# Fix #201 — the Test-reset Prod snapshot reads every page of each paged list

**Date:** 2026-10-24 17:00 UTC
**Agent:** cezar → Claude Code (Claude Fable 5.1), `/om-auto-fix-issue 201`
**Spec:** none (follow-up from #197; the atomic reset spec `.ai/specs/implemented/2026-10-20--1636UTC-atomic-test-reset.md` is already implemented)
**Status:** in progress

## Goal

`tests/integration/test-reset-api.test.ts` proves a Test reset leaves Prod alone by snapshotting every Prod list before and after (`prodState()`). Each list is read without `?page=`, so a paged list is compared through its first 100 records only. Make the snapshot read every page of each paged list, keep the unpaged lists on one read, and prove the test still passes after a file that grows a Prod list past 100 records (`purchasing-api.test.ts`) ran on the same server.

## Log

- 17:00 UTC — Step 1 (concurrency): issue #201 open, assigned to `Piotr12` (the automation user), labels `refactor` + `priority-low`, no `in-progress` label, no 🤖 claim comment, no open PR referencing it. Not in progress → proceed.
- 17:00 UTC — Step 2 (classify): no `feature` label; the issue corrects an existing test's coverage gap, not a new capability → bug route (corrective work, `fix/` prefix).
- 17:02 UTC — Worktree: this is cezar's linked worktree (`cez/71bcff64`), reused per the skill's worktree rules; `npm ci` started in the background because a cezar worktree needs its own install (lesson 2026-10-19).
- 17:08 UTC — Step 4 (`om-verify-in-repo`): **proceed**. No commit on `origin/main` mentions #201; the PRs matching `#201` are #197 (merged, the one that filed it) and #57 (unrelated); no open PR references it. `tests/integration/test-reset-api.test.ts:44` still reads `/api/tenants/prod/${kind}` with no `?page=`, and eight of the fifteen kinds page by 100. Real, unfixed; the fix lives in that test file (and a shared helper).
- 17:10 UTC — Step 5: branch `fix/issue-201-prod-snapshot-every-page` from `origin/main` (`d4097577`) in this worktree. Docker is unavailable on this machine, so the touched integration files will run against a standalone build (lesson 2026-10-23); `npm run build` started in the background, which the test-only change doesn't invalidate.
- 17:12 UTC — Step 6 (`om-root-cause`) brief:

  > **Summary:** `prodState()` in `tests/integration/test-reset-api.test.ts` compares each paged Prod list through its first 100 records only, so a Test reset that changed a Prod record beyond the first page would pass the test.
  >
  > **Root cause:** `prodState()` (`test-reset-api.test.ts:43-50`) reads every kind in `kinds` with `get(`/api/tenants/prod/${kind}`)`, without `?page=`. Eight of those lists page by 100 (`pageSchema` / `DOCUMENT_PAGE_SIZE` and its siblings under `packages/core/src/validators`): `customer-orders`, `shipments`, `goods-issues`, `purchase-requisitions` (since #197), `purchase-orders`, `goods-receipts`, `production-orders`, `transfers`. Their routes answer page 1 when `page` is absent, so once a file such as `purchasing-api.test.ts` (101 Prod requisitions, line 368) has run on the same server, the before/after comparison covers records 1–100 of that kind only. Inferred from the code; the reset writes Test only, so no false pass has been observed.
  >
  > **Files to change:**
  > - `tests/integration/api.ts` — add `LIST_PAGE_SIZE` (100) and `allPages(readPage)`: successive 1-based pages until one comes back short of `LIST_PAGE_SIZE`.
  > - `tests/integration/test-reset-api.test.ts` — name the paged kinds; `prodState()` walks every page of those through `allPages`, keeps the single read for the rest, and keys the lists by kind; arrange more than a page of Prod requisitions (this file's own) and assert the snapshot holds every one of them.
  > - `tests/integration/test-reset-realistic.test.ts` — replace its private copy of the same loop with the shared `allPages`.
  > - `tests/integration-helpers.test.ts` — unit test of `allPages`: 100+100+37 rows concatenate in order over three reads; a short first page stops after one read; an exact multiple of 100 reads one more, empty page.
  >
  > **Approach:** one shared page walker in `api.ts`, used by both reset tests; `prodState()` decides per kind from a `paged` set so unpaged lists keep their one read (issue AC 2). The regression case: with more than `LIST_PAGE_SIZE` Prod requisitions, the snapshot's requisition list holds every one this file created — on the old code it holds the first 100 and the assertion fails. Engineering standards: DRY (one definition, imported), tests assert behaviour.
  >
  > **Risks:** the arrangement adds up to 101 Prod requisitions on a server where no other file did (a few seconds); the suite already tolerates more than a page of Prod requisitions since #187/#197. The Prod audit is keyset-paged (`limit`/`before`), not `?page=`, so it stays a single newest-first read, as the issue scopes it. Run `purchasing-api.test.ts` before `test-reset-api.test.ts` on one server to prove AC 3.
- 17:14 UTC — Step 7 (`om-fix`): claimed #201 (assignee `Piotr12`, `in-progress` via the guard, 🤖 claim comment). Implementing.
- 17:22 UTC — Implemented the four files of the brief. `kinds` is `as const` so `paged` and `prodList` are checked against it at compile time (a misspelt kind is a type error). Fast gate: `npm run lint` exit 0 (0 errors, 1 pre-existing warning in `bom.service.ts`), `npm run typecheck` exit 0, `npx vitest run tests/integration-helpers.test.ts` 3/3, `npm run build` exit 0 (started before the edits; the change is test-only, so the build is unaffected).
- 17:24 UTC — Standalone server (copy of `.next/standalone` + static + public in `.ai/cezar/tmp/…/standalone-1`, fresh `DATA_DIR`, `KEEP_ALIVE_TIMEOUT=3600000`) on 127.0.0.1:3401; `run-integration.sh` runs, in order on that one server: `test-reset-api` (fresh Prod → the 101-create path), `purchasing-api`, `test-reset-api` again (AC 3), `test-reset-realistic`.
- 17:30 UTC — All four passed: `test-reset-api` 5/5 in 18 s on fresh Prod; `purchasing-api` 15/15; `test-reset-api` 5/5 in 16 s with Prod past 200 requisitions (AC 3); `test-reset-realistic` 5/5 (the realistic reset took 10.2 s, a Prod write issued 2 s into it answered after 8.2 s). Negative run on the same server with `prodList` temporarily forced to the single read (then restored): both reset tests fail on the new assertion, `expected 100 to be greater than 100` (E2E-010 then fails on the read-only flag the failed test left behind), so the regression check fails without the fix.
- 17:32 UTC — Lesson: extended the 2026-10-23 "Paging a list" entry in `.ai/lessons.md` with the snapshot rule (#201), dated 2026-10-24. `npm run test:coverage` running.
- 17:40 UTC — `om-fix` output contract:

  > **Status:** ready
  > **Files changed:** `tests/integration/api.ts`, `tests/integration/test-reset-api.test.ts`, `tests/integration/test-reset-realistic.test.ts`, `tests/integration-helpers.test.ts`, `.ai/lessons.md`, this run log.
  > **Summary:** the Test-reset Prod snapshot read each paged Prod list through its first 100 records; `prodState()` now walks every page of the eight paged kinds through the shared `allPages` and keeps one read for the rest, and the file holds Prod past a page of requisitions and asserts the snapshot has every one, so a first-page read fails.
  > **Tests:** `tests/integration-helpers.test.ts` (3 cases) and the strengthened reset test; lint 0 errors, typecheck 0, coverage 3,863 tests at the 100% thresholds, build 0; touched integration files 30/30 in order on one standalone server (Docker unavailable), full suite left to CI; negative run fails as expected.
  > **Breaking changes:** none (test code only).
- 17:41 UTC — Step 8 (`om-open-pr --handoff om-auto-review-pr`): committing, pushing `fix/issue-201-prod-snapshot-every-page`, opening the PR as `refactor` (the issue's category), `skip-qa`, `priority-low`, `risk-low`.

## Plan

1. `api.ts`: `LIST_PAGE_SIZE`, `allPages`. 2. `test-reset-api.test.ts`: `paged` set, keyed `lists`, own requisitions, regression assertion. 3. `test-reset-realistic.test.ts`: use the shared helper. 4. `tests/integration-helpers.test.ts`. 5. Gate: lint, typecheck, test:coverage, build; integration on a standalone server, in this order on one server: `test-reset-api` (fresh Prod: the 101-create path), `purchasing-api`, `test-reset-api` again (AC 3), `test-reset-realistic`. 6. `om-open-pr --handoff om-auto-review-pr`, then `om-auto-review-pr --autofix`; no UI surface touched, so no `om-auto-qa-pr`.

## Changes

- `tests/integration/api.ts` — `LIST_PAGE_SIZE` (100) and `allPages(readPage)`, the shared page walker.
- `tests/integration/test-reset-api.test.ts` — `kinds` as const; `paged` set; `prodList` walks the paged kinds; `prodState().lists` keyed by kind; `beforeAll` puts Prod past one page of requisitions (this file's own, `ownRequisitions`); the reset test asserts the snapshot's requisitions exceed a page and include every own one.
- `tests/integration/test-reset-realistic.test.ts` — private `allPages` copy replaced by the shared helper.
- `tests/integration-helpers.test.ts` — unit test of `allPages` (3 cases).
- `.ai/lessons.md` — the 2026-10-23 "Paging a list" lesson gains the snapshot rule (#201), dated 2026-10-24.
- This run log.

## Verification

- `npm run lint` exit 0 (0 errors, 1 pre-existing warning: `bom.service.ts` unused `lineError`).
- `npm run typecheck` exit 0.
- `npx vitest run tests/integration-helpers.test.ts` 3/3.
- `npm run build` exit 0.
- Integration, standalone server (no Docker here), one server, in order: `test-reset-api` 5/5 (fresh Prod, 101 requisitions created), `purchasing-api` 15/15, `test-reset-api` 5/5 (Prod at 200+ requisitions; AC 3), `test-reset-realistic` 5/5 (reset 10.2 s). Prod ended with 210 requisitions (`sqlite3` on the server's database).
- Negative run with the single read forced back: both reset tests fail, `expected 100 to be greater than 100`.
- `npm run test:coverage` exit 0: 3,863 tests in 532 files, the 100% thresholds met.

## Follow-ups

- (pending)
