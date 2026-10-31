# om-auto-fix-issue #278 — MRP replenishment proposals (E16-S01): spec

**Date:** 2026-10-31 19:29 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md`
**Status:** in progress

## Goal

Take #278 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. `om-auto-write-spec 278` writes the spec on a design-only spec PR, then `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 19:29 Triage. #278 is labelled `feature`, open and unassigned, and no PR mentions it. `SDLC.md` has no Definition of Ready, so the ticket-level check is skipped. Every dependency has merged: #273, #24, #274 and #275. `MrpResult.proposals` is still `[]` in `plan-mrp.ts`, and no `sizing/` folder exists. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-replenishment-proposals` from `origin/main` in the cezar worktree.
- 20:53 Read the context: lessons, the engineering standards' MRP bullets, the engine (`plan-mrp.ts`, `project-buckets.ts`, `safety-gap.ts`), the run service and its stored rows, the snapshot loader, `PlanningParameterSet`, `procurement.ts`, the demo generator's `lotFor`, the #275 and #284 specs, PRD §04 "Projection and safety stock" and "Parameters/precision", the data model's "MRP recommendation", and the acceptance rows MAT-016/017/025/026, MRP-009/030–033/045, DEM-023 and TRF-018.
- 20:54 Wrote the spec and answered the ten open questions with reversible defaults, recorded in the spec. The ones that shape the most code:
  - Q1: raise to the minimum first, then round up to a whole multiple (minimum 10, multiple 6, need 2 gives 12); the demo generator's `lotFor` stays as it is;
  - Q2: `sizing/` is the only module that turns a target into a requirement, and it reuses `safetyGap`;
  - Q3: proposals are stored in a new `MrpRecommendation` table, kept for the latest run only;
  - Q4: each plan in the latest-run API gains a `proposals` list.
- 21:00 Sent the spec to a fresh-context reviewer. It found nothing Critical or High; all of its two Medium and eight Low findings are folded in:
  - **Medium:** the recommendation's FK to the run cascades, so a Test reset by the previous image during a deploy still commits.
  - **Medium:** the benchmark seeds the worst-case lot rule (one proposal a day) and prints both row counts.
  - **Low:** the `roundUpToMultiple` test move, the app's `MrpPlanView` fixtures, the honest row bound of the `latest()` read, a generator check on seeded lot multiples, a report integration assertion, the kind names, and the `formatDecimal({ fixed: true })` formatter.
- 23:44 Ran `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts` after `npm ci`: 2 files, 7 tests passed. No mockups: the spec adds no screen element, only a help paragraph.
