# Assert #306's purchasing-supply catalogue rows through the MRP report (#310)

**Date:** 2026-11-02 13:02 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue`)
**Spec:** none (follow-up of `.ai/specs/implemented/2026-10-31--0905UTC-mrp-purchasing-supply.md` and #309)
**Status:** done (PR open; CI pending)

## Goal

Issue #310: eleven catalogue rows (BUY-002, BUY-017, BUY-018, BUY-024, BUY-026, MRP-010, MRP-012, MRP-013, MRP-014, MRP-042, LFC-024) are Partially verified, with the engine half asserted in `plan-mrp.test.ts` and "the report screen that shows these figures is E18-S01 (#284)" left open. #309 shipped that screen and `GET …/mrp/runs/latest`. Assert each row's figures through both, and move a row only when every clause is asserted. Tests and catalogue only, no product change.

## Plan

- Classification: no defect and no new capability; a test and catalogue gap, labelled `documentation`. Taken on the bug chain (the skill's default), with the triage done inline: all eleven rows are still Partially verified on `main` at `ab0b20da`, and no integration test reads their scenarios through the report (only MRP-012's and MRP-013's/BUY-018's requisition halves, through the API, in `mrp-run-api.test.ts`).
- One new file, `tests/integration/mrp-report-supply.test.ts`, creating its own records in Prod (lesson 2026-10-25): one material per scenario at one plant, built through the API (orders, receipts, Close Early, cancellations, a date edit, a production order with its BOM), one MRP run, then for each scenario
  - the API: `GET …/mrp/runs/latest?material=…&location=…`, exact six-decimal figures on the days that matter and on every other day;
  - the screen: the MRP page's day table for the same pair, all 90 rows equal to the API's figures, and the key days read directly.
- MRP-042's "physical completion still waits for actual receipt": after the reads, a completion consuming the 40 is refused `INSUFFICIENT_STOCK`, and posts once the receipt does.
- Catalogue: update the eleven rows' Evidence and Status, and the Execution status paragraph.
- Verify: lint, typecheck, `test:coverage`, build, the new integration file against a local standalone server, CI.

## Log

- 13:02 UTC: claimed #310 (assignee, `in-progress`, claim comment); branch `fix/issue-310-supply-rows-mrp-report` from `origin/main` `ab0b20da`; `npm ci`.
- 13:06 UTC: no Docker on this machine, so the integration file ran against a local standalone server (lesson 2026-10-23). All 9 tests passed on the first run. `mrp-report`, `mrp-report-api` and `mrp-run-api` then passed on the same server with this file's records in place (37 tests).
- 13:07 UTC: all eleven rows moved to Passed (automated). Every Then clause is matched to an `expect`: the documents' states (PO lines, the requisition, the production order) are read back through the API, the figures are read through the API and on screen, and MRP-042's "physical completion waits for the receipt" is a refused completion (`INSUFFICIENT_STOCK`) that posts after the receipt. BUY-024's "allowed and audited" stays on the existing `goods-receipts` tests. None of the rows waited on E18-S02's marks, which merged in #324.
- 13:10 UTC: `test:coverage` failed only `tests/ai-filenames.test.ts`. #339 (spec) merged 18 s before #340 (implementation), and #340 still held the spec's active copy, so `main` at `ab0b20da` fails the test and its Deploy is red. Opened #347 off `main` to delete the active copy, and made the same deletion on this branch so its CI passes either way. Extended lesson 2026-11-02 "Close the paperwork in the PR that does the work".

- 13:40 UTC: an independent review found nothing blocking. Its should-fix: every Closed Early or cancelled fixture left nothing outstanding by arithmetic, so the tests would pass without MRP's status filters (lesson 2026-10-27). Added a Closed Early line whose 60 receipt is then reversed: received 0 and abandoned 40, so 60 is left by arithmetic and only the status keeps it out. Also from its nits: the screen check asserts the pair's heading, every plan has no at-risk, transfer or proposed supply, and the requisitions and the converted line are read back. Re-ran on a fresh local server: 9 passed.

## Changes
- `tests/integration/mrp-report-supply.test.ts` (new): one test per scenario, each asserting through `GET …/mrp/runs/latest` and on the MRP page's day table (all 90 rows equal to the API's figures).
- `.ai/specs/research/CPG-acceptance.md`: BUY-002, BUY-017, BUY-018, BUY-024, BUY-026, MRP-010, MRP-012, MRP-013, MRP-014, MRP-042 and LFC-024 → Passed (automated), with their Evidence; the Execution status paragraph.
- `.ai/specs/2026-11-02--1031UTC-mrp-automatic-mode.md` deleted (also #347).
- `.ai/lessons.md`: the paperwork lesson gains #340's case.

## Verification
- `npm run lint` → 0; `npm run typecheck` → 0; `npm run build` → 0.
- `npm run test:integration -- tests/integration/mrp-report-supply.test.ts` against a local standalone server → 9 passed.
- The same server, `mrp-report.test.ts mrp-report-api.test.ts mrp-run-api.test.ts` → 37 passed.
- `npm run test:coverage`: the first run failed one test (`ai-filenames`, the duplicate spec on `main`; 5,445 passed). After the deletion it exits 0: 665 files, 5,446 passed, 1 skipped, thresholds met.

## Follow-ups
- #347 must merge to unblock `main`'s deploy.
