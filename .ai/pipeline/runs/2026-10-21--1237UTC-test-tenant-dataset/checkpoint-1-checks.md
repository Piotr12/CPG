# Checkpoint 1 — Steps 1.1..1.6 (Phase 1: config and generator)

**When:** 2026-10-21T13:11:15Z
**Commits:** 6cdb5f7..81c37bd
**Touched areas:** `packages/core/src/domain/demo/` (new, pure; no database, no UI)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass (exit 0) |
| `npm run lint` | ✅ pass (exit 0; 1 pre-existing warning in `services/boms/bom.service.ts`, untouched) |
| `vitest run --coverage packages/core/src/domain/demo` (coverage scoped to `domain/demo/**`) | ✅ 9 files, 91 tests pass; 100 % statements (784), branches (255), functions (261), lines (614) |
| Every-day replay (2025-01-01 … 2026-12-31, 730 generations) | ✅ no negative balance, under limits; ~3.5 s |
| UI verification | skipped — no UI touched in this window |

Generator summary for 2026-10-21: 589 customer orders, 640 shipments, 630 goods issues, 5 requisitions, 466 purchase orders (4 top-ups), 450 receipts, 390 production orders, 379 completions, 4 openings, 3,748 movements (documents 3,549 / 5,000; movements 3,748 / 7,000).

Note: the executor recorded pre-amend SHAs in the Tasks table; this checkpoint corrected them to the pushed commits.
