# E13-S05 — the audit filters keep values they don't list and announce refusals; reversal entries and report footers are checked in the browser (#152)

**Date:** 2026-10-23 14:06 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (issue #152; the audit filters shipped under `.ai/specs/implemented/2026-10-21--0944UTC-audit-history-filters.md`)
**Status:** done (PR #177; full integration suite pending in CI)

## Goal

The four acceptance criteria of #152: an unlisted account or record type in the URL stays selected and goes back on Apply; a refusal shown on first load reaches a screen reader without user action; the browser reads a completion reversal and a transfer posting reversal on the tenant audit; the footer test covers the stock report, the variance report and a filtered audit page.

## Log

- 14:06 — #152 is labelled `enhancement`, which would send it down the feature route (spec PR, then implementation). Its own label rationale says "polish and tests on shipped screens, no new capability", items 1–2 are defects in a shipped form and item 3 is test coverage, so it took the bug chain, as #143 (tests only) did. The triage gate confirmed every gap on `origin/main` at `8adea42`.
- 14:06 — Branch `fix/issue-152-audit-filter-unlisted-values` off `origin/main`; `npm ci --ignore-scripts`. Claimed #152.
- Plan:
  1. `audit-filters.tsx`: when the selected record type or account isn't among the select's options, add it as its own option, "<value> (not in the list)", so the select keeps it and Apply sends it back. EN/PL label `filterForm.unlisted`.
  2. New client `audit-filter-errors.tsx`: the `role="alert"` summary, `tabIndex={-1}`, focused on mount, so a refusal rendered with the page is read out. The fields keep `aria-invalid`/`aria-describedby`.
  3. `audit-history.test.ts`: a production completion and a transfer dispatch, both reversed by the file's normal user through the API, read through the tenant audit filters in the browser: the reversed entry with its reason, and the inverse movement's "Reverses" and the original's "Reversed by" links.
  4. `footer.test.ts`: `/admin/test/reports/stock`, `/admin/test/reports/variance` and a filtered `/admin/test/audit?…`.
- 14:20 — A focused error summary is a generic feedback state, so it went into `ui/src/backend/feedback/error-summary.tsx` (standards §1 "Where a new component goes"), not into the audit folder. The standards doc lists it beside `ErrorMessage`.
- 14:40 — The browser also proves items 1 and 2: on a bookmarked `?account=<unknown>`, the select reads "<name> (not in the list)" and Apply keeps `account=` in the URL. The refusal from the existing "ID without its type" step holds focus (`document.activeElement`).
- 14:45 — First integration run: the new reversal test expected the channel cell to be "API", but that cell also holds the token's name ("API\n<token>"). Fixed the assertion; nothing in the app was wrong.
- 14:55 — PR #177 opened; the lock moved to the PR. A fresh-context review subagent approved: no blockers or majors, 3 minors and 3 nits. Fixed:
  - `ErrorSummary` took focus even from a field the reader had already entered while the page hydrated. It now focuses only when nothing else has focus.
  - The audit summary sat after the fields, so Tab from it went to Apply. It is now first in the form.
  - The variance report's range error was the same server-rendered `role="alert"` defect. It now uses `ErrorSummary`, so the rule just added to the standards doc holds everywhere. The other `role="alert"` paragraphs (sign-in, preferences, completion form) appear after an action on a client form, which screen readers do announce.
  - The unlisted record-type option now names a type of the other audit ("Purchase order (not in the list)"). The name is looked up as an own key, since the schema accepts letters such as `toString`.
  - The channel assertions use the regex form of line 102.
  - Declined: comparing an unlisted account case-insensitively. It only matters on the refused path, where values are shown as sent.
- 16:30 — UI QA (`om-auto-qa-pr`, evidence only) on the standalone build of `14be82c`: 9/9 pass, screenshots on PR #177. Steps 1–6 cover the unlisted values and the focused refusals at 1280 and 390 px. Step 7 reversed completion 00000005 in Test through its dialog and read it on the audit; its inverse movement shows "Reverses". The seeded original has no audit entry, so "Reversed by" is left to the integration test. The footer was checked on both reports. Completion 00000001 was refused first because its output had shipped since: expected behaviour.
- 16:50 — CI on `5152ece`: every job green except integration shard 1. `users.test.ts` "lets alice sign in twice" read `/admin/users` where it expected the redirect to `/admin`. That file isn't touched here. The cause is a race in its `landsOn` helper: it waited for "signed in as alice" or the sign-in form, and the layout streams the signed-in account before the page's `requireAdmin` redirect lands. Every caller expects a redirect, so `landsOn` now waits for the URL to leave the opened path first. Ran `users.test.ts` on a fresh standalone copy and empty `DATA_DIR` twice: 8/8 both times. Two reruns on reused data failed only because alice already existed (users are never deleted).
- 14:50 — Docker isn't reachable from this account, so both files ran against the standalone build (lesson of 2026-10-19). AUD-004 and UX-010 in `CPG-acceptance.md` get the new evidence. UX-010 stays "Partially verified" because the MRP report doesn't exist yet.

## Changes
- `packages/ui/src/backend/feedback/error-summary.tsx` (new) + `feedback.test.tsx` — `ErrorSummary`: `role="alert"`, `tabIndex={-1}`, focused on mount.
- `packages/app/src/components/audit/audit-filters.tsx` + `.test.tsx` — an unlisted record type or account gets its own option; the refusal renders through `ErrorSummary`.
- `packages/app/src/i18n/messages/{en,pl}.ts` — `audit.filterForm.unlisted`.
- `tests/integration/audit-history.test.ts` — completion and transfer dispatch reversals on the tenant audit; the unlisted account kept on Apply; the refusal takes focus.
- `tests/integration/footer.test.ts` — the stock report, the variance report and a filtered audit.
- `packages/app/src/components/reports/variance-report-screen.tsx` + `app/admin/[tenant]/reports/variance/page.test.tsx` + `tests/integration/variance-report.test.ts` — the range error renders through `ErrorSummary` and takes focus (review finding).
- `tests/integration/users.test.ts` — `landsOn` waits for the redirect (CI flake found on this PR).
- `.ai/docs/engineering-standards.md`, `.ai/lessons.md`, `.ai/specs/research/CPG-acceptance.md` (AUD-004, UX-010 evidence).

## Verification
- `npm run lint` 0 (one warning in `bom.service.ts` that was already there), `npm run typecheck` 0, `npm run test:coverage` 0 (3,326 tests, 100% statements/branches/functions/lines), `npm run build` 0.
- `CPG_BASE_URL=http://127.0.0.1:3152 npm run test:integration -- tests/integration/footer.test.ts tests/integration/audit-history.test.ts` against `node packages/app/server.js` from this build, fresh copy and empty `DATA_DIR`: 20/20 passed.
- After the review fixes: lint 0, typecheck 0, `test:coverage` 0 (3,328 tests, 100%), build 0; `footer`, `audit-history` and `variance-report` integration files 24/24 on a fresh standalone copy and empty `DATA_DIR`.
- The full integration suite runs in the PR's CI.

## Follow-ups
- None from this change. The reversal entries' field labels are #145.
