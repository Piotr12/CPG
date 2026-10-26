# Illustrated guide to the Test dataset's planning week (Q10 of #237)

**Date:** 2026-10-26 05:38 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar)
**Spec:** none (the decision itself is Q10 of `.ai/specs/implemented/2026-10-25--0848UTC-single-site-daily-dataset.md`)
**Status:** done (PR open; CI pending at hand-over)

## Goal

The owner asked for a documentation piece on the Q10 decision (weekly production and purchasing at Thursday's planning run, and why a partly received purchase order shows on "Today" only from Friday to Tuesday), illustrative rather than text only, linked next to the admin's Reset Test button, shipped as a PR.

## Plan

- No such piece exists: only the spec's implementation note (text). Help is the app's documentation, so the piece is a public help page, `/help/test-dataset`, beside `/help`.
- The page draws the cycle as a flow (Thursday's run → Monday and Tuesday receipts → intermediates → finished products → next week's shipments) and a week strip of what "Today" holds, both from one data array, plus why Q10 was chosen and the alternative it rejected. EN and PL in the dictionaries.
- A help topic for the new route (`tests/every-page-has-help.test.ts`), the `/help` topic list links help-page routes, and the admin-home topic mentions the link.
- `ResetTestCard` gets a link to the page beside the Reset Test button.
- Unit tests for the page, the card link, the help link; one integration test (`help.test.ts`) that follows the link from the admin card.

## Log

- 05:38 Facts checked against the generator: `todaysDocuments` (timeline.ts) part-receives the first purchase order with `createdOn < today && plannedDate >= today`; `supply-plan.ts` plans receipts on the week's Monday (supplier 00000001) and Tuesday (00000002), created at the previous Thursday's run. So a partial receipt exists Fri, Sat, Sun, Mon, Tue; none on Wed (all received) or Thu (today's orders are created today).

- 06:40 Chose a vertical flowchart over a horizontal one: five boxes in a 3xl column wrap badly side by side, and a top-down flow reads the same at 320 px. The week strip is a picture (`aria-hidden`); the day list under it carries every fact in words.
- 06:43 Guard `tests/planning-week-guide.test.ts` generates two weeks across a month boundary and compares each day's partial receipt with `PLANNING_WEEK`. Flipping Wednesday to `true` fails it on 2026-10-21 and 2026-10-28, so it bites.
- 06:47 Docker unavailable: integration files run against a fresh standalone copy (lesson of 2026-10-23).

## Changes

- `packages/app/src/app/help/test-dataset/` — new public page `/help/test-dataset` (flow, week strip, legend, day list, why) and `planning-week.ts`, the drawn week.
- `components/tenants/reset-test-card.tsx` — link "How the datasets plan their week" beside Reset Test….
- `app/help/page.tsx` — a topic whose screen is a help page links to it.
- `help/topics.ts` — topic `test-dataset-week` (EN/PL); the Tenants topic mentions the link.
- `i18n/messages/{en,pl}.ts` — `help.planningWeek`, `admin.reset.guide`.
- Tests: page, card, help list, `tests/planning-week-guide.test.ts`, `tests/integration/help.test.ts` (follows the link from the card; 320 px fit).
- Spec implementation note: Q10 kept, documented at `/help/test-dataset`.

## Verification

- `npm run lint` 0; `npm run typecheck` 0; `npm run test:coverage` 0 (596 files, 4,606 tests, 100 % thresholds hold); `npm run build` 0 (`/help/test-dataset` listed).
- `npm run test:integration -- tests/integration/help.test.ts` against a local standalone server: 7 passed. `test-reset.test.ts` (the card it drives changed): 5 passed.
- Screenshots at 1280×800 of the page and the admin card, attached to the PR.

## Follow-ups

- None.
