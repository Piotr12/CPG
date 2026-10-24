# Make the E2E-020 reset test independent of the run's date (#200)

**Date:** 2026-10-24 17:00 UTC
**Agent:** Claude Code (Fable 5.1), `om-auto-fix-issue 200` under cezar
**Spec:** none (follow-up from #199's review; the catalogue row is `.ai/specs/research/CPG-acceptance.md` E2E-020)
**Status:** in progress

## Goal

E2E-020 in `tests/integration/test-reset-api.test.ts` picks an Open shipment from G1 (today's tiny dataset), posts a goods issue, resets Test, and asserts G2 has the same shipment. It fails with no product defect when the run crosses midnight UTC between the G1 setup and the reset, or when the seed day's tiny dataset has no Open shipment with quantity left. Make it independent of the run's date while keeping every clause of its catalogue Evidence line asserted.

## Log

- 17:00 UTC — Step 0/1 of `om-auto-fix-issue`: config loaded (`baseBranch: auto` → `main`, labels enabled, GitHub tracker). Concurrency check: current user `Piotr12` is the issue's only assignee; no `in-progress` label, no comments, no open PR references #200. Proceed.
- 17:02 UTC — Classified as corrective test work (`refactor` label, a flaky test): bug route, `fix/` branch. Reusing the cezar linked worktree (`cez/d0e23232`); `npm ci` run here (lesson 2026-10-19).
- 17:20 UTC — `om-verify-in-repo`: **proceed.** E2E-020 (`tests/integration/test-reset-api.test.ts:231-272`) picks the newest Open shipment from whatever Test generation is current, posts a goods issue, resets, and asserts at line 256 that G2 has that shipment with the same ID, status and `toIssue`. Both generations are `new Date()`'s dataset (`test-reset.service.ts:56`), so the assertion holds only when G1 and G2 were generated on the same UTC day. Nothing on `origin/main` changes that: no commit or PR mentions #200; PR #199 merged with the gap and filed it. Not reproduced (it needs a midnight crossing); inferred from the code.
- 17:25 UTC — `om-root-cause` brief:
  - **Summary:** E2E-020 compares two Test generations that are identical only when the server generated both on the same UTC day, which the test neither guarantees nor checks.
  - **Root cause:** `TestResetService.replace` seeds `generateTestTenantDataset(config, new Date().toISOString().slice(0, 10))` (`test-reset.service.ts:56`, `seed-demo-data.ts:48`): document IDs, statuses and quantities are a function of the config and the day. E2E-020 reads G1 from the generation the previous test (or the server's start, possibly another day) left, picks the newest Open shipment (the list is newest first, `shipment.service.ts:107`, so one of today's `shipment-today` documents, the most day-dependent ones), posts the G1 goods issue, resets, and compares. Across midnight UTC, G2 is another day's dataset: today's shipments differ and, at a month boundary, the anchor month changes and every ID shifts (`generate-dataset.ts:111`). The pick also assumes tiny has an unissued shipment on the seed day; `replay.test.ts` checks the realistic config over 2025–2026, nothing checks tiny for that.
  - **Files to change:** `tests/integration/test-reset-api.test.ts` (E2E-020 owns G1 and keeps G1, the issue and G2 within one UTC day, re-running that part once when the day changed); `packages/core/src/domain/demo/test-datasets.test.ts` (whole-window check: every day of 2025-01-01..2026-12-31 tiny has a shipment with no goods issue); `.ai/specs/research/CPG-acceptance.md` (E2E-020 Evidence, "Last updated"); `.ai/lessons.md`.
  - **Approach:** no product code (the issue is `refactor`; a seed-date parameter on the reset API would be a contract change for a test's sake). Wrap "reset → pick → correction → G1 issue → reset" in a helper that notes `today()` first and re-runs itself once if the day changed after the second reset; no run crosses midnight twice; the server shares the test's clock in CI and locally. The unit check follows lesson 2026-10-21 and mirrors `replay.test.ts`'s window.
  - **Risks:** the test clock stands in for the server's (a skewed remote clock could still fail loudly at midnight, never vacuously); one more tiny reset, ~1.5 s; 730 tiny generations in the unit check (the realistic check runs in < 30 s); the Evidence line must keep every clause asserted.

- 17:35 UTC — `om-fix`: claimed #200 (assignee `Piotr12`, `in-progress`, claim comment). Edits: E2E-020 owns G1 and runs its two resets under `withinOneDay` (`tests/integration/test-reset-api.test.ts`); a two-year tiny-dataset check in `packages/core/src/domain/demo/test-datasets.test.ts`; the E2E-020 Evidence and "Last updated" in `CPG-acceptance.md`; a lesson. Branch `fix/issue-200-e2e-020-date-independent` off `main` at `d4097577`, in the cezar worktree (the pattern of #199).
- 17:50 UTC — Whole-window measurement (scratch test, deleted): on all 730 days of 2025-01-01..2026-12-31 the tiny dataset has 4–10 shipments with no goods issue, and 59–84 shipments in total (one page), in 634 ms. The committed check asserts "at least one unissued shipment" per day.

## Changes

- `tests/integration/test-reset-api.test.ts` — `withinOneDay(run)`; E2E-020 resets first (G1 is its own), posts the G1 goods issue and resets to G2 inside that guard; every earlier assertion kept.
- `packages/core/src/domain/demo/test-datasets.test.ts` — "leaves tiny an Open shipment with nothing issued on it on every day of 2025 to 2027" (the window reaches a year past today's, so the runs of the coming year are covered; a one-line loop instead of a copied `days` helper, after self-review).
- `.ai/specs/research/CPG-acceptance.md` — E2E-020 Evidence names the same-day guarantee and the window check; "Last updated" line.
- `.ai/lessons.md` — one bullet under Integration tests.
- This run log.

## Verification

- `npm run lint`: exit 0 (0 errors, 1 pre-existing warning in `bom.service.ts`).
- `npm run typecheck`: exit 0.
- `npx vitest run packages/core/src/domain/demo/test-datasets.test.ts`: 4 passed in 0.66 s.
- `npm run test:coverage`, first run: 3,860 of 3,861 tests passed; the one failure is `auth.service.test.ts` "throttles a client that sprays usernames" at its 5 s timeout (the flake #199 also saw; unrelated to this diff). Re-run below.
- `npm run build`: exit 0 ("Compiled successfully", 103 static pages).
- Integration, Docker unavailable here: the standalone build copied to a fresh directory, `node packages/app/server.js` on 127.0.0.1:3200 with a fresh `DATA_DIR`, `KEEP_ALIVE_TIMEOUT=3600000` (startup seed 1.5 s: 84 shipments, 75 goods issues). `CPG_BASE_URL=… npm run test:integration -- tests/integration/test-reset-api.test.ts`: 5 passed in 17.8 s, E2E-020 included.
- After the self-review edit (the window check's loop), on the final tree: `npm run lint` exit 0 (0 errors, the same warning), `npm run typecheck` exit 0, `npm run test:coverage` exit 0 with 3,861 tests in 531 files at the 100% thresholds. The build is unaffected by a test-file edit, so it was not re-run.

## Follow-ups
