# Fix #166: app-icons integration test reads /admin's icon links too early

**Date:** 2026-10-23 10:08 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (bug)
**Status:** done (CI pending on the PR)

## Goal

`tests/integration/app-icons.test.ts` failed once in CI (PR #161) with no icon `<link>` found on `/admin`. Make its `beforeAll` wait for the head before reading the links; keep the pinned expectations unchanged.

## Log

- 10:08 — Triage: issue assigned to Piotr12 (this run), no `in-progress` label, no open PR referencing it. The bug is real on `main` (`f6126f1`): `beforeAll` calls `browser.evaluate` straight after `browser.open`.
- Root cause (inferred, as in the issue): signed out, `/admin`'s `AdminContent` calls `requireUser()` inside a `<Suspense>`, so the redirect to `/login` is streamed and the client navigates after `open` has returned. Reading during that window can see a head without the metadata links.
- Fix: `waitUntil(document.readyState === "complete" && the manifest link exists)` before reading, for both pages. The wait doesn't depend on the other three links, so a framework change that drops one still fails on the pinned `toEqual` diff rather than a timeout.
- A flake that needs CI load can't be reproduced on demand, so there is no failing-first regression test; the evidence is the file passing locally and in CI.

## Changes

- `tests/integration/app-icons.test.ts`

## Verification

- Docker unavailable on this machine (lesson 2026-10-19), so the file ran against a fresh standalone copy of `npm run build` on port 3166 with a fresh `DATA_DIR`: `CPG_BASE_URL=http://127.0.0.1:3166 npm run test:integration -- tests/integration/app-icons.test.ts` → `Tests 5 passed (5)`, three runs in a row.
- `npm run lint` → 0 errors, 1 warning (`lineError` unused in `packages/core/src/services/boms/bom.service.ts`, already on `main`, not touched here).
- `npm run typecheck` → clean. `npm run test:coverage` → 485 files, 3314 tests passed, "604 files fully covered", exit 0. `npm run build` → succeeded.
- CI runs the full integration suite on the PR.

## Follow-ups

- The unused `lineError` import in `bom.service.ts` (lint warning on `main`).
