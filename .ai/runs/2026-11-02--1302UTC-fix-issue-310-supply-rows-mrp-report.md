# Assert #306's purchasing-supply catalogue rows through the MRP report (#310)

**Date:** 2026-11-02 13:02 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue`)
**Spec:** none (follow-up of `.ai/specs/implemented/2026-10-31--0905UTC-mrp-purchasing-supply.md` and #309)
**Status:** in progress

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

## Changes

## Verification

## Follow-ups
