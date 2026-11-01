# om-auto-fix-issue #280 — MRP planning exceptions (E16-S03): spec

**Date:** 2026-11-01 07:33 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-11-01--0737UTC-mrp-planning-exceptions.md`
**Status:** in progress

## Goal

Take #280 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 280` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 07:33 Triage. #280 is labelled `feature`, open and unassigned, and no PR mentions it. `SDLC.md` has no Definition of Ready, so the ticket-level check is skipped. Its dependency #278 merged as `d02bdf06`. No spec covers it. `sizeProposals` returns `[]` for a raw Make set, `planMrp` skips a pair without a set, every snapshot seam does `parseDecimal(…)!`, and the run stores no exception. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-planning-exceptions` from `origin/main` in the cezar worktree.
- 07:37 Read the context:
  - lessons and the engineering standards' MRP bullets;
  - the #278 spec and run log;
  - `plan-mrp.ts`, `mrp-inputs.ts`, `mrp-result.ts`, `sizing/`, `supply/transfers.ts` (#277's in-memory exception);
  - the snapshot service and every seam, `mrp-run.service.ts` and `mrp-run-view.ts`;
  - `resolveProductionOptions`, the BOM, planning-parameter and conversion entities, `decimal.ts` and `base-quantity.ts`;
  - the generator's planning pairs;
  - E18-S03 (#286), and the acceptance rows MAT-017, MAT-023, MRP-033…036 and RUN-016.
- 07:40 Wrote the spec. Answered the issue's three open questions and ten gaps with reversible defaults. The ones that shape the most code:
  - Q2: the Invalid UoM check covers the rows the snapshot reads and the factors stored on them, not the conversions table;
  - Q3: a Make proposal without an eligible BOM on its need date blocks the pair's proposals;
  - Q4: at most one of the three per pair, with Invalid UoM first;
  - Q6: a new `mrp_run_exception` table stores every code, transfers included;
  - Q7: each plan in the latest-run API gains `exceptions`.
- 07:41 Sent the spec to a fresh-context reviewer. It reported back at about 07:46 with one High finding, four Medium and six Low. All are folded in:
  - **High:** transfers check a source's balance against later transfers, so a row dropped at one site skewed other sites of the same material. Invalid UoM Conversion is now per material (Q4), which is also the issue's wording.
  - **Medium:** a raw Make set, or a set with bad lot data, is now Missing Planning Parameters whatever the need, with `reason` `raw-make` or `invalid-set` (Q1, Q5).
  - **Medium:** `code` is a string column, not an enum, so codes E17 adds need no table rebuild; unknown codes get a fallback message (Q6, Q7).
  - **Medium:** the BOM revision read's expected plan is pinned, and a fallback named.
  - **Low:** dates join the readability check, which runs after each seam's cut-off. BOM lines are corrupted by insert, because of `noUpdateTriggers`. Invalid UoM names its record and document (Q8). The isolation fixtures must not cross materials. The spec reuses `MrpPair` and moves the raw-Make guard.
- 07:47 Deleted the active copy of #278's spec, which was also in `implemented/`. That made `tests/ai-filenames.test.ts` fail on `main`, and #278's run log names it as a follow-up. `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

## Changes

- `.ai/specs/2026-11-01--0737UTC-mrp-planning-exceptions.md`
- `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md` deleted (its `implemented/` copy stays)

## Verification

- A fresh-context subagent reviewed the spec: one High, four Medium and six Low findings, all folded in.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

## Follow-ups
