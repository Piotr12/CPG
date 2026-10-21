# Checkpoint 2 — Steps 2.1..2.7 (seed context: ledger, sales and purchasing seed paths)

**When:** 2026-10-21T13:21:12Z
**Commits:** 0ff1db5..60103f6
**Touched areas:** `core/src/services/stock/stock-posting.ts`, the customer-order, shipment, goods-issue, requisition, purchase-order and goods-receipt services (+ `shipment-usage.ts`), `services/demo/seed-demo-data.ts`, entity comments in `packages/db`. No UI.

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass (exit 0) |
| `npm run lint` | ✅ pass (exit 0; the pre-existing `bom.service.ts` warning only) |
| `npm run test:coverage` | ✅ 488 files, 3,240 tests pass; 100 % statements (9,902), branches (4,210), functions (3,298), lines (8,614) |
| UI verification | skipped — no UI touched in this window |

Notes:
- The group spanned 7 Steps (B: 2.1–2.4, C: 2.5–2.7), so this checkpoint covers both groups.
- Executor B noted that 2.2's commit alone left `test-reset.service.test.ts` red (it spied on the renamed method); fixed in 2.4's commit. Accepted: the range is green at 2.4 and after.
- No "today" rule exists in these paths: none refuses past dates. The seed path writes `updatedAt = at` exactly, so the seeder must feed non-decreasing times (the timeline is sorted by `at`).
- Tasks-table SHAs corrected to the pushed commits.
