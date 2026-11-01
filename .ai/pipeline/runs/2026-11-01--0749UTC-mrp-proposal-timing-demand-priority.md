# Execution plan — MRP proposal timing and demand priority (#279)

Source doc: .ai/specs/implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md
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

## Log

- 2026-11-01:
  - Phases 1 to 4 landed.
  - Gate: lint, typecheck, `test:coverage` (633 files, 5,026 tests, 100%) and build, all green.
  - Docker is unavailable here, so the integration files ran against a standalone build (lesson 2026-10-23). `mrp-run-api` and `smoke` passed (13 tests); `mrp-report`, `mrp-report-api` and `mrp-run` passed (19 tests).
  - A fresh-context code review approved with four Low findings, all fixed:
    - requirements are added lowest priority first, so each tie-break key is tested;
    - the DEM-020 weekdays are corrected;
    - the shuffled-snapshot test now produces shortages;
    - the progress and benchmark are recorded, and the spec moved.

## Progress

PR: #317

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine timing
- [x] 1.1 daysBetween helper — 5490a1c3
- [x] 1.2 scheduleProposal — 5490a1c3
- [x] 1.3 MrpProposal types and SizedProposal — 5490a1c3
- [x] 1.4 planMrp timing — 5490a1c3

### Phase 2: Engine priority
- [x] 2.1 rankShortages — 9aae0d82
- [x] 2.2 planMrp shortages — 9aae0d82

### Phase 3: Storage, read, API
- [x] 3.1 leadTimeDays column and migration — 0b68aa9b
- [x] 3.2 Run write and read — 0b68aa9b
- [x] 3.3 Benchmark — figures in the spec's implementation notes

### Phase 4: Integration, docs
- [x] 4.1 Integration tests — 0819d910
- [x] 4.2 Copy, docs, catalogue, spec moved — 9e013fcd, review fixes
