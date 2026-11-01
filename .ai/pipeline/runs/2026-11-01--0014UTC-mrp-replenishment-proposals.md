# Execution plan — MRP replenishment proposals (E16-S01, #278)

**Date:** 2026-11-01 00:14 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-10-31--2054UTC-mrp-replenishment-proposals.md` (spec PR #312)
**Issue:** #278
**Status:** in progress

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

## Progress

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

- [ ] 3.1 Benchmark with worst-case lots
- [ ] 3.2 Integration tests
- [ ] 3.3 Help copy, compatibility, standards, catalogue and spec move
