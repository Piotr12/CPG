# Fix #185: the realistic Test reset must not time out at kamal-proxy

**Date:** 2026-10-23 21:56 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 185`, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md` (implementation notes only)
**Status:** in progress

## Goal

A realistic Test reset takes 33–40 s on the CI runner. `config/deploy.yml` sets no `proxy.response_timeout`, so kamal-proxy's 30 s default applies and a reset on cpg.baby probably answers 504 even though it commits. Also: the copy promises "up to half a minute", and #163's measurement of a Prod write during a reset (spec Q16) was never recorded with the CI figure.

## Plan

1. `config/deploy.yml`: `proxy.response_timeout: 120` (seconds), about 3× the slowest CI figure (40.5 s).
2. `tests/deploy-config.test.ts`: a repo check that the timeout is set and leaves that headroom.
3. `tests/integration/test-reset-realistic.test.ts`: issue a Prod write (`POST /api/tenants/prod/locations`) 2 s into the realistic reset, print both durations, and assert that the reset and the write both finish inside the proxy's timeout, read from `config/deploy.yml`.
4. `tests/integration/global-setup.ts`: copy the app's startup seed line ("Seeded the Test tenant … in X s") to the CI log, so the tiny seed's CI time can be recorded.
5. Copy, EN and PL: the dialog's `slow` text and the Reset Test help topic say "up to a minute" instead of "up to half a minute"; update `test-reset.test.ts`'s assertion. Correct `BACKWARD_COMPATIBILITY.md` §4's "about 10 s".
6. After CI: record the CI figures in the spec's implementation notes.

Not done here:
- **Timing a reset on cpg.baby.** That needs the production admin credentials and blocks production for ~40 s. It is the owner's call, after this fix deploys (Guard: production).
- **The parked seed speed-up** (`wip/issue-163-seed-perf`, 29c77bd9). It is 26 commits behind `main` and rewrites the posting paths of ten services that changed since (#147 among them). The issue asks for one or both; the timeout alone keeps the reset from failing at the proxy, at no risk to the posting code. It stays parked.

## Log

- 21:56 Triage: no PR or commit references #185 (PR #193 only files it). `config/deploy.yml` has no `response_timeout`; en.ts:47, pl.ts:45, topics.ts:125/417 promise half a minute. #193 edits other lines of `topics.ts` and `BACKWARD_COMPATIBILITY.md`, no overlap. Claimed the issue.
- No Docker on this machine, so the integration files run against a local production server (`CPG_BASE_URL`).
- 23:58 Proxy timeout, repo check (`tests/realistic-reset-duration.test.ts`, fails at 30 s), copy, integration timing written. Gate green.
- 00:01 **Deviation: a second defect.** The new Prod-write-during-reset step failed locally with `fetch failed: ECONNRESET`, on `next start` and on the standalone `server.js`, though the server stayed up. Probes (scratch scripts outside the repo): `curl` issued 2 s into the reset waits and gets 200; Node's `fetch` gets ECONNRESET only after an earlier request left a pooled connection idle; a plain Node server blocked 22 s is fine on fresh connections; the standalone server with `KEEP_ALIVE_TIMEOUT=60000` answers 200. Cause: the server's 5 s keep-alive timer on the idle socket expires during the block, and when the loop unblocks timers run before the queued request is read, so the socket is closed under it. The 2026-10-21 timings used fresh connections and saw only successes.
- Production impact, from kamal-proxy's source (`internal/server/target.go`, `service.go`): its upstream `http.Transport` sets only `MaxIdleConnsPerHost = 100` and `ResponseHeaderTimeout = response_timeout`, with no `IdleConnTimeout`, so it reuses idle connections until the app closes them. Go retries a failed reused connection only for GET/HEAD/OPTIONS/TRACE or a request with `Idempotency-Key`. A browser POST (server action, sign-in) queued behind a reset would answer 502. Fix: `KEEP_ALIVE_TIMEOUT=3600000` in the image's runner stage (read by Next's `server.js`; `0` can't be used, `start-server.js` ignores a falsy value). A 70 s idle probe confirmed Node's 60 s `headersTimeout` doesn't cut an idle keep-alive connection.
- 00:40 With the keep-alive, `test-reset-realistic.test.ts` + `test-reset.test.ts` pass locally: reset 9.9 s, Prod write 2 s in answered 200 after 7.9 s.

## Changes
- `config/deploy.yml`: `proxy.response_timeout: 120`.
- `Dockerfile`: `KEEP_ALIVE_TIMEOUT=3600000` in the runner stage.
- `tests/realistic-reset-duration.test.ts` (new), `tests/deploy-config.ts` (new helper): the timeout is ≥ 2× the slowest reset, the image keeps idle connections for an hour, and the copy promises up to a minute in EN and PL.
- `tests/integration/test-reset-realistic.test.ts`: a Prod write 2 s into the realistic reset; both durations printed and checked against the proxy timeout.
- `tests/integration/global-setup.ts`: the app's startup seed line copied to the CI log.
- Copy: `en.ts`, `pl.ts`, `help/topics.ts` (admin-home), `tests/integration/test-reset.test.ts`.
- `BACKWARD_COMPATIBILITY.md` §2 (two new rows) and §4 (reset duration); `.ai/lessons.md` (new lesson, 2026-10-21 lesson qualified).

## Verification
- `npm run lint`: exit 0, 0 errors, 1 warning (the old unused `lineError` in `bom.service.ts`).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: 497 files, 3,548 tests pass; 100% statements, branches, functions and lines.
- `npm run build`: exit 0 (the later changes touch only the Dockerfile, tests and docs).
- Regression checks: with `response_timeout` removed, the repo check fails (`response_timeout 30 s < 2 × 40.5 s`); with `KEEP_ALIVE_TIMEOUT` removed, it fails (`NaN ms < 1 h`); without the keep-alive the integration file fails with ECONNRESET.
- `CPG_BASE_URL=… npm run test:integration -- tests/integration/test-reset-realistic.test.ts tests/integration/test-reset.test.ts` against the standalone build with the image's keep-alive: 2 files, 10 tests pass.

## Follow-ups
