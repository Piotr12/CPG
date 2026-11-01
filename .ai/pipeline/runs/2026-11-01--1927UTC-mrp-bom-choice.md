# Execution plan — MRP BOM choice (#282)

Source doc: .ai/specs/implemented/2026-11-01--1918UTC-mrp-bom-choice.md
Spec PR: #328 (design only)
Issue: #282
Engine: om-auto-create-pr (steps: 11, --loop: no)

## Goal

Implement the spec. Each Make proposal tests its valid BOMs in priority order at its lot-rounded quantity, against each component's lowest dependable balance from its planned start, with provisional needs left out. It takes the first usable BOM whose components are all covered, and records every BOM it passes over. When every valid BOM has an inactive component, the pair raises `MISSING_USABLE_BOM` and gets no proposal. When none can be supplied, the proposal raises `NO_FEASIBLE_BOM` and is exploded provisionally through the highest-priority usable BOM. Within a level, proposals claim components in E16-S02's order.

## Scope

- `packages/core/src/domain/boms/bom-validity.ts`: `isUsableRevision`.
- `packages/core/src/domain/mrp/`: `mrp-inputs.ts`, `mrp-result.ts`, `plan-mrp.ts`, `explosion/` (`choose-bom.ts` new, `explode-proposal.ts`), `projection/project-buckets.ts`, `sizing/replenish-pair.ts`, `exceptions/`, the `acceptance/` doc comment.
- `packages/core/src/services/`: `mrp/snapshot/boms.ts`, `production-orders/production-recipes.ts`, and the tests of the run, acceptance and timing.
- `packages/app`: the help copy (EN, PL) and fixtures.
- `BACKWARD_COMPATIBILITY.md`, the engineering standards, the acceptance catalogue and the integration test.

**Non-goals:**
- Storing rejections or the provisional mark, and moving a provisional receipt out of the balances (E17-S03, E18-S03).
- Accepting Make proposals (E19-S01).
- Any screen change.

## Implementation Plan

### Phase 1: Rules and inputs
1. `isUsableRevision`, used by `resolveProductionOptions` (spec step 1).
2. `MrpBom.inactiveComponents` replaces `componentsActive` (spec step 2).
3. Types, codes, messages and stored shapes (spec step 3).

### Phase 2: Engine
4. `lowestDependableBalance` (spec step 4).
5. `chooseBom`, and `explodeProposal` on the chosen BOM (spec step 5).
6. The Missing Usable BOM rule in `replenishPair` (spec step 6).
7. The per-level claim pass in `planMrp` (spec step 7).

### Phase 3: Service, benchmark, integration
8. Service tests on a real SQLite file (spec step 8).
9. Benchmark (spec step 9).
10. Integration test (spec step 10).

### Phase 4: Docs
11. Help copy, compatibility notes, standards, acceptance catalogue, spec notes (spec step 11).

## Risks

- Existing Make fixtures without component stock will now raise No Feasible BOM, so every changed expectation is explained.
- Timing budget: feasibility walks 90 days per candidate line.

## Log

- 19:27 Branched `feat/mrp-bom-choice` from `origin/main` and carried the spec straight into `implemented/` (lesson 2026-10-23). The spec PR #328 stays design-only.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rules and inputs

- [ ] 1.1 isUsableRevision
- [ ] 1.2 MrpBom inactiveComponents
- [ ] 1.3 Types, codes and stored shapes

### Phase 2: Engine

- [ ] 2.1 lowestDependableBalance
- [ ] 2.2 chooseBom and explodeProposal
- [ ] 2.3 replenishPair Missing Usable BOM
- [ ] 2.4 planMrp claim pass

### Phase 3: Service, benchmark, integration

- [ ] 3.1 Service tests
- [ ] 3.2 Benchmark
- [ ] 3.3 Integration test

### Phase 4: Docs

- [ ] 4.1 Copy, docs, catalogue, spec notes
