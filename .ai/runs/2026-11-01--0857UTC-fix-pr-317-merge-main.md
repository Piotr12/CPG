# Drive PR #317 (MRP proposal timing and demand priority) to merge-ready

**Date:** 2026-11-01 08:57 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-pr` → `om-auto-review-pr --autofix`)
**Spec:** `.ai/specs/implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`
**Status:** done

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
- Review of the merged seam (own reading plus an independent reviewer, who rated it Major): #280's Missing BOM checked BOM validity on the proposal's `needDate`. Its spec Q3 chose that date because it "is its planned finish until E16-S02 back-schedules", so that an accepted proposal passes the production order's own check on `plannedFinish` (`production-recipes.ts`). After #279, a late Make proposal finishes after its need date:
  - a revision starting between the two raised a wrong Missing BOM and dropped the pair's proposals;
  - a revision ending between them let through a proposal its production order would refuse.
- Asked the owner first, because the protected `MISSING_BOM` `date` and message change. The owner said to proceed autonomously, so I fixed it here (`2c6b7163`). `replenishPair` times each proposal before the check and checks `plannedFinish`. The `date` is that day, and the message says "valid on the planned finish date" (precedent: #214's rewording). On-time proposals are unchanged. Two regression tests fail without the fix.
- Reviewer nit: the rollback comments are now in the order the rollbacks run (`add07f09`).
- UI QA (`om-auto-qa-pr`, evidence only) on the production build: Late Supply and Beyond Horizon in the Days view, the help paragraph, and the mobile viewport. 5 of 5 steps pass: https://github.com/Piotr12/CPG/pull/317#issuecomment-6555943118

## Changes

- `abcf4d69`: merge of `origin/main`, with the resolutions above.
- `add07f09`: rollback comments in order.
- `2c6b7163`: Missing BOM on `plannedFinish` (`replenish-pair.ts`, `plan-mrp.ts`, `exceptions/codes.ts`, tests, `BACKWARD_COMPATIBILITY.md`, standards, spec implementation note).
- This log and the lesson (seam: identical migration-count bumps, a spec premise broken by the merge).

## Verification

- On the merged tree with the fix, every command passed: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (640 files, 5,095 tests, 100% statements, branches, functions and lines) and `npm run build`.
- Docker isn't running on this machine, so the integration files ran against the production build (`next start`, empty `DATA_DIR`, all 39 migrations applied) with `CPG_BASE_URL`. `mrp-run-api`, `smoke`, `help`, `mrp-run`, `mrp-report` and `mrp-report-api` all passed: 6 files, 40 tests.
- CI on the PR head: see the PR's CI result comment.

## Follow-ups

- None filed: both review findings were fixed in this PR.
