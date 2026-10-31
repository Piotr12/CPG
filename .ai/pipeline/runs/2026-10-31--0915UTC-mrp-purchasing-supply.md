# Execution plan — MRP purchasing supply (E15-S02, #276)

**Date:** 2026-10-31 09:15 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-31--0905UTC-mrp-purchasing-supply.md
Spec PR: #301 (design only; this branch carries the spec for reading and moves it to `implemented/` at close-out)
Issue: #276
Status: in-progress

## Goal

Every MRP run projects each Open purchase-order line's outstanding remainder as dependable supply and each Open requisition's unconverted remainder as tentative supply. Each lands at its document's location on its planned or required date, or today with an `overdue` flag when that date has passed. Nothing cancelled, closed early, completed, converted or already received is counted.

## Scope

As the spec's Implementation Plan says:
- the engine types and the pure `domain/mrp/supply/` seam, wired into `planMrp`;
- the snapshot read `services/mrp/snapshot/purchasing.ts`, wired into `load`;
- the timing benchmark;
- the `mrp` help paragraph in EN and PL;
- one API integration test;
- docs and the acceptance catalogue.

**Non-goals:**
- production orders and transfers (E15-S03);
- forecasts and safety targets (E15-S01);
- proposals (E16-S01) and exceptions (E16-S03);
- BOM feasibility (E17-S02);
- the report's supply columns and overdue marks (E18-S01/02);
- storing supply entries;
- any migration or new route.

## Implementation Plan

### Phase 1: Engine
1.1 Types: `MrpRequisition`, `MrpPurchaseOrderLine`, `MrpSupply`, `MrpPlan.supply`, with empty lists from the loader and fixtures.
1.2 Supply seam `supply/purchasing-supply.ts` (`purchasingSupply`, `compareSupply`) with its unit tests.
1.3 `planMrp` wiring, with one test per acceptance criterion of #276.

### Phase 2: Snapshot
2.1 `snapshot/purchasing.ts` (`readRequisitions`, `readPurchaseOrderLines`) and `load`, with real-SQLite tests and the query-plan test.
2.2 Timing benchmark with the spec's purchasing counts.

### Phase 3: Surface and evidence
3.1 The `mrp` help paragraph in EN and PL.
3.2 API integration test in `tests/integration/mrp-run-api.test.ts`.

### Phase 4: Close-out
4.1 Engineering standards, acceptance catalogue, lessons, spec to `implemented/`, and the full validation gate.

## Risks

- **Query plans.** The tenant filter adds joins. A plan test pins the status seek, the `(tenant, order)` seek and each join's `SEARCH`.
- **Stalls.** Line reads are capped at 10 orders, at most 1,000 rows each. The benchmark adds full 100-line orders.
- **Docker.** If Docker is unavailable here, the integration file runs against a local standalone server (`CPG_BASE_URL`); CI runs the image.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [ ] 1.1 Engine types and empty inputs
- [ ] 1.2 Purchasing supply seam
- [ ] 1.3 planMrp wiring and acceptance tests

### Phase 2: Snapshot

- [ ] 2.1 Purchasing snapshot read
- [ ] 2.2 Timing benchmark

### Phase 3: Surface and evidence

- [ ] 3.1 Help copy
- [ ] 3.2 API integration test

### Phase 4: Close-out

- [ ] 4.1 Docs, catalogue, spec to implemented, full gate
