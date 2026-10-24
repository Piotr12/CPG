# Fix #185, second round: `/up` answers during a realistic Test reset, the seed speed-up lands, and the copy says a minute or two

**Date:** 2026-10-24 17:20 UTC
**Agent:** Claude Code (Fable 5.1), `om-auto-fix-issue 185`, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md` (implementation notes only)
**Status:** partial: the repository side is done on PR #215; timing a reset on cpg.baby stays with the owner (#185)

## Goal

The owner's instruction for this round: don't over-optimise the realistic reset. It may run for up to 120 s (kamal-proxy's
`response_timeout`, set by #198) as long as (1) `/up` answers while it runs and (2) the admin is told clearly that it can
take a minute or two. Land the seed improvements identified earlier (`wip/issue-163-seed-perf`, 29c77bd9), without chasing
a sub-30 s figure.

## Triage (`om-verify-in-repo`)

Real and still unfixed. #198 (merged 7255a92b) set the proxy timeout to 120 s, the image's keep-alive to an hour and the copy
to "up to a minute". It left `/up` frozen for the whole reset (`timings.md` of 2026-10-21: `GET /up` answered after the
reset, 8.27 s locally, 40 s on CI) and the seed speed-up parked. The issue is open, assigned to the current user, no lock held
(the #198 chain released it). The owner re-scoped the remaining work in this run's instruction.

## Root cause (`om-root-cause`)

Summary: while a realistic Test reset runs, the server answers nothing, `/up` included, for 33–43 s on CI.

Root cause, two parts, both in code read rather than reproduced on cpg.baby:

1. **The event loop never reaches its I/O phase.** `seedTestTenantDataset` (`core/src/services/demo/seed-demo-data.ts`)
   writes 3,549 documents through the services; every statement is a synchronous better-sqlite3 call, and the `await`s
   between them resolve as microtasks. Node drains microtasks before polling sockets, so no request is even read until the
   reset commits.
2. **The health check queues behind the reset's transaction.** `SystemStatusService.ping()` runs `select 1` through the
   ORM's connection. MikroORM 7 drives SQLite through Kysely, whose `RuntimeDriver` wraps the single connection in a
   `ConnectionMutex` (`supportsMultipleConnections === false`); a transaction holds that mutex from `begin` to `commit`, so
   even with the loop free the ping would wait for the reset.

Files to change:
- `core/src/services/demo/seed-demo-data.ts` — yield to the event loop (`setImmediate`) after each master batch and each
  document, so sockets are read between documents.
- `db/src/orm.ts` — `pingDatabase(orm)`: `select 1` on the native better-sqlite3 connection, outside Kysely's mutex, so the
  health check answers while a transaction is open on the connection.
- `core/src/services/system/system-status.service.ts` — `ping()` uses it; the ESLint `rawSql` exemption goes.
- `core/src/services/tenants/test-reset.service.ts` — log how long the reset held the database (the server's own record;
  how the owner gets the cpg.baby figure from `kamal app logs`).
- The seed speed-up from `wip/issue-163-seed-perf`, ported by hand onto today's services: `seedDemo` returns only the IDs the
  seeder needs (customer orders, shipments, goods issues, goods receipts, purchase orders, production orders and
  completions); `stock-posting.ts` loads a posting's materials, locations and balances in one query each; `db/src/statement-cache.ts`
  reuses prepared statements.
- Copy: `app/src/i18n/messages/{en,pl}.ts`, `app/src/help/topics.ts` — "a minute or two".
- Tests: `test-reset.service.test.ts` (a timer-scheduled ping answers while the reset runs; fails without either half),
  `system-status.service.test.ts`, `statement-cache.test.ts`, the services' seed tests, `tests/realistic-reset-duration.test.ts`,
  `tests/integration/test-reset-realistic.test.ts` (`GET /up` 2 s into the reset answers in seconds) and `test-reset.test.ts`.

Approach: keep D06 (one transaction, Test is old or new) and R05. Other requests still wait for the commit, now on Kysely's
mutex instead of in the socket buffer, and complete afterwards as before; only the health check (and static files) answer
meanwhile. No busy-wait can appear inside the process: every query of this ORM goes through the same mutex.

Risks: a second ORM in the same process (another Next.js bundle) could now interleave a write and busy-wait in C for the
busy timeout; `getContainer()` is keyed by the entities array, so a bundle shares the ORM with the reset only when it shares
`@cpg/db`, and the previous behaviour (nothing runs) was the only thing preventing it. Checked in the standalone build:
the reset and a Prod write go through one container. The batched lookups must keep every refusal, in line order.

## Plan

1. Claim #185 (assignee, `in-progress`, claim comment).
2. `pingDatabase` + `ping()`; yields in the seeder; the reset duration log line.
3. Port the seed speed-up; measure the realistic reset before and after (unit test timing, local standalone server).
4. Copy, EN and PL; tests.
5. Integration: `/up` during the reset, with its latency printed.
6. Docs: BC §4, spec implementation notes, lessons.
7. Gate: lint, typecheck, coverage, build; the touched integration files against a local standalone server (no Docker here).
8. `om-open-pr --handoff om-auto-review-pr`, review, QA of the copy, release the lock.

## Log

- 17:20 Read #185, #198, the wip branch's diff, the seeder, the reset service, Kysely's sqlite driver and `RuntimeDriver`.
  Decided against a worker thread (the whole container would have to live in the worker; Turbopack and the ORM-per-bundle
  rule make that a project of its own) and against chunked transactions (D06).
- 17:30 Baseline on this Mac: the realistic reset unit test takes 10.7 s.
- 17:40 `pingDatabase` (native `select 1`), `cacheStatements`, the seeder's `setImmediate` yields, the reset log line, the
  copy, and the ESLint exemption for the health check removed (`tenant-lint.test.ts` now proves the service has none).
- 18:10 The wip branch's speed-up ported by hand onto today's services (its files had moved on since #147 and #187): the
  seven `seedDemo` paths return IDs through a `result` callback, `postStockMovements` batches its lookups, the tests follow.
  Typecheck clean; 135 files / 582 unit tests of the touched areas pass; lint 0 errors (the old `lineError` warning).
- 18:25 After the port the realistic reset unit test takes 7.6 s (the reset itself 6.6 s by the new log line, tiny 0.8 s).
  The new tests: a timer-scheduled ping answers before the tiny reset ends; the loop turns at least once per document.
- 18:50 Build green. Standalone copy on 127.0.0.1:3185 (fresh `DATA_DIR`, the image's keep-alive): `test-reset-realistic.test.ts`
  and `test-reset.test.ts` pass (10 tests). The realistic API reset took **6.6 s** (9.3–9.9 s on this Mac before), the Prod write
  issued 2 s in answered 200 after 4.6 s, `GET /up` issued 2 s in answered after **0.01 s**. The server log shows every reset's
  duration line. The first coverage run failed only on `db/src/index.test.ts`'s export list (`pingDatabase` added); re-running.
- 19:20 Coverage green (532 files, 3,867 tests, 100%). On a second fresh standalone instance (127.0.0.1:3186) the 13 integration
  files that post stock pass (78 tests). Committed ad008cac, pushed, PR #215 opened (`Refs #185`), labels `review`, `bug`,
  `needs-qa`, `priority-high`, `risk-medium`; the chain lock moved onto the PR and the issue's `in-progress` released.
