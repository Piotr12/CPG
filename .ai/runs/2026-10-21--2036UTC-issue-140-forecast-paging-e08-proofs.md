# Issue #140 (E08-S04): page the forecast list, and prove three E08 scenarios

**Date:** 2026-10-21 20:36 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 140`
**Spec:** `.ai/specs/2026-10-21--2036UTC-forecast-paging-e08-proofs.md`
**Status:** in progress

## Goal
Page `GET /api/tenants/{tenant}/forecasts` and the forecasts screen by 100 (`?page=`, filters before paging), and add the missing tests for SAL-025/LFC-020, SAL-024 and AUD-001, updating `CPG-acceptance.md` (issue #140).

## Log
- 20:32 Feature route (label `feature`). FR triage: `ForecastService.list` has no paging (`forecast.service.ts:72`), no spec covers it, and no open PR references #140. `SDLC.md` has no Definition of Ready, so the ticket counts as ready. Base branch `main` (config `auto`). Claimed the issue.
- 20:34 Route: `om-auto-write-spec 140` on `spec/forecast-list-paging` (design-only PR), then `om-auto-implement-spec` on its own implementation PR (`Closes #140`), as for #95 (#132/#135).
- 20:36 Spec written with seven autonomous defaults, none marked for human confirmation. Paging design: scan the keys only, sort them by business IDs in code (the repo convention is no relation `orderBy`), then load only the page. Same pattern as the stock report.

- 20:42 Fresh-context spec review: verdict "revise, then proceed", six findings, all folded in. Changes: one partial read with no second `$in` query; the existing 120-row integration check rewritten; Q8 bounds the fixes a proof can pull in; AUD-001 is also proven through the API; the "fewer than 100" stop rule; one citation fixed.
- 2026-10-23 07:10 `om-auto-fix-pr 150`: merged `main` (incl. #163, Test starts tiny; Test still has 120 forecasts, since the dataset's forecast months don't depend on its history length). Spec review: no blocker or major. Fixed in the spec: INV-017 carries the same "not asserted yet (#140)" note as SAL-024 and is proven by the same test, so step 9 promotes it too; two citations corrected (the stock report's path, and `customer-orders.test.ts:175` after the merge moved the line).
- 20:44 No mockups or screenshots in the design PR. The screen reuses `PageLinks` unchanged (as on the purchase-order list). The implementation PR's browser QA carries the before/after screenshots.

## Plan
1. Spec, fresh-context spec review, design PR.
2. Implement phase 1 (service → schema/API → screen → docs → integration), then phase 2 (proof tests, catalogue). Run the gate, open the implementation PR, then review and QA.

## Changes

## Verification

## Follow-ups
