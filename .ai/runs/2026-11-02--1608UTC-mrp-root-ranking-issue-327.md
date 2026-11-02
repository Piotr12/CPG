# Issue #327: MRP ranks a Make proposal's component needs by their root requirement (om-auto-fix-issue, feature route)

**Date:** 2026-11-02 16:08 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task ff010b5a)
**Spec:** to be written (`om-auto-write-spec 327`)
**Status:** in progress

## Goal
Run `om-auto-fix-issue 327`: a component shortage that a Make proposal causes ranks by the requirement at its root (customer order, forecast, safety target), split by share, through every level, instead of the fixed rank 1 `planned-component` from #281's Q9.

## Log
- 16:08 Classified #327 as a feature (label `feature`). Its dependency #281 is merged (#325, #326). No PR references #327, and no spec covers it: #281's spec (`implemented/2026-11-01--1107UTC-mrp-bom-explosion.md`, Q9) names #327 as the follow-up. `rankShortages` still gives `planned-component` the fixed rank 1 (`packages/core/src/domain/mrp/priority/rank-shortages.ts:26`). `SDLC.md` has no Definition of Ready. So the route is F3c: `om-auto-write-spec 327`, then `om-auto-implement-spec`.
- 16:08 `origin/main` (2dc4ad75) still holds the active copy of #320's spec beside `implemented/`, so `tests/ai-filenames.test.ts` fails there. Open PR #350 deletes it. These branches delete it too, or merge `main` after #350 lands (lesson 2026-11-02).

## Changes

## Verification

## Follow-ups
