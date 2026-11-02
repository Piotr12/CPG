# Issue #327: MRP ranks a Make proposal's component needs by their root requirement (om-auto-fix-issue, feature route)

**Date:** 2026-11-02 16:08 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task ff010b5a)
**Spec:** `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md` (implemented copy on #356)
**Status:** done (merge gated on the owner's ⚠ decisions)

## Goal
Run `om-auto-fix-issue 327`: a component shortage that a Make proposal causes ranks by the requirement at its root (customer order, forecast, safety target), split by share, through every level, instead of the fixed rank 1 `planned-component` from #281's Q9.

## Log
- 16:08 Classified #327 as a feature (label `feature`). Its dependency #281 is merged (#325, #326). No PR references #327, and no spec covers it: #281's spec (`implemented/2026-11-01--1107UTC-mrp-bom-explosion.md`, Q9) names #327 as the follow-up. `rankShortages` still gives `planned-component` the fixed rank 1 (`packages/core/src/domain/mrp/priority/rank-shortages.ts:26`). `SDLC.md` has no Definition of Ready. So the route is F3c: `om-auto-write-spec 327`, then `om-auto-implement-spec`.
- 16:08 `origin/main` (2dc4ad75) still holds the active copy of #320's spec beside `implemented/`, so `tests/ai-filenames.test.ts` fails there. Open PR #350 deletes it. These branches delete it too, or merge `main` after #350 lands (lesson 2026-11-02).
- 16:10 Claimed #327 (assignee, `in-progress`, claim comment). Branch `spec/mrp-root-requirement-ranking` from `origin/main` in the cezar worktree, `npm ci`.
- 16:13 Wrote the spec autonomously: `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md`. 9 resolved assumptions. The trace (`pegProposals`) follows sizing: need dates, existing supply first, units no requirement takes rooted at the parent's target.
- 16:22 Fresh-context review: revise. Applied its fixes: pass 2 (provisional proposals) now serves only provisional needs, from what pass 1 never consumes, then the provisional proposals, since a pooled pass rooted a provisional proposal at a firm order its executable sibling covered; the sort key adds the provisional flag and merges equal keys (#283 allows two proposals on one pair and need date); the projection and `atRiskSupply` are kept for the trace. Q4 (an open document's share ranks 0) overturns the standards' "never put them at rank 0", so it is marked ⚠ for Piotr12, and the spec PR stays draft.
- 16:25 Spec PR #355 opened as a draft (Q4 ⚠), with labels and the defaults comment. No mockups: the change has no UI.
- 16:24–18:03 Implementation PR #356 (`om-auto-implement-spec` → `om-auto-create-pr`, plan `.ai/pipeline/runs/2026-11-02--1624UTC-mrp-root-requirement-ranking.md`).
  - Review (fresh context): changes requested. Tests that would pass broken, and executable surplus not re-rooted to provisional needs. Fixed; the re-review approves the code.
  - CI failed `mrp-run-timing.test.ts`'s ten-times worst case twice (stall 2,089, then 1,660 ms, against 1,500). Fixed by making a root a priority (kind and original date, ⚠ Q6 narrowed) and ranking shortages on first read. CI is green on b6d7b8c5, with a stall of 883 ms.
- 18:05 Released the #327 lock. #356 closes it on merge; #355 merges first.

## Changes
- Spec `.ai/specs/2026-11-02--1613UTC-mrp-root-requirement-ranking.md`, the stray active copy of #320's spec removed, this log (#355).
- Engine `packages/core/src/domain/mrp/` (trace, shared queue, split, ranking by root, lazy shortages), docs and a lesson (#356).

## Verification
- #356 on b6d7b8c5: `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (670 files, 5,571 tests, 100%), `npm run build` 0. CI is green on all 11 jobs. Integration shard 2 needed one rerun: `smoke.test.ts` read an empty admin title.
- #355: `tests/ai-filenames.test.ts` and `tests/spec-images.test.ts` pass; CI green.

## Follow-ups
- Piotr12 confirms Q4 (rank 0 for an open document's share) and the narrowed Q6 (a root is a priority, not a document), or answers otherwise.
- Merge #355 first, then merge `main` into #356 and delete the active spec copy (lesson 2026-11-02). Then mark #356 ready.
