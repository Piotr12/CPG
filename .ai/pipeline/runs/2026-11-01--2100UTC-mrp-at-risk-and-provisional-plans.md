# Execution plan — MRP at-risk production and provisional plans (#283)

Source doc: .ai/specs/implemented/2026-11-01--2049UTC-mrp-at-risk-and-provisional-plans.md
Spec PR: #330 (design only)
Issue: #283
Engine: om-auto-create-pr (steps: 9, --loop: no)

## Goal

Implement the spec. An open production order whose pinned revision has an inactive component counts its unproduced balance as `atRiskSupply`, never dependable, raises `AT_RISK_PRODUCTION`, and blocks that much demand from a replacement. Every Make action that can't execute (no feasible BOM, or sized only for provisional demand) goes to a separate `provisional` list, never `proposals`, and books no receipt. Provisional actions are stored as `PROVISIONAL_PRODUCTION` rows in `mrp_run_exception` and read into each plan's `provisional`.

## Scope

- `packages/core/src/domain/mrp/`: `mrp-inputs.ts`, `mrp-result.ts`, `plan-mrp.ts`, `supply/production-orders.ts`, `sizing/` (`sizing-balance.ts` new, `replenish-pair.ts`), `exceptions/`, `provisional/` (new), the `acceptance/` doc comment.
- `packages/core/src/services/mrp/`: `snapshot/` (`inactive-materials.ts` new, `production-orders.ts`, `boms.ts`), `mrp-snapshot.service.ts`, `mrp-run.service.ts`, `mrp-run-view.ts`, and their tests, plus the timing test.
- `packages/app`: the help copy (EN, PL) and fixtures.
- `BACKWARD_COMPATIBILITY.md`, the engineering standards, the acceptance catalogue and the integration test.

**Non-goals:**
- Showing at-risk orders and provisional plans on screen (E18-S03).
- Accepting Make proposals or the automatic batch (E19-S01, E19-S03).
- Any schema change.

## Implementation Plan

### Phase 1: Inputs and types
1. `readInactiveMaterials`, and `MrpProductionOrder.inactiveComponents` (spec step 1).
2. Types, codes, messages, stored shapes (spec step 2).

### Phase 2: Engine
3. At-risk supply (spec step 3).
4. `sizingBuckets` and the two sizings in `replenishPair` (spec step 4).
5. The level loop (spec step 5).

### Phase 3: Service, benchmark, integration
6. Storage, read and service tests (spec step 6).
7. Benchmark (spec step 7).
8. Integration test (spec step 8).

### Phase 4: Docs
9. Help copy, compatibility notes, standards, acceptance catalogue, spec notes (spec step 9).

## Risks

- Many #281/#282 tests assert provisional proposals in `proposals` or their receipt in `projectedAfter`. Each changed expectation is explained.
- The two sizings may cost time on the ten-times benchmark.

## Log

- 20:44 `/om-auto-fix-pr 283` was asked, but #283 is an issue with no PR. Told to proceed autonomously, the run took the issue's own pick-up command, `om-auto-fix-issue 283` (feature route), and claimed the issue.
- 20:49 Spec written (`om-auto-write-spec`). A fresh-context review found nothing Critical. Its findings are folded in, and spec PR #330 is open.
- 21:00 Branched `feat/mrp-at-risk-and-provisional-plans` from `origin/main` and carried the spec straight into `implemented/` (lesson 2026-10-23). The spec PR #330 stays design-only. This plan is the run log.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Inputs and types

- [ ] 1.1 readInactiveMaterials and MrpProductionOrder.inactiveComponents
- [ ] 1.2 Types, codes, messages, stored shapes

### Phase 2: Engine

- [ ] 2.1 At-risk supply
- [ ] 2.2 sizingBuckets and the two sizings in replenishPair
- [ ] 2.3 The level loop

### Phase 3: Service, benchmark, integration

- [ ] 3.1 Storage, read and service tests
- [ ] 3.2 Benchmark
- [ ] 3.3 Integration test

### Phase 4: Docs

- [ ] 4.1 Help copy, compatibility notes, standards, acceptance catalogue, spec notes