- 19:25 Fresh-context review dispatched (it runs the gate itself); browser QA of the copy next, on the local instance.
- 19:45 Browser QA (agent-browser, the standalone build on 127.0.0.1:3185): the dialog and help say "a minute or two" in EN
  and PL, no old phrasing anywhere, Cancel/Anuluj change nothing, the dialog fits 390×844, and a realistic reset confirmed from
  the UI succeeded after 6.6 s while `curl /up` every 0.4 s answered 200 in 3–6 ms; the server logged 6.5 s. Evidence posted on
  #215 (six screenshots on `qa-evidence/pr-215`). CI so far: lint, typecheck, unit tests, build and shard 4 green.
- 20:05 CI shard 1 failed on two home-page tests that read the DOM before the streamed home content arrives (`footer.test.ts`
  "ends the home page", `navigation.test.ts` visitor Sign in): the flake #213 tracks, failing on four other branches this hour;
  evidence added to #213, the shard re-run and green. CI figures: the realistic reset 27.0 s (42.4–43.0 s before), the Prod
  write 2 s in 25.0 s, `GET /up` 2 s in 0.01 s.
- 20:15 **Review finding (major), accepted.** The standalone build holds three ORM copies (route handlers, pages and server
  actions, instrumentation), so Kysely's mutex queues only the reset's own bundle: a transaction another bundle begins while
  the seed yields reaches SQLite mid-reset and gets `SQLITE_BUSY` at once (a WAL read-to-write upgrade skips the busy handler),
  where before this PR it waited unread in the socket and then succeeded. My run-log note "the reset and a Prod write go
  through one container" was true only for the API+API pair the integration test exercises. Fix: `@cpg/db`'s write gate
  (`holdWriteGate`, `WriteGate` subscriber on `beforeTransactionStart` / `afterTransactionCommit` / `afterTransactionRollback`):
  the reset holds it from before its first write to its commit, and a root transaction of any other connection in the process
  waits (bounded by the proxy's 120 s). Armed after the reads, so the TEN-026 retry and the idempotency races still work.
  Next.js holds requests until the instrumentation hook returns, so the startup seed needs no gate. Also the reviewer's nits:
  the statement cache's busy replacement is now most recent, the `/up` comment says what the ping proves.
- 21:05 Gate committed e26c7af3; CI run 40120166764 green on all eight checks (the reset 27.4 s, the Prod write 25.4 s,
  `GET /up` 0.02 s). The re-review approved the delta with two minors, both applied: (1) a native write outside a transaction
  bypasses the gate and busy-waits 5 s in C (the reviewer measured 5.44 s, stalling the holder too), reachable through the
  token touch (`recordUse`) and the session deletes (`validateSession`, `signOut`); those now run in `em.transactional`, and
  the lesson says the gate sees transactions only. (2) a second holder on another bundle replaced the first's gate and orphaned
  its waiters; `holdWriteGate` now waits for a foreign gate (bounded) and the subscriber re-checks after each release, since a
  released gate may have passed to the next holder. Tests: two more in `write-gate.test.ts` (three ORMs), the token test fails
  the transaction instead of the native call.

## Changes

- `packages/db/src/orm.ts`: `pingDatabase` (a `select 1` on the native connection, outside Kysely's mutex); `initOrm` installs
  `cacheStatements`. `packages/db/src/statement-cache.ts` (new): an LRU of 500 prepared statements on `Database.prepare`.
- `packages/db/src/write-gate.ts` (new): `holdWriteGate(em)` and the `WriteGate` subscriber, registered in `config.ts` beside
  `TenantGuard`; a root transaction of another ORM copy in the process waits for the holder's commit or rollback, at most
  `WRITE_GATE_WAIT_MS` (the proxy's 120 s); a holder whose connection closed is dropped; a second holder waits for the first.
- `packages/core/src/services/api-tokens/api-token.service.ts` (`recordUse`) and `auth/auth.service.ts` (`deleteSession`):
  the native writes outside a transaction now run in one, so they pass the gate instead of busy-waiting in C.
- `packages/core/src/services/demo/seed-demo-data.ts`: `await setImmediate` after each master batch and each document.
- `packages/core/src/services/tenants/test-reset.service.ts`: holds the write gate before its first write; logs the reset's
  duration (`Reset the Test tenant to the <dataset> dataset, generation N: deleted and reseeded in X s`).
- `packages/core/src/services/system/system-status.service.ts`: `ping()` through `pingDatabase`; the ESLint `rawSql` exemption
  for it removed (`eslint.config.mjs`, `tests/tenant-lint.test.ts`).
- The seed speed-up ported from `wip/issue-163-seed-perf`: `seedDemo` of customer orders (ID and line IDs), shipments, goods
  issues, goods receipts, purchase orders, production orders and completions return only IDs through a `result` callback of
  `createWith`/`postWith`; `stock-posting.ts` loads materials, locations and balances in one query each (`materialsByCode`,
  `pickActiveMaterial`, `locationsByCode`, `pickActiveLocation`, `currentBalances`); `find-named-record.ts` exports
  `namedRecordNotFound`.
- Copy: `en.ts`, `pl.ts`, `help/topics.ts` ("a minute or two"); `app/src/app/up/route.ts` comment.
- Tests: `orm.test.ts`, `statement-cache.test.ts`, `write-gate.test.ts`, `index.test.ts`, `system-status.service.test.ts`,
  `seed-demo-data.test.ts`, `test-reset.service.test.ts` (ping during a reset, a write from another ORM copy during a reset,
  the TEN-026 uncommitted-reset case reworded to the gate's behaviour, the log line), the seven services' seed tests,
  `tests/realistic-reset-duration.test.ts`, `tests/integration/test-reset-realistic.test.ts` (`GET /up` 2 s into the reset),
  `tests/integration/test-reset.test.ts` (a UI reset with an API Prod write and `/up` meanwhile), `global-setup.ts` (the
  reset log lines in the CI log).
- Docs: `BACKWARD_COMPATIBILITY.md` §4, the spec's implementation notes, `.ai/lessons.md` (the better-sqlite3 and bulk-write
  lessons), this run log.

## Verification

- `npm run lint`: exit 0, 0 errors, 1 warning (the old unused `lineError` in `bom.service.ts`).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0; 533 files, 3,875 tests; 100% statements (10,483), branches (4,475), functions (3,490),
  lines (9,078).
- `npm run build`: exit 0 (re-run on the final tree, see the log).
- Regression checks: without the yields the timer-scheduled ping only fires after the reset and the loop-turn counter stays at
  one; through Kysely instead of the native handle the ping parks on the mutex (`orm.test.ts` keeps that as a control); without
  the gate a second ORM's write fails at once with `SQLITE_BUSY` (`write-gate.test.ts`, the control is the ORM built without the
  subscriber).
- Integration, against the production standalone build (no Docker on this machine), each file set on a fresh copy and
  `DATA_DIR`: `test-reset-realistic.test.ts`, `test-reset.test.ts`, `test-reset-api.test.ts` (15 tests); the 13 files that post
  stock (78 tests). On the idle machine the realistic API reset took **6.5 s** (6.4 s by the server's log), the Prod write issued
  2 s in answered 200 after 4.5 s, `GET /up` after 0.01 s; the UI tiny reset with an API Prod write and `/up` meanwhile: both 200.
- CI run [40117347645](https://github.com/Piotr12/CPG/actions/runs/40117347645) on `ad008cac`: lint, typecheck, unit tests,
  build and the four shards green (shard 1 after a re-run; its first run hit the home-page flake #213). The realistic reset
  **27.0 s**, the Prod write 2 s in 25.0 s, `GET /up` 2 s in 0.01 s, the tiny seed 3.1–5.1 s. The gate commit's own run is
  linked from the PR.
- After the review's minors (the last tree): lint 0 errors, typecheck clean, coverage 533 files / 3,877 tests / 100% on all
  four, build green; against a fresh standalone copy `auth.test.ts`, `api-tokens.test.ts`, `test-reset-api.test.ts`,
  `test-reset.test.ts` and `test-reset-realistic.test.ts` pass (29 tests): the realistic reset 6.3 s, the Prod write 2 s in
  4.3 s, `GET /up` 0.01 s, no "database is locked" in the server log.
- Browser QA on the standalone build: [evidence on #215](https://github.com/Piotr12/CPG/pull/215#issuecomment-6387532086).
- Not verified here: kamal-proxy and cpg.baby (no proxy locally); the owner's post-deploy reset (below).

## Follow-ups

- **Owner, after #215 deploys:** one realistic reset on cpg.baby from the Reset Test card; the UI shows success, `/up` answers
  meanwhile, `kamal app logs` shows `Reset the Test tenant to the realistic dataset … in N s`. Record N on #185 and in the
  spec's implementation notes, then close #185. Over about two minutes means the 120 s timeout and the copy need another look.
- #213: the home-page tests read the DOM before the streamed content arrives; `navigation.test.ts`'s visitor test has the same
  race (evidence on the issue).
- `wip/issue-163-seed-perf` (local, 29c77bd9) is superseded by this PR and can be deleted.
- Known, pre-existing: two writers from different bundles at the same instant still race for SQLite's write lock (one gets
  `SQLITE_BUSY`); the gate serialises only what arrives while a long write holds it.
