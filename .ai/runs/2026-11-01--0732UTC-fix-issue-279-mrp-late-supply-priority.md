# om-auto-fix-issue #279 — MRP timing, Late Supply, Beyond Horizon and demand priority (E16-S02): spec

**Date:** 2026-11-01 07:32 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`
**Status:** done (both PRs are drafts, pending the owner's Q2/Q4 confirmation)

## Goal

Take #279 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 279` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 07:32 Triage. #279 is labelled `feature`, open and unassigned, and no PR mentions it. No spec covers it. Its dependencies #278 (#313) and #275 (#308) have merged. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-late-supply-priority` from `origin/main` in the cezar worktree.
- 07:38 Read the context:
  - lessons, the engineering standards' MRP bullets and the issue;
  - the engine: `plan-mrp.ts`, `mrp-result.ts`, `sizing/`, `projection/`, `demand/`;
  - `plannedStart` and `addDays`, `MrpRecommendation`, `MrpRunService` and its view;
  - the #278 spec, the integration test, the help copy;
  - PRD §04 "Overdue demand and priority", "Overdue and late starts" and the closure defaults;
  - the data model's MRP rows;
  - the acceptance rows MAT-018, MRP-004/037/038/044/049 and DEM-018 to DEM-022.
- 07:45 Wrote the spec and answered twelve questions with reversible defaults:
  - Q1, day-by-day priority with a backlog queue;
  - Q3, priority divides the after-proposal balance;
  - Q6, one additive `lead_time_days` column, with the timing derived through `scheduleProposal`;
  - Q7, four additive API fields;
  - Q9, timing moves receipts, not sizing.
  Two are marked ⚠ for Piotr12. Q2: an order due on day 90 gets no Beyond Horizon proposal, which follows PRD §04 but drops half of the issue's MRP-004 criterion. Q4: the typed shortages stay in the engine result, with no user channel yet.
- 07:50 Sent the spec to a fresh-context reviewer. Verdict: revise lightly, then proceed. It found nothing Critical or High. The arithmetic of every criterion and the queue invariant check out. All of its two Medium and six Low findings are folded in:
  - the Q2 rationale corrected (the day-90 line is in the snapshot; supply past day 89 isn't);
  - Q4 added to the confirmation list;
  - the queue key made total (kind before document, `compareCodes`);
  - rank 0 limited to open documents, with E17 ranking by root;
  - the MRP-049 test made to fail without the fix;
  - the previous image's start date documented;
  - the over-buy of late lots acknowledged;
  - scheduling moved into `planMrp`, and priority into a `priority/` seam.
- 08:48 `tests/ai-filenames.test.ts` failed on `main` itself. #312 and #313 both merged, and #278's spec kept its active copy beside `implemented/`. Deleted the active copy on this branch, so every later PR's CI passes that check.
- 08:55 Opened spec PR #315 as a draft, under the ⚠ guard. Labels: `review`, `documentation`, `skip-qa`, `priority-medium`, `risk-low`. Posted the assumptions table on #315 and #279, and handed the issue lock to `om-auto-implement-spec`. Its CI is green.
- 09:00 Implementation PR #317, on `feat/mrp-proposal-timing-demand-priority` from `main`. The execution plan `.ai/pipeline/runs/2026-11-01--0749UTC-mrp-proposal-timing-demand-priority.md` is that run's log.
  - Gate: 5,026 tests at 100% coverage, lint, typecheck and build, all green.
  - Docker is unavailable here, so 5 integration files ran on a standalone build: 32 tests passed.
  - A fresh-context code review approved, and its four Low findings are fixed.
  - Kept as a draft under the ⚠ guard. Labels: `review`, `feature`, `needs-qa`, `priority-medium`, `risk-medium`.
  - Swapped the issue's `in-progress` for `ci-monitoring` while #317's CI runs.

## Changes

- `.ai/specs/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md` (new)
- `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md` deleted (the active copy of an implemented spec)

## Verification

- Spec review by a fresh-context subagent: no Critical or High findings. Its two Medium and six Low findings are folded in.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed (1 failed before the stale copy was deleted).

## Follow-ups

- Piotr12 to confirm Q2 (no Beyond Horizon proposal for demand after day 89) and Q4 (typed shortages engine-only) on #315.
- Merge #315 before #317, then merge `main` into #317 and delete the spec's active copy.
- #317 needs a human QA pass (`needs-qa`).
