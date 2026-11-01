# Drive PR #317 (MRP proposal timing and demand priority) to merge-ready

**Date:** 2026-11-01 08:57 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-pr` → `om-auto-review-pr --autofix`)
**Spec:** `.ai/specs/implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`
**Status:** in progress

## Goal

Make #317 mergeable without merging it. Bring it up to date with `main`, which gained #316 (MRP planning exceptions, #280) and #318 after the PR was opened. Review the merged diff, fix what it finds, and get CI green.

## Log

- Claimed #317 (assignee, `in-progress`, claim comment). The PR head is checked out in another cezar worktree, so this one works on a local `pr-317` branch that tracks `origin/feat/mrp-proposal-timing-demand-priority` and pushes to it.
- Merging `origin/main` conflicted in 10 files. Resolutions:
  - `sizing/size-proposals.ts`: #280 moved the raw-Make check into `replenishPair`, and #279 made sizing return a `SizedProposal` (no timing). Kept both, so sizing returns `SizedProposal[]` without the procurement check.
  - `sizing/replenish-pair.ts` (auto-merged, retyped): `Replenishment.proposals` is `SizedProposal[]`, because `planMrp` adds the timing.
  - `plan-mrp.ts`: `replenishPair` decides proposals or the exception. `planMrp` then times each proposal with `scheduleProposal` and puts its receipt on `plannedFinish` (none for Beyond Horizon), then runs `rankShortages`. The doc comment covers both stories.
  - Migrations: both PRs added one. They are kept in timestamp order: `…075645_mrp_recommendation_lead_time` (#279), then `…080923_mrp_run_exceptions` (#280, already in production). Production applies #279's migration after #280's. `mrp-recommendation-lead-time-migration.test.ts` already covers that order: it applies every other migration first, then the pending one.
  - Migration lists and rollbacks in `orm.test.ts`, `database.test.ts`, `transfer-reversal.entity.test.ts` and `mrp-recommendations-migration.test.ts` keep both entries. Both sides had raised the same counts from 37 to 38, so the auto-merge kept 38. Raised them to 39: `system-status.service.test.ts`, `smoke.test.ts`, three `getMigrationStatus` pairs in `orm.test.ts`, and the forecasts rollback loop (24 → 25).
  - `BACKWARD_COMPATIBILITY.md` and `engineering-standards.md`: kept both entries, E16-S02 before E16-S03. The #279 standards bullet now says `planMrp` times the proposals `replenishPair` returns.
  - `tests/integration/mrp-run-api.test.ts`: kept both `it` blocks.
- Seam fix: #279's MRP-038 test planned a Make proposal with no BOM. Since #280 that pair raises Missing BOM and gets no proposal, so the test now gives M1 an open-ended BOM.
- `tests/ai-filenames.test.ts` failed on the merged tree, and fails on `main` itself. #316 merged with #280's active spec copy still in `.ai/specs/`, and #315's squash re-added #279's. Deleted both active copies; the `implemented/` copies carry the implementation notes.
- Review of the merged seam, direction question: #280's Missing BOM checks BOM validity on the proposal's `needDate`. Its spec Q3 chose that date because it "is its planned finish until E16-S02 back-schedules", so an accepted proposal passes the production order's own check, which uses `plannedFinish` (`production-recipes.ts`). After #279, a late Make proposal finishes after its need date. Nothing accepts a Make proposal yet, and both specs' texts still hold, including the protected `MISSING_BOM` `date` = need date. Filed as a follow-up for the owner rather than changed here.

## Changes

- Merge commit of `origin/main` into `feat/mrp-proposal-timing-demand-priority`, with the conflict resolutions above.

## Verification

- (filled in below)

## Follow-ups

- Missing BOM's validity date versus a late proposal's `plannedFinish`: follow-up issue (link below).
