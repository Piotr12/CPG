# om-auto-fix-issue #281 — MRP explodes Make proposals through their BOMs, level by level (E17-S01): spec

**Date:** 2026-11-01 11:02 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-11-01--1107UTC-mrp-bom-explosion.md`
**Status:** done (both PRs are drafts, pending the owner's Q9 confirmation)

## Goal

Take #281 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 281` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 11:02 Triage. #281 is labelled `feature`, open and unassigned, and no PR mentions it. No spec covers it, and nothing in `packages/core/src/domain/mrp/` explodes a proposal (no `explosion/` seam yet). Its dependencies #278 (#313), #277 (#307) and #279 (#317) have merged. `SDLC.md` has no Definition of Ready, so the ticket-level check is skipped. Claimed the issue (assignee, `in-progress`, claim comment), ran `npm ci` in the cezar worktree and branched `spec/mrp-bom-explosion` from `origin/main`.
- 11:06 Read the context:
  - lessons, the engineering standards' MRP bullets and the issue;
  - the engine: `plan-mrp.ts`, `mrp-inputs.ts`, `mrp-result.ts`, `sizing/`, `supply/`, `projection/`, `priority/`, `exceptions/`;
  - `scaledMicro`, `findCycle`, `isRevisionValidOn`, `resolveProductionOptions`, the BOM service's cycle refusal;
  - the snapshot's `boms.ts` and `production-orders.ts`, `MrpRecommendation`, `MrpRunService`, the run view and the proposals table;
  - the #277, #278, #279, #280 and #287 specs (#277's transfer-ordering rule for E17-S01, #279's "rank exploded components by their root");
  - the acceptance rows BOM-006, BOM-007, MRP-020, MRP-027 to MRP-031 and MRP-047.
- 11:08 Wrote the spec and answered twelve questions with reversible defaults:
  - Q1, components are needed on the parent's `plannedStart` (E16-S02 has merged);
  - Q2, every Make proposal explodes;
  - Q3, low-level codes are taken over the current revisions of active BOMs;
  - Q4, the interim BOM choice: valid on the planned finish, all-active components first, then priority;
  - Q5, `bom` and `bomRevision` are stored in two nullable columns, listed in the API and shown in the proposals table;
  - Q6, exploded demand comes after transfers (#277's rule);
  - Q7, a new `BOM_CYCLE` exception, with no proposals on the cycle's Make pairs;
  - Q8, an unreadable active BOM line is reported, and its revision is left out.

  One is marked ⚠ for Piotr12. Q9 ranks exploded requirements at rank 1, beside customer orders, instead of by their root (#279's standing note); root ranking becomes a follow-up.
- 11:12 Sent the spec to a fresh-context reviewer. Verdict: revise, then proceed. It found nothing Critical. Its two High and ten Medium/Low findings are all folded in:
  - the accept answer gains the two fields;
  - the BOM-007 test example now actually rounds (0.333333 × 0.5);
  - the MRP-028 test asserts that no explosion happens, not that a timeout is hit;
  - `rankShortages` breaks ties by the parent's need date;
  - cycle paths are found per member over sorted edges;
  - Q4 prefers BOMs whose components are all active, as the dialog does;
  - Q8 reports the unreadable line instead of leaving it silent;
  - the types step moves before the explosion step;
  - an `EXPLAIN` pin covers the new line read;
  - the benchmark gets three thirds and no `Math.max` spread;
  - the deploy-window compatibility notes are added;
  - pair existence is stated for "needed or not".
- 11:17 `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

- 11:18 Opened spec PR #325 as a draft under the ⚠ guard. Labels: `review`, `documentation`, `skip-qa`, `priority-medium`, `risk-low`. Posted the assumptions table on #325 and #281, and handed the issue lock to `om-auto-implement-spec`.
- 11:19 Implementation PR #326, on `feat/mrp-bom-explosion` from `main`. The execution plan `.ai/pipeline/runs/2026-11-01--1119UTC-mrp-bom-explosion.md` is that run's log. The implementation renamed the exception `CYCLIC_BOM`, because the BOM service already uses `BOM_CYCLE` (review finding). The implemented copy of the spec records this.
- 11:58 #326 complete and reviewed. Its gate is green (5,199 tests, 100% coverage). It stays a draft under the same ⚠ guard. Swapped the issue's `in-progress` for `ci-monitoring` while #326's CI runs. Follow-up #327 filed for root ranking (Q9).

## Changes

- `.ai/specs/2026-11-01--1107UTC-mrp-bom-explosion.md` (new)

## Verification

- Spec review by a fresh-context subagent: nothing Critical. Its two High and ten Medium/Low findings are folded in.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

## Follow-ups

- Piotr12 to confirm Q9 on #325, or answer it otherwise (#327 tracks root ranking).
- Merge #325 before #326, then merge `main` into #326 and delete the spec's active copy before #326 merges.
- #326 needs a human QA pass (`needs-qa`).
