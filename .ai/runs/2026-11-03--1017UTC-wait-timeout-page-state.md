# A timed-out integration wait reports what the page showed (#373)

**Date:** 2026-11-03 10:17 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, bug route, dispatched by cezar)
**Spec:** none
**Status:** done

## Goal

#373: `audit-history.test.ts`'s viewport test timed out once in `openAudit`, on a loaded local full run, and the error named only the condition it waited for. Nobody can tell whether the page was still streaming, showed an error, or had gone elsewhere (a sign-in redirect, say). Make that diagnosable for the next occurrence, here and in every other file.

## Log

- 10:17 Triage (`om-verify-in-repo`): issue open, unclaimed, no PR or commit references #373. The 40 most recent failed CI runs (2026-10-21 to 2026-11-02) hold no failure of this test; the only `audit-history.test.ts` failure there is a different test (line 159, 2026-10-23, fixed since). The reported timeout itself is real, unexplained and left no evidence.
- 10:17 Root cause: not reproducible on demand (one local occurrence under load, 9/9 alone). The issue's two hypotheses:
  - "the viewport change raced the navigation": the lesson of 2026-10-23 covers `set viewport` as a fresh session's *first* command. Here the operator session has been up for the whole file, so that quirk does not apply, and agent-browser answers `set viewport` before `open` is sent (each command awaits its answer).
  - "the page streamed slowly under load": possible, but unprovable after the fact because `waitUntil`'s timeout records nothing about the page.
  The defect this run can fix is the second part: `tests/integration/browser.ts`'s `waitUntil` throws `Wait timed out … for <expression>` and nothing else, so neither this flake nor any other can be told apart from the log.
- Decision: on timeout, `waitUntil` reads the page once more and puts its state in the error: URL, `document.readyState`, title, Suspense boundaries still showing their fallback (`template[id^="B:"]`), streamed segments not yet revealed (`div[hidden][id^="S:"]`), and the start of the shown `main`'s text. A screenshot (the issue's suggestion) would need a new CI artifact upload; the text lands in the CI log the failure is already read from. No test is reordered on a hypothesis.

- 10:20 Claimed #373 (assignee, `in-progress`, claim comment).
- 11:21 Implemented; unit tests for the formatter and for the in-page script (jsdom, with a `hidden`-aware `innerText` stub, since jsdom has none).
- 11:55 Real-browser check: a wait for `main table` on `/admin/prod/audit` from a signed-out session now ends with `The page http://127.0.0.1:3473/login (complete, title "Sign in · Caveman Planning Good", 0 Suspense boundaries still loading, 0 streamed parts not shown yet) reads: "Sign in to CPG Use your CPG account. Username Password Sign in"`.

- 12:40 Independent review (fresh agent) requested changes; all applied:
  - major: the shown `main` was picked with `!closest("[hidden]")`, but Next.js keeps earlier pages mounted with `display: none` (lesson 2026-10-23), so after a client navigation the error could quote the page left behind. Now `checkVisibility()`; the test's earlier page is `display: none`.
  - minor: the page read had no limit, and a wedged agent-browser (up to 30 s) would let the test's 60 s limit swallow the wait's error. Now capped at 5 s (`no answer in 5000 ms`), tested.
  - minor: a boundary whose server render failed keeps its `B:` template with `data-dgst`; now counted as `failed`, not loading.
  - nits: null-safe catch, literal URL/ready-state assertions, shorter lesson. Declined: "after 25000ms" stays the wait's timeout, not the elapsed time including the ≤5 s read.

## Changes

- `tests/integration/browser.ts`: `PAGE_STATE`, `waitTimedOut`; `waitUntil` throws `waitTimedOut`'s error (same first line as before, the page's state on the second, same `cause`).
- `tests/integration-wait-timeout.test.ts`: unit tests for both.
- `.ai/lessons.md`: the agent-browser lesson says where a timeout's page state is.

## Verification

- `npm run lint` ✅, `npm run typecheck` ✅ (root `tsconfig.json` covers `tests/`), `npm run build` ✅.
- `npx vitest run tests/` ✅ 29 files, 497 tests.
- `npm run test:coverage`: 675 of 678 files passed; 8 tests in 3 files failed on timeouts while the machine ran at load average ~10.5 (other sessions): `mrp-run-timing.test.ts` (39 s against a 1.5 s bound), `seed-demo-data.test.ts` and `test-reset.service.test.ts` (realistic two-year dataset, 300 s limit). This change touches no package code; the same tests passed in CI on the base commit `c3325d75` (Deploy run, 2026-11-03 10:12 UTC). Run alone, `seed-demo-data` passed and one `test-reset` test still timed out (867 s, with the integration run beside it). CI is the verdict for these.
- `npm run test:integration -- tests/integration/audit-history.test.ts` against a local standalone server (no Docker on this machine): ✅ 9/9.
- Forced timeout on the real app: the error names the sign-in redirect (above); re-checked after the review fixes (`checkVisibility()` in Chrome).
- PR #374 CI on the first commit: all 12 checks green (lint, typecheck, build, unit shards, timing, 100% coverage, 4 integration shards).

## Follow-ups

- #373 stays open after the merge only if the timeout recurs: its error now says whether the audit page was still streaming, errored or redirected, which decides the real fix.
