# Issue #155: client controls don't hydrate under `npm run dev`

**Date:** 2026-10-23 14:11 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 155`, dispatched by cezar)
**Spec:** none (the issue's scope; the #90 spec `.ai/specs/implemented/2026-10-21--0707UTC-document-lifecycle.md` carries the original note)
**Status:** done (does not reproduce)

## Goal

Reproduce #155 on current `main` with a fresh `npm ci` and a clean `.next`, on the forecast page and on a customer order's Cancel / Close Early dialogs. Find and fix the root cause, or record that it no longer happens and close the issue.

## Log

- Concurrency check: #155 had no assignee, `in-progress` label, claim comment or open PR. It's labelled `bug`, so it took the bug route.
- `main` at `8adea42`, in this cezar worktree (`.ai/cezar/worktrees/…`): `npm ci`, `rm -rf packages/app/.next`, `CPG_ADMIN_PASSWORD` in `packages/app/.env.local`, `npx next dev -p 3155` with the default `DATA_DIR` (`<worktree>/data`, a fresh database: 30 migrations applied, Test seeded). Next.js 16.4.2 (Turbopack).
- agent-browser 0.39.1 (session `i155`): `/login` → `#username` had a `__reactFiber` key; signed in as admin and reached `/admin`.
- `/admin/test/forecasts`: every visible button (Add forecast, Filter, row menus, the sidebar) had a fiber. Add forecast opened the dialog. Filled material, location, date (through the value setter, as `fillDate` does) and quantity, then submitted: `POST /admin/test/forecasts 200`, the dialog closed, and the row `2031-03-17 | 7` is in `forecast`.
  - The first submit attempt sent nothing, for two reasons in the test setup: agent-browser's `fill` leaves a date input empty (lesson 2026-10-20), and the 577 px viewport left the dialog's Add button off screen. At 1000 px, an empty date keeps the dialog open and marks the field invalid, which is correct.
- `/admin/test/customer-orders/00000054` (open, shipped in part): Close Early opened its confirmation and submitted (`POST … 200`), and the order is `closed-early`. `/admin/test/customer-orders/00000070` (open, no shipment): Cancel opened and submitted (`POST … 200`), and the order is `cancelled`.
- Console: `[HMR] connected`, two `[Fast Refresh] rebuilding … done` after the first sign-in (no loop: the dev log shows no repeated `GET`), and one dev-only `instant-shell-url-data` Insight on the forecast and customer-order routes. The Insight doesn't block interaction.
- At #90's own commit `a710507` (temporary worktree under `.ai/cezar/tmp/`, so the default data dir sat where the 2026-10-23 Fast Refresh loop lesson saw a loop): fresh `npm ci`, `next dev -p 3156`. The login and forecast buttons hydrated and the Add forecast dialog opened, with no reload loop. A cold, never-visited route (`/admin/test/purchase-orders`) showed hydrated buttons 1.1 s after `open`.
- Conclusion: it doesn't reproduce on `main` or on `a710507` with the same Next.js (16.4.2). The #90 observation was probably environmental: a stale `.next`, a Fast Refresh loop, or clicks before hydration or with empty date inputs. The run can't prove which, since that run's environment is gone. No code change.

## Changes

- `.ai/specs/implemented/2026-10-21--0707UTC-document-lifecycle.md`: the note now says #155 couldn't reproduce it.
- `.ai/lessons.md`: how to prove a `next dev` hydration failure before recording one.
- This run log.

## Verification

- The reproduction above: every flow in #155's acceptance criteria passes under `npm run dev` on a clean `main` checkout.
- `npx vitest run tests/ai-filenames.test.ts`: passes (naming of the new run log).

## Follow-ups

- None filed. The `instant-shell-url-data` Insight on routes that read `params` outside a `<Suspense>` is a dev-only advisory, unrelated to hydration.
