# Fix #185, second round: `/up` answers during a realistic Test reset, the seed speed-up lands, and the copy says a minute or two

**Date:** 2026-10-24 17:20 UTC
**Agent:** Claude Code (Fable 5.1), `om-auto-fix-issue 185`, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md` (implementation notes only)
**Status:** in progress

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

## Changes

## Verification

## Follow-ups
