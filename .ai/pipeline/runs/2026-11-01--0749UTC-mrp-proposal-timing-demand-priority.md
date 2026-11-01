# Execution plan — MRP proposal timing and demand priority (#279)

Source doc: .ai/specs/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md
Spec PR: #315 (draft, design-only; Q2 and Q4 await confirmation)
Issue: #279
Engine: om-auto-create-pr (steps: 11, --loop: no)

## Goal

Implement the spec. Every MRP proposal gets a calendar-day planned start (never before today) and a feasible finish. Its receipt counts on the finish day, and it is flagged Late Supply with its lateness, or Beyond Horizon when it finishes after day 89. Each plan lists its uncovered requirements by type, divided by priority: open documents, then customer orders by original date, then forecast, then the safety target. The run stores each proposal's lead time, and the latest-run API returns the derived timing.

## Scope

- `packages/core/src/domain/demand/demand-buckets.ts`: `daysBetween`.
- `packages/core/src/domain/mrp/`: `mrp-result.ts`, `plan-mrp.ts`, `sizing/schedule-proposal.ts` (new), `sizing/size-proposals.ts` (drop `date`), `priority/rank-shortages.ts` (new).
- `packages/db`: `MrpRecommendation.leadTimeDays` and an additive migration.
- `packages/core/src/services/mrp/`: `mrp-run.service.ts`, `mrp-run-view.ts`.
- App fixtures, help copy (EN/PL), `BACKWARD_COMPATIBILITY.md`, engineering standards, the acceptance catalogue, and the integration test.
- Housekeeping: delete the active copy of #278's spec, which fails `tests/ai-filenames.test.ts` on `main` (also deleted on #315).

**Non-goals:**
- Beyond Horizon proposals for demand after day 89 (Q2).
- Storing typed shortages or exposing them in the API (Q4).
- Exceptions (#280), report marks (#285), BOM explosion (#281).

## Implementation Plan

### Phase 1: Engine timing
1. `daysBetween` in `demand-buckets.ts` with tests.
2. `sizing/schedule-proposal.ts` with tests (MAT-018, MRP-037, MRP-038, MRP-049, lead 0, day-89 and day-90 boundaries).
3. `MrpProposal` types; `SizedProposal`, with `sizeProposals` no longer setting `date`.
4. `planMrp` schedules each proposal, puts receipts on `plannedFinish` and skips Beyond Horizon, with criterion tests.

### Phase 2: Engine priority
5. `priority/rank-shortages.ts` with unit tests (DEM-018 to DEM-022, MRP-044, backlog, rank 0, invariant).
6. `planMrp` wiring into `MrpPlan.shortages`, with end-to-end tests.

### Phase 3: Storage, read, API
7. `MrpRecommendation.leadTimeDays` and its migration, with a migration test.
8. Run write and read, `MrpProposalView` fields, service, route and app fixture tests.
9. Benchmark re-run.

### Phase 4: Integration, docs
10. Integration cases in `tests/integration/mrp-run-api.test.ts`.
11. Help copy, `BACKWARD_COMPATIBILITY.md`, engineering standards, acceptance catalogue, spec to `implemented/`.

## Risks

- Migration generation may rebuild the table. Review the SQL, and hand-edit it to an `ALTER` if needed (lesson 2026-10-23).
- Docker may be unavailable locally. The integration tests then run against a standalone build (`CPG_BASE_URL`), as on #313.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine timing
- [ ] 1.1 daysBetween helper
- [ ] 1.2 scheduleProposal
- [ ] 1.3 MrpProposal types and SizedProposal
- [ ] 1.4 planMrp timing

### Phase 2: Engine priority
- [ ] 2.1 rankShortages
- [ ] 2.2 planMrp shortages

### Phase 3: Storage, read, API
- [ ] 3.1 leadTimeDays column and migration
- [ ] 3.2 Run write and read
- [ ] 3.3 Benchmark

### Phase 4: Integration, docs
- [ ] 4.1 Integration tests
- [ ] 4.2 Copy, docs, catalogue, spec moved
