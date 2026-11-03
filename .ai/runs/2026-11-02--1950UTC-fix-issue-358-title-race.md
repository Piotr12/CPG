# Fix #358 — integration tests read a page's title before it streams in

**Date:** 2026-11-02 19:50 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue 358`, dispatched by cezar)
**Spec:** none (test-only bug fix)
**Status:** done

## Goal

`smoke.test.ts` failed once on CI with `expected '' to be 'Admin · Caveman Planning Good'` (run 41493399904) and passed on rerun. Make every integration title assertion wait for the title instead of reading it once.

## Log

- 19:50 — Triage: real and unfixed. There's no PR or commit for #358 on `origin/main`. `Browser.title()` (`tests/integration/browser.ts`) is one `agent-browser get title`, and all 18 `expect(await x.title())` call sites read it straight after waiting for something in the body.
- 19:50 — Root cause (inferred, not reproduced): Next.js 16 streams a dynamic page's metadata apart from its body, and on a client navigation React swaps the hoisted `<title>` separately too. So right after the body's marker shows, the title can still be empty or the previous page's.
- 19:50 — Decision: remove `title()` from `Browser` and add `expectTitle(browser, expected)`. It polls `document.title` with `expect.poll` until it equals the expected title, within the same 25 s budget as `waitUntil`. Without `title()`, a one-shot title read can't be written again, and typecheck finds every caller. Waiting for "non-empty" alone was rejected: after a client navigation the stale title is non-empty.
- 19:50 — Claimed #358 (assignee, `in-progress`, claim comment). Branch `fix/issue-358-title-race`.
- 19:51 — Added unit regression tests for `expectTitle` in `tests/integration-helpers.test.ts` (it injects `timeout` and takes `Pick<Browser, "evaluate">` so a fake page can drive it). Mutation check: with a one-shot read in place of `expect.poll`, both tests fail with `expected '' to be 'Admin · Caveman Planning Good'`, the error from CI.
- 20:00 — The gate's unit tests failed in `tests/ai-filenames.test.ts`: `main` (fb574a24) carries both the active and the implemented copy of `2026-11-02--1613UTC-mrp-root-requirement-ranking.md`. Spec PR #355 merged after #356 had moved it, the same as #350. Deleted the active copy, as open PRs #353 and #354 also do (identical deletions merge cleanly), so this PR's CI can pass.
- 20:05 — Docker isn't running on this machine, so I ran the integration files against a local standalone server (lesson 2026-10-23). 13 files, 116 tests passed.
- 20:12 — Agent slip: a stray `git checkout -- .` threw away the uncommitted edits. Re-applied them the same way (perl for the call sites, the same hunks for the helper, tests and lesson), committed right away, and re-ran the gate on the re-applied tree.
- 20:15 — Review (`om-auto-review-pr --autofix`, PR #362). #353 merged first (`e6de7705`) and had already deleted the stale active spec copy, so the deletion here was redundant. Merged `origin/main` into the branch, so the PR no longer touches `.ai/specs/`. The 19:51–20:12 entries were first written in CET and are now in UTC (lesson 2026-10-31).

## Changes

- `tests/integration/browser.ts` — `Browser.title()` removed. `expectTitle(browser, expected, timeout = 25 s)` polls `document.title` with `expect.poll`.
- 13 integration files: 18 `expect(await x.title()).toBe(…)` → `await expectTitle(x, …)`.
- `tests/integration-helpers.test.ts` — `expectTitle` regression tests.
- `.ai/lessons.md` — the 2026-10-23 "wait for something only the destination has" entry now covers the title.
- `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md` — deleted (the stale active copy). Since `main` (#353) deleted it too, the merge of `origin/main` takes it out of the PR's diff.

## Verification

- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 672 files, 5584 tests passed, thresholds met (after the spec deletion; before it, only `ai-filenames.test.ts` failed, as on `main`).
- `npm run build`: pass.
- Integration, against a standalone build on :3358: 13 files, 116 tests passed (run before the slip, on identically re-applied edits; typecheck after re-applying confirms no `title()` caller is left).
- Re-run after re-applying: lint, typecheck, `test:coverage` (672 files, 5584 tests, thresholds met), build all pass.
- Unit regression: `tests/integration-helpers.test.ts` › `expectTitle`, 2 tests. They fail with a one-shot read (mutation check above).
- Probe (temporary file, deleted): 5 fresh sign-ins and 100 `/admin` reloads on the local server, each reading the title once right after `[data-slot=badge]`. All 105 reads already had the right title, so the race did **not** reproduce on this unloaded machine. The cause stays inferred from the CI failure (`''` on a loaded shard) and from how Next.js streams metadata. The fix makes no timing assumption either way.

- CI run 41518233441 on `a6b4cbb7` (PR #362): every check green, all 4 integration shards included.

## Follow-ups

- A human approves and merges #362. GitHub refuses the author's own approval, so the review verdict (approve) is a comment.
