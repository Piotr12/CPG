# Checkpoint 3 — Steps 2.8..2.11 (Phase 2 close: production seed paths, stock opening, master seeds)

**When:** 2026-10-21T13:29:35Z
**Commits:** 002997f..3aed882
**Touched areas:** production-order and completion services; `StockService.seedDemo(lines, at)`; the master services' `seedDemo(rows, at?)` (materials, named records, planning parameters, safety stock, BOMs, forecasts). No UI.

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass (exit 0) |
| `npm run lint` | ✅ pass (exit 0; pre-existing `bom.service.ts` warning only) |
| `npm run test:coverage` | ✅ 488 files, 3,253 tests pass; 100 % statements (9,911), branches (4,238), functions (3,304), lines (8,619) |
| UI verification | skipped — no UI touched in this window |

Notes:
- BOM validity is judged at the order's own `plannedFinish`; a planned start before `validFrom` is allowed (a test covers it). The generator's finishes are all ≥ the history start.
- Masters with `createdAt`: Material, Location, Customer, Supplier, Bom, BomRevision; planning parameters, safety-stock targets and forecasts have none, so their `seedDemo` takes rows only.
- Tasks-table SHAs corrected to the pushed commits.
