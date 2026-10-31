# Execution plan — MRP projects open production orders and transfers

**Date:** 2026-10-31 09:15 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, `om-auto-fix-issue 277` → feature route (`om-auto-write-spec` → `om-auto-implement-spec` → `om-auto-create-pr`)
**Issue:** #277 (E15-S03) · **Spec PR:** #303
Source doc: .ai/specs/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md

## Goal

Make every MRP run count open production orders and open transfers. Each order adds its unproduced balance as dependable output on the finish day and its pinned BOM's components on the start day. Each transfer adds its in-transit receipt, and its undispatched part as far as the source can supply; any shortfall raises an Insufficient Transfer Stock exception. Overdue movements count today.

## Scope

- `packages/core/src/domain/production-orders/production-planning.ts`: `scaledMicro` (`bigint`), with `scaledRequirement` delegating to it.
- `packages/core/src/domain/mrp/`:
  - `mrp-inputs.ts`, `mrp-result.ts` and `plan-mrp.ts`;
  - `projection/project-buckets.ts`: `MrpLedger`, `dependableBalance`;
  - new `supply/production-orders.ts` and `supply/transfers.ts`;
  - tests for all of them.
- `packages/core/src/services/mrp/`: `mrp-snapshot.service.ts`, new `snapshot/production-orders.ts` and `snapshot/transfers.ts`, the loader tests, a query-plan test, one run test, and the timing fixture.
- `.ai/docs/engineering-standards.md`: extend the `domain/mrp/` bullet.
- The spec is added under `.ai/specs/implemented/` with implementation notes. Its active copy merges through #303.

**Non-goals:** storing exceptions or items (E16-S03, E18), requisition and purchase-order supply (E15-S02), forecasts and safety targets (E15-S01), at-risk orders (E17-S03), proposals (E16), any UI, route or migration.

## Implementation Plan

Phase 1 is the spec's steps 1–4 and Phase 2 its steps 5–10. The branch starts from `main`, not from the spec branch, as #299 did. The spec moves to `implemented/` in the final step; once #303 merges, merging `main` here deletes its active copy.

## Risks

- The 100% coverage gate: every branch of the new modules needs a test.
- Status-filter tests need fixtures that would leave a remainder without the filter (lesson 2026-10-27).
- Query plans for the new reads (lesson 2026-10-25): an extra index is the only allowed migration.

## Log

- 09:15 UTC — Plan has 10 steps, under the threshold of 20, so the plain engine applies.

- 09:40 UTC — Phase 1 landed. Deviations from the spec: no zero-need drop, because a BOM quantity is positive and rounds upward to at least 0.000001, so the branch can't be reached. The component read seeks `bom_component_revision_id_index`, not the `(revision, material)` unique; both seek by revision, so no migration.
- 10:05 UTC — Phase 2 landed. `planTransfers` returns `{ dispatches, receipts, exceptions }` and writes its own flows, as the spec's review asked. A first timing fixture spread recipe components over every site and inflated the ten-times run to 1,633 pairs (4.7 s, a 271 ms stall). With site-local components:
  - realistic: 43 pairs, 176 ms, 38 ms stall;
  - ten times: 433 pairs, 1.57 s, 74 ms stall;
  - baseline before this change: 300 pairs, 1.23 s, 56 ms.

  A lesson was added.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Production orders

- [x] 1.1 scaledMicro — e5cf59ee
- [x] 1.2 Production types — 4e6ec501
- [x] 1.3 Production seam in planMrp — 4e6ec501
- [x] 1.4 Production-order snapshot read — 766fa2e9

### Phase 2: Transfers

- [x] 2.1 Transfer types and dependable ledger — d910bafb
- [x] 2.2 Transfer seam in planMrp — d910bafb
- [x] 2.3 Transfer snapshot read — 45a6ab0c
- [x] 2.4 Run stores the new figures — 4829c7bd
- [x] 2.5 Timing fixture — f7e14396
- [x] 2.6 Docs and spec move — 6d75f003
