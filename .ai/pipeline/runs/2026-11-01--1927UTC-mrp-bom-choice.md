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
- 19:42 The benchmark showed every Make proposal provisional, first misread as Q1's window at work and sent to the owner as a decision (corrected below). The worst-case stall rose from `main`'s 213 ms (measured in a throwaway `main` checkout on the same machine) to 309 ms. Caching `lowestDependableBalances` per component and yielding after the engine and the deletes brought it to 171 ms.
- 19:45 Phases 1 and 2 landed in one commit: the inputs, types, choice and loop are coupled, and the suite stays red between them. #281's explosion fixtures had no component stock, so they now assert provisional needs and `NO_FEASIBLE_BOM`.
- 19:49 Docker unavailable, so the integration files ran against a standalone build: `mrp-run-api` (15) and the other MRP and production-order files (38) passed.

- 20:05 Review: no code defects; the documentation fixes are in (`0a8c25ed`). Spec PR #328 was merged by Piotr12 at 19:45, so `main` is merged in and the active spec copy dropped.
- 20:20 Asked to continue autonomously. Tracing one rejection showed the all-provisional result came from the fixture, not Q1: every open order line is of an even material, so even components are short from day 0. A lead-time window was tried and reverted. Q1 stays the issue's proposal, the ⚠ is withdrawn, and the fixture now exercises fallbacks and claims at the realistic size.

## Progress

PR: #329

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rules and inputs

- [x] 1.1 isUsableRevision — 8d8ed908
- [x] 1.2 MrpBom inactiveComponents — 8d8ed908
- [x] 1.3 Types, codes and stored shapes — 8d8ed908

### Phase 2: Engine

- [x] 2.1 lowestDependableBalance — 8d8ed908
- [x] 2.2 chooseBom and explodeProposal — 8d8ed908
- [x] 2.3 replenishPair Missing Usable BOM — 8d8ed908
- [x] 2.4 planMrp claim pass — 8d8ed908

### Phase 3: Service, benchmark, integration

- [x] 3.1 Service tests — 68066402
- [x] 3.2 Benchmark — 8d8ed908
- [x] 3.3 Integration test — 68066402

### Phase 4: Docs

- [x] 4.1 Copy, docs, catalogue, spec notes — 07c15ac6

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
- `npm run test:coverage`: 655 files, 5,293 tests passed. Statements 100% (13,232/13,232), branches 100% (6,043/6,043).
- Integration against a standalone build: `mrp-run-api` 15 passed; `mrp-accept`, `mrp-accept-api`, `mrp-report`, `mrp-report-api`, `mrp-run` and `production-orders` 38 passed.
