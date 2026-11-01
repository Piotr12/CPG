# om-auto-fix-pr 319 — merge main into MRP proposal acceptance

**Date:** 2026-11-01 09:34 UTC
**Agent:** Claude Code (cezar) / claude-opus-5-5, `om-auto-fix-pr`
**Spec:** `.ai/specs/implemented/2026-11-01--0737UTC-mrp-proposal-acceptance.md`
**Status:** done

## Goal
Drive PR #319 (accept a Buy MRP proposal, #287) to merge-ready. It was `CONFLICTING` with `main` after #316 (planning exceptions, #280) and #317 (proposal timing and demand priority, #279) merged.

## Log
- 09:34 Claimed #319 (assignee, `in-progress`, claim comment). Its branch was checked out in another cezar worktree, so this run worked on `cez/5b1711c3` reset to the PR head and pushed to `feat/mrp-proposal-acceptance`.
- Merged `origin/main`: 17 conflicted files. Resolved by keeping both sides:
  - migrations listed in name order: acceptance (075151) before lead time (075645) and exceptions (080923), as #317 did with its own earlier timestamp. All three are additive `add column` / `create table`. Counts raised to 40, and every rollback-by-count test reordered;
  - `mrp_recommendation` keeps `lead_time_days` and `accepted_document`; the latest-run read returns id, timing, executable and document;
  - help EN/PL: #279's timing sentences inserted into this PR's text, and both help tests kept;
  - docs (BACKWARD_COMPATIBILITY.md, engineering standards, lessons): both stories' entries.
- Seams after the merge (typecheck and unit tests):
  - the accepted-proposal view now carries timing;
  - the Make not-executable fixture needed an active BOM (#280 raises Missing BOM otherwise);
  - the migration tests assumed their migration was the last one; now they migrate to it by name, then up to the full schema for the `getUpdateSchemaSQL` check;
  - the spec PR #318's active copy came back with the merge; deleted, since `implemented/` holds it.
- Integration (Docker unavailable here, so a local standalone build on a fresh `DATA_DIR`): `mrp-run-api.test.ts` compared #279's late and far proposals exactly, and `mrp-accept-api.test.ts`'s Make refusal had no BOM; both fixed.
- Decision: spec Q3 expected #279 to move a requisition's date to the proposal's feasible date. Tried it: a Late Supply proposal accepted on its planned finish makes the pair's later proposal `MRP_PROPOSAL_STALE`, because #279 sizes proposals from their need date and planning again re-proposes the uncovered need. So the need date stays (no behaviour change). A regression test pins it, and the choice is filed as #322 for the owner.

- Fresh-context review of the merge (subagent, read-only): nothing lost in the conflicts; the migration order works on production (MikroORM runs any pending migration, whatever its name order). Fixed:
  - Medium: stale rule ignored timing, so it now also compares `plannedFinish`; a test fails without it;
  - Medium: the Proposals table hid Late Supply and Beyond Horizon, so the planned finish now shows under the need date (EN/PL, help, unit and integration tests);
  - Low: catalogue evidence still said no screen lists proposals;
  - Low: a migration test in production order.
  - Declined Nit: "restore the lesson's date"; `lessons.md` dates an extended lesson by its latest change.

## Changes
- `7590f289` merge of `main`; `335abd2d` Late Supply test, spec note, stale spec copy removed; `7f345ab2` review fixes (stale check on planned finish, Late/Beyond Horizon in the Proposals table, production-order migration test, docs).

## Verification
- `npm run lint` 0, `npm run typecheck` 0, `npm run build` 0.
- `npm run test:coverage` 0: 647 files, 5,153 tests, 100% statements, branches, functions and lines.
- Integration on a local standalone build: smoke, mrp-run-api, mrp-accept-api, mrp-accept, mrp-run, mrp-report, purchasing, purchasing-api: 8 files, 61 tests, all passed. After the review fixes: smoke, mrp-run-api, mrp-accept-api, mrp-accept, mrp-run, mrp-report, help: 7 files, 43 tests, all passed (5,157 unit tests, 100% coverage).
- CI: run 41294822943 (`335abd2d`) and run 41295560056 (`7f345ab2`) green, every job (lint, typecheck, build, unit tests, four integration shards).
- PR left in `review` + `needs-qa`: the pipeline can't approve its own PR; a human review and QA sign-off gate the merge (`om-approve-merge-pr 319`).

## Follow-ups
- #322: which date a Late Supply proposal's requisition should take.
