# Execution plan — MRP BOM explosion (#281)

Source doc: .ai/specs/implemented/2026-11-01--1107UTC-mrp-bom-explosion.md
Spec PR: #325 (draft, design-only; Q9 awaits confirmation)
Issue: #281
Engine: om-auto-create-pr (steps: 12, --loop: no)

## Goal

Implement the spec. MRP plans materials level by level. Every Make proposal explodes through the highest-priority BOM valid on its planned finish, preferring one whose components are all active. Each component needs the scaled quantity, rounded up once, on the parent's planned start at the same location, netted once in its single projection with open production orders' needs. Production-order proposals carry `bom` and `bomRevision`, which are stored, listed in the API and shown in the proposals table. A stored BOM cycle raises `BOM_CYCLE` on its members' Make pairs, with no proposal there, and everything else still plans.

## Scope

- `packages/core/src/domain/mrp/`: `mrp-inputs.ts`, `mrp-result.ts`, `plan-mrp.ts`, `explosion/` (new), `sizing/replenish-pair.ts`, `priority/rank-shortages.ts`, `exceptions/`.
- `packages/core/src/services/mrp/`: `snapshot/boms.ts`, `mrp-snapshot.service.ts`, `mrp-run.service.ts`, `mrp-run-view.ts`, `mrp-acceptance.service.ts`.
- `packages/db`: `MrpRecommendation.bom` and `bomRevision`, with an additive migration.
- `packages/app`: the proposals table's BOM line (EN, PL), the help copy, and fixtures.
- `BACKWARD_COMPATIBILITY.md`, the engineering standards, the acceptance catalogue and the integration test.

**Non-goals:**
- Feasibility-based BOM choice, rejection explanations, the parent exception (E17-S02).
- At-risk production and provisional plans (E17-S03).
- Root ranking of exploded requirements (Q9 follow-up).
- Showing the explosion (E18-S03).
- Accepting Make proposals.

## Implementation Plan

### Phase 1: Inputs and types
1. `MrpBom` gains `bom`, `revision`, `priority`, `componentsActive` and `components`. `readBoms` reads lines, reports unreadable lines at the output's Make sites, and leaves their revision out, with snapshot tests and an EXPLAIN pin.
2. Types: `MrpProposal.bom`/`bomRevision`, `MrpPlan.plannedComponentDemand`, `MrpBomCycle`, `BOM_CYCLE` code, message and stored shape.

### Phase 2: Engine
3. `explosion/bom-levels.ts` with tests.
4. `explosion/explode-proposal.ts` with tests.
5. `replenishPair`: the BOM Cycle check, with tests.
6. `planMrp`: the level loop, with a test per criterion.
7. `rankShortages`: `planned-component` at rank 1, with tests.

### Phase 3: Storage, read, API, UI
8. Columns, migration, write and read, accept answer, with tests.
9. Benchmark fixture with two exploding levels.
10. Proposals table BOM line (EN, PL), with tests.

### Phase 4: Integration, docs
11. Integration cases in `tests/integration/mrp-run-api.test.ts`.
12. Help copy, `BACKWARD_COMPATIBILITY.md`, engineering standards, acceptance catalogue, root-ranking follow-up issue, spec implementation notes.

## Risks

- Migration generation may rebuild the table. Review the SQL, and hand-edit it to `ALTER`s if needed (lesson 2026-10-23).
- Explosion changes Test dataset runs and every existing Make fixture, so pinned counts move. Explain each moved figure.
- Docker may be unavailable locally. The integration tests then run against a standalone build (`CPG_BASE_URL`), as on #313 and #317.
- Spec PR #325 must merge before this PR. Then merge `main` here and delete the spec's active copy, before this PR merges (lesson 2026-11-01).

## Log

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Inputs and types

- [ ] 1.1 MrpBom lines and the snapshot read
- [ ] 1.2 Types, BOM_CYCLE code and stored shape

### Phase 2: Engine

- [ ] 2.1 bomLevels
- [ ] 2.2 explodeProposal
- [ ] 2.3 replenishPair BOM Cycle check
- [ ] 2.4 planMrp level loop
- [ ] 2.5 rankShortages planned-component

### Phase 3: Storage, read, API, UI

- [ ] 3.1 Columns, migration, write and read
- [ ] 3.2 Benchmark
- [ ] 3.3 Proposals table BOM line

### Phase 4: Integration, docs

- [ ] 4.1 Integration tests
- [ ] 4.2 Copy, docs, catalogue, follow-up, spec notes
