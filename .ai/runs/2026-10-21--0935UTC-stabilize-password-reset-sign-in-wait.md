# Stabilize the password-reset sign-in integration wait (#128)

**Date:** 2026-10-21 09:35 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 128`
**Spec:** none (CI-reliability bug)
**Status:** done (pending the PR's CI)

## Goal

`tests/integration/users.test.ts` › TEN-006 failed once in CI (#123, run 39569232051 attempt 1): the
`signedInAs("alice")` wait after a post-reset sign-in timed out after 25 s; the rerun passed. Find out
whether it is a sign-in/session race or browser readiness timing, fix the cause, keep every assertion.

## Log

- 09:35 — Bug route. Concurrency: issue assigned to the automation identity (Piotr12), no `in-progress`
  label, no open PR referencing #128, no commit on `main` mentioning it → proceed.
- 09:35 — CI log: the failing command is the `signedInAs("alice")` wait, so one of the two
  `signInAsAlice(…, ALICE_NEW_PASSWORD)` calls (lines 125–126). Test took 27.7 s in total. No artifacts
  (CI uploads none), no server logs.
- 09:38 — Probe: `agent-browser open` waits for the new document's load (`readyState: complete`, old
  window marker gone) even when the old page is the same URL, so filling a stale `/login` page is ruled out.
- 09:40 — Docker's VM is out of disk (`docker build` → "no space left on device"). Per lessons, no
  pruning of shared state; reproduction moves to the standalone server.
- 09:55 — Probe (`tests/integration/zz-probe-128.test.ts`, uncommitted): repeats TEN-006 with a fresh user
  per round (API create + reset, two browsers, wrong then new password). Idle machine: 20/20 pass.
  With 36 `yes` CPU hogs on 18 cores: 1/25 stalled, waiting for the wrong-password alert, so a submit can
  produce no visible answer under load — the same family as the CI stall.
- 10:15 — A later probe run hit "Too many attempts" for every round: my `pkill -f` missed the old server
  (Next renames its process `next-server`), so the probe ran against a server already holding ~45
  failures. Lesson: the standalone server sets `X-Forwarded-For` itself, so all test browsers share one
  per-IP bucket (50 failures / 15 min). The full suite makes only ~10 failed sign-ins, so this is not the
  CI cause, but long local probes must restart the server.
- 10:20 — Instrumented probe on a fresh server, 36 hogs: 1/24 stalled (wrong-password alert never came).
  The page's event log shows `click FORM`, with no `submit` and no action `fetch`: the click missed the
  button. The URL was still `/login`, the input was hydrated, there was no alert, and the button read
  "Sign in". So the session and the server action were not involved: the request was never sent.
- 10:25 — Recording the submit button's box from page start (`--init-script`): it jumps from (592,349)
  to (464,373) when the streamed staging containers drop from 3 to 1, i.e. when the visitor bar replaces
  the sidebar skeleton (`SidebarSkeleton` reserves a left column; a signed-out page lays out as a
  column). Idle, that happens before `load`; under load React reveals it later, after the helper's
  hydration check, so agent-browser's coordinate click lands on the form.
- 10:30 — Fix: `signIn` also waits for `signedOutLayoutSettled`: the visitor bar outside `[hidden]`, and
  `document.fonts.status === "loaded"`, since a font swap can move the centred card in the same way.
  The assertions are unchanged: old sessions revoked, old password refused, new password works.
- 10:55 — Same probe with the fix, 36 hogs: 24/24 and 24/24 (before: 2 stalls in 49 rounds).
- A deterministic browser regression was not feasible: agent-browser has no CPU throttling, and holding
  back React's reveal would mean patching React's internal streaming scripts. The fix corrects the
  readiness boundary instead, which the issue's acceptance criteria allow, with the stress probe as
  evidence. The probe stayed outside the repo.

## Changes

- `tests/integration/sign-in.ts`: `signedOutLayoutSettled`, awaited by `signIn` before filling.
- `.ai/lessons.md`: new lesson on late layout shifts and coordinate clicks; the 2026-10-20 hydration
  lesson now points to it.

## Verification

- Stress probe (uncommitted, TEN-006 flow ×24, 36 CPU hogs, fresh standalone server): before 1/25 and
  1/24 stalled; after 24/24 and 24/24 passed.
- `users`, `auth`, `api-users` and `preferences` integration files against a fresh standalone server:
  4 files, 26 tests passed. Docker's disk is full on this machine, so the image is not tested here;
  CI runs the full suite.
- `npm run lint`: 0 errors, 1 warning in `bom.service.ts`, which this branch doesn't touch.
  `npm run typecheck`: clean. `npm run test:coverage`: 441 files, 2,858 tests, 100% on all four metrics.
  `npm run build`: passed (before the test-only edit).

## Follow-ups

- Product: signed-out pages shift 128 px at desktop widths when the visitor bar replaces the sidebar
  skeleton (layout shift for real visitors too). Worth a separate low-priority UX issue: for example, a
  skeleton that doesn't reserve the sidebar column when no session cookie is present.
