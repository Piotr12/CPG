# Checkpoint 4 — Steps 3.1..3.4-review-fix (the timeline seeder, startup, reset)

**When:** 2026-10-21T13:57:10Z
**Commits:** 034e316..b826da6
**Touched areas:** `core/src/services/demo/seed-demo-data.ts` (timeline seeder), `core/src/demo-data.ts` + `app/src/instrumentation.ts` (startup), `TestResetService`, the container (`testTenantConfig`), the master services' seeds; 19 fixture files deleted; unit tests moved to `tests/setup/demo-fixtures.ts`. No page or component changed.

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass (exit 0) |
| `npm run lint` | ✅ pass (exit 0; pre-existing `bom.service.ts` warning only) |
| `npm run test:coverage` | ✅ 482 files, 3,248 tests pass; 100 % statements (9,867), branches (4,211), functions (3,286), lines (8,582) |
| `npm run build` | ✅ pass |
| Standalone production server, fresh `DATA_DIR` (Docker unavailable on this machine, lesson 2026-10-19) | ✅ migrations applied, then: "Seeded the Test tenant with its demonstration dataset in **9.0 s**: 26 materials, 4 locations, 10 customers, 6 suppliers, 48 planning parameter sets, 50 safety-stock targets, 16 BOMs, 120 forecasts, 4 stock openings, 589 customer orders, 640 shipments, 630 goods issues, 5 purchase requisitions, 466 purchase orders, 450 goods receipts, 390 production orders, 379 production completions"; `/up` → 200 |
| UI verification | skipped — no page or component changed in this window; every list is checked with the dataset at Step 4.4 |

Notes:
- 3.4-review-fix: the 3.4 executor had mocked the internal config module in the reset tests (AGENTS.md: mock only at boundaries). The configuration is now a container value (`testTenantConfig`), and tests register the two-month `REDUCED_TEST_TENANT_CONFIG` instead.
- The startup seed in the production build took 9.0 s, under the 15 s budget. The CI image is measured at Step 4.5.
