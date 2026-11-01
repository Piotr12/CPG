# om-auto-fix-issue #282 — MRP picks the highest-priority feasible BOM after lot rounding (E17-S02): spec

**Date:** 2026-11-01 19:10 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-11-01--1918UTC-mrp-bom-choice.md`
**Status:** done (spec merged as #328; implementation on #329)

## Goal

Take #282 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 282` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR, branched from `main` (lesson 2026-10-23, "don't stack"). This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 19:10 Triage. #282 is labelled `feature`, open and unassigned, and no PR references it. No spec covers it: #281's spec names it as the replacement of its interim BOM choice (Q4), and nothing in `packages/core/src/domain/mrp/` tests feasibility. Its dependencies #281 (#326) and #276 have merged. `SDLC.md` has no Definition of Ready, so the ticket-level check is skipped. Claimed the issue (assignee, `in-progress`, claim comment), ran `npm ci` in the cezar worktree and branched `spec/mrp-bom-choice` from `origin/main`.
- 19:12 Read the context: lessons, the engineering standards' MRP bullets, #281's spec, #283's issue (to keep the provisional plan out of scope), the acceptance rows, and the engine: `plan-mrp.ts`, `replenish-pair.ts`, `size-proposals.ts`, `schedule-proposal.ts`, `explode-proposal.ts`, `project-buckets.ts`, `rank-shortages.ts`, `transfers.ts`, `exceptions/`, the run service's storage and `resolveProductionOptions`.
- 19:18 Wrote the spec with eleven questions answered by reversible defaults. Main calls:
  - Q1 takes the issue's proposal, the lowest dependable balance from the start through day 89. A start-day balance would let a later-tested, earlier-starting proposal undercut a feasible choice across levels.
  - Q2 uses two codes: `MISSING_USABLE_BOM` per pair, stopping proposals as Missing BOM does, and `NO_FEASIBLE_BOM` per infeasible proposal, which is kept.
  - Q4 explodes an infeasible proposal provisionally through the highest-priority usable BOM (BOM-011) and leaves provisional needs out of later feasibility tests. E17-S03 owns keeping that chain apart from supply.
  - Q6 keeps rejections engine-only, with the stored exceptions naming the missing components, so there is no schema change.
  - No assumption is marked ⚠.
- 19:20 Sent the spec to a fresh-context reviewer for the scope-cohesion check.
- 19:28 The review found nothing Critical: 3 High, 3 Medium and 5 Low findings, all folded in.
  - H1: across levels the higher level claims first, which criterion 12 can't override. This is now Q12, with the ranking mismatch stated. It is not marked ⚠: undoing it needs an iterative replan, a later story's design.
  - H2: the provisional mark covers only direct needs. This is stated as E17-S03's known limit, and the MRP-026 test now uses independent demand.
  - H3: the compatibility rule "any exception but `INSUFFICIENT_TRANSFER_STOCK` has `proposals: []`" is amended explicitly.
  - M2: the `missing` notation carries required, available and shortage, using the dialog's field names.
  - M3: changed test expectations are budgeted.
  - L1 to L5: the forecast note, the row volume in the benchmark, `provisional` kept out of `MrpPlan`, the step-2 build break, and the extra tests.

- 19:45 Piotr12 merged the spec PR #328. The implementation's benchmark then showed Q1's window making every Make proposal provisional on forecast-heavy data. Q1 was briefly marked ⚠ on #329, then withdrawn once the cause turned out to be the fixture. The spec PR's own update was held back by the push gate, because the PR had already merged.

## Changes

- `.ai/specs/2026-11-01--1918UTC-mrp-bom-choice.md` (new)
- this run log

## Verification

- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: passed.

## Follow-ups
- Q1's ⚠ was withdrawn on #329: the benchmark result behind it came from the fixture, not the rule.
- E17-S03 (#283): store the provisional mark, take provisional output out of the balances, and carry the mark down a level (spec Q4's known limit).
