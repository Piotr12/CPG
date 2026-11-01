# om-auto-fix-issue #278 — MRP replenishment proposals (E16-S01): spec

**Date:** 2026-10-31 19:29 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md`
**Status:** done

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
- 20:58 Sent the spec to a fresh-context reviewer; it reported back at about 22:35. It found nothing Critical or High; all of its two Medium and eight Low findings are folded in:
  - **Medium:** the recommendation's FK to the run cascades, so a Test reset by the previous image during a deploy still commits.
  - **Medium:** the benchmark seeds the worst-case lot rule (one proposal a day) and prints both row counts.
  - **Low:** the `roundUpToMultiple` test move, the app's `MrpPlanView` fixtures, the honest row bound of the `latest()` read, a generator check on seeded lot multiples, a report integration assertion, the kind names, and the `formatDecimal({ fixed: true })` formatter.
- 23:44 Folded in the review and ran `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts` after `npm ci`: 2 files, 7 tests passed. No mockups: the spec adds no screen element, only a help paragraph.
- 00:13 Opened the spec PR #312 (`review`, `documentation`, `skip-qa`, `priority-medium`, `risk-low`; `Refs #278`, no closing keyword). Posted the assumptions table on #312 and #278, the label rationale and a run summary. Handed the issue lock to `om-auto-implement-spec`, which runs on its own implementation PR, branched from `main`. Its execution plan under `.ai/pipeline/runs/` is that run's log.
- 2026-11-01 07:17 #313 is ready. Its gate is green: 100% coverage over 4,987 tests, lint, typecheck and build. The three touched integration files pass on a standalone build. A fresh-context code review approved, and its fixes are applied. The UI evidence is posted. The issue lock is released.

## Changes

- `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md`

## Verification

- Spec review by a fresh-context subagent: no Critical or High findings. Its two Medium and eight Low findings are folded in.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

## Follow-ups

- Merge #312 before #313. Then merge `main` into #313 and delete the spec's active copy (`tests/ai-filenames.test.ts` enforces it).
- #313 still needs CI's full integration suite and a human QA pass (`needs-qa`).
