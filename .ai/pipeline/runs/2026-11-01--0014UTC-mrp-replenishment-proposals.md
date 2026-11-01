# Execution plan — MRP replenishment proposals (E16-S01, #278)

**Date:** 2026-11-01 00:14 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md` (spec PR #312)
**Issue:** #278
**Status:** done

## Goal

Every MRP run sizes replenishment proposals: a purchase requisition for Buy and a production order for Make. One proposal goes on each day whose balance, after earlier proposals, falls below that day's safety target (zero when none). It is sized to the minimum lot and then to a whole lot multiple. The run stores the proposals, and the latest-run API lists them per plan.

## Scope

The spec's Implementation Plan, as written: the `roundUpToMultiple` move, the `sizing/` seam, the planning-parameter read, the `MrpRecommendation` table and migration, the run's write and read, the benchmark, the API and report integration tests, the help copy, the docs and the catalogue.

**Non-goals:** start dates, Late Supply and Beyond Horizon (E16-S02); exceptions (E16-S03); BOM explosion (E17); a proposal list on screen or acceptance (E18, E19); changing the demo generator's `lotFor`.

## Implementation Plan

Phase 1, engine (spec steps 1–5): primitive, types, lot quantity, sizing, `planMrp`.
Phase 2, loader and storage (spec steps 6–8): planning-parameter read, table and migration, the run's write and read, API view.
Phase 3, proof and paperwork (spec steps 9–11): benchmark, integration tests, help copy, compatibility, standards, catalogue, spec move.

## Risks

- The benchmark at ten times with the worst-case lot rule doubles the rows written (spec Risks). Measure it; never raise the budget.
- A new migration moves every migration count (lesson 2026-10-23).
- The integration suite needs Docker, which may be unavailable here. If so, run on a standalone build (lesson 2026-10-23).

## Log

- 00:14 Plan committed; draft PR #313 opened from `main`; the spec copied in from #312's branch and moved to `implemented/` at the end (lesson 2026-10-23, "Don't stack the implementation PR").
- Phase 1: a test fixture fed `parseDecimal("-3")`, which is `null` (it takes values of zero or more only), so 4 sizing tests failed on BigInt mixing; a signed helper fixed the fixture, not the code.
- Phase 2: the new migration moved every count the lesson lists. The `mrp-runs` up/down test now rolls back to the migration before it, the six rollback-by-count tests take one more `down()`, and the forecasts test's loop takes 23. Under this machine's load `write-gate.test.ts` timed out once in the full db run and passed alone.
- 3.1: the seeded worst-case lot rule alone proposed on about a tenth of the days, since stock and receipts keep balances up, so the worst case adds a 1,000 Open line per material per day (spec implementation notes). Ten times, worst case: 2,684 ms, 127 ms stall, 26,969 recommendations.
- 3.2: Docker is unavailable here, so the integration files ran against a local standalone build (lesson 2026-10-23): `smoke`, `mrp-run-api` and `mrp-report`, 3 files, 22 tests passed.
- Gate: lint 0; coverage 630 files, 4,987 tests, 100% branches/lines/functions/statements after dropping a dead `?? []` (324b8d1f); typecheck 0; build 0.
- Review: a fresh-context code review approved. Its Medium (the spec's two copies) follows the merge order from lesson 2026-10-23. Its two test gaps are fixed in e71b6e14, with a mutation check: 6 tests fail without the location filter. QA evidence (3 screenshots) and the review are posted on #313.

## Progress

PR: #313

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 Move roundUpToMultiple into decimal.ts — e94603fa
- [x] 1.2 Proposal and parameter types — 48a14302
- [x] 1.3 Lot quantity — dddbdfcb
- [x] 1.4 Size proposals — 50673430
- [x] 1.5 Wire sizing into planMrp — 663e78b1

### Phase 2: Loader and storage

- [x] 2.1 Planning-parameter snapshot read — 633d8335
- [x] 2.2 MrpRecommendation table and migration — 64b152e1
- [x] 2.3 Store and list proposals in the run service and API — 2eb3d820

### Phase 3: Proof and paperwork

- [x] 3.1 Benchmark with worst-case lots — 19e34249
- [x] 3.2 Integration tests — 1e40172f
- [x] 3.3 Help copy, compatibility, standards, catalogue and spec move — ffae1596
