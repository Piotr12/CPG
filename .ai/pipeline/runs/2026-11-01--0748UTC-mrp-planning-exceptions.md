# Execution plan — MRP planning exceptions (E16-S03, #280)

**Date:** 2026-11-01 07:48 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-01--0737UTC-mrp-planning-exceptions.md` (spec PR #314)
**Issue:** #280
**Status:** done

## Goal

Every MRP run raises three planning exceptions, each with a stable code, structured `params` and a fixed message: Missing Planning Parameters, Missing BOM and Invalid UoM Conversion. A pair with one of them gets no guessed proposal, while every unrelated material still plans. The run stores all its exceptions, Insufficient Transfer Stock included, and the latest-run API lists them per plan.

## Scope

The spec's Implementation Plan, as written:

- the BOM validity predicate, the exception codes and their order, and the per-pair decision (`replenishPair`);
- the readable snapshot loader and the BOM read;
- the `MrpRunException` table and its migration, and the run's write and read;
- the API integration test, the realistic-dataset count and the benchmark print;
- compatibility, standards, the catalogue and the spec move.

The active copy of #278's spec is deleted here too, as on #314, because `tests/ai-filenames.test.ts` fails on `main` without it.

**Non-goals:**
- inactive BOM components and the parent exception (E17-S02);
- listing exceptions on screen and their EN/PL texts (E18-S03);
- automatic-mode batches (E19-S03);
- reading the `MaterialConversion` table;
- changing the demo generator.

## Implementation Plan

- **Phase 1, engine** (spec steps 1–4): the BOM predicate, codes and types, `replenishPair`, and `planMrp`.
- **Phase 2, loader and storage** (spec steps 5–7): the readable seams and BOM read, the table and migration, and the run's write and read.
- **Phase 3, proof and paperwork** (spec steps 8–10): the integration test, the realistic count and benchmark, and the docs.

## Risks

- A new migration moves every migration count (lesson 2026-10-23).
- The BOM revision read's plan may walk the tenant (spec, Snapshot loader); pin it, and use the fallback if needed.
- Docker may be unavailable here; if so, run the integration files on a standalone build (lesson 2026-10-23).

## Log

- 07:48 Branched `feat/mrp-planning-exceptions` from `origin/main`. The spec is copied in from #314's branch, uncommitted, and moves straight to `implemented/` at the end (lesson 2026-10-23, "Don't stack the implementation PR").
- Phase 1 (to 07:54): the engine change reached only four existing tests. Two Make tests needed a BOM fixture. The transfer tests read their exceptions through `planTransferExceptions`, because pairs with no set now add Missing Planning Parameters. One test's order changed to material first (spec Q11). 182 + 11 new engine tests passed, and core typecheck and lint exited 0.
- Phase 2 (to 08:12):
  - **BOM read plan.** The current-revision read (`$or: [{ bom, number }]`, the production dialog's own shape) seeks `bom_revision` through its tenant index and tests the OR terms per row. That is the reviewer's predicted walk. It runs in SQLite and hydrates only current revisions. The `$in` fallback plans the same way (lesson 2026-10-31), so the observed plan is pinned in `mrp-snapshot.service.test.ts`.
  - **Column name.** The exception code column is `exception_code`, not `code`. In a tenant-owned table `code` means a business ID, and the Test reset's sequence test collected the new table as a sequence. The migration was regenerated before it was pushed (`Migration20261101080923_mrp_run_exceptions`).
  - **Line positions.** Customer-order lines are stored from position 0 and purchase-order lines from 1. `document` reports the stored position, as MRP's own firm demand does.
  - **Rollback test.** Its table list lacked `mrp_recommendation`, so the "rolled back" check could never fail. Both MRP tables are listed now.
  - **Realistic dataset.** A realistic Test run raises no exception (`test-reset.service.test.ts` prints `[]`).
- Phase 3 (to 08:17):
  - **#278's Make case.** Its integration case expected a production order for a Make pair with no BOM, which now raises Missing BOM. The test now creates a BOM; the new #280 case reads both exceptions back through the API.
  - **Integration files.** Docker is unavailable here, so they ran on a local standalone build (lesson 2026-10-23): `mrp-run-api`, `smoke`, `mrp-report-api` and `mrp-run`, 4 files and 22 tests passed, then `mrp-report`, 10 tests passed.
  - **Benchmark.** Realistic 234 ms with a 36 ms stall; ten times 2,544 ms with a 113 ms stall, storing 87 exceptions; the worst case at ten times 3,180 ms with a 143 ms stall. All are within the budgets: 1 s, 5 s and 250 ms.
  - **Catalogue.** MAT-017, MRP-034, MRP-035, MRP-036 and RUN-016 move to Partially verified. Their UI half (E18-S03) and automatic mode (E19-S03) are not asserted yet. MAT-023 and MRP-033 cite their new MRP evidence.
- Review (08:20–08:32): a fresh-context code review approved, with no Critical or High findings. f6bb0f77 fixes its Medium and four of its Lows:
  - a material with an unreadable row no longer reports Insufficient Transfer Stock;
  - an unreal cut-off date is reported (`beforeCutOff`), not sorted away;
  - a BOM revision with corrupt dates is left out;
  - the catalogue Evidence lines are re-pointed.

  The rest is filed as #321: SQL-ranged forecast and target dates, and the scaling of the BOM read.
- Gate after the fixes: lint 0, typecheck 0, build 0; coverage 637 files, 5,055 tests, 100% on all four measures. The fixes touch corrupt-data paths only, so the integration files weren't re-run locally; CI runs the full suite.

## Progress

PR: #316

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 BOM validity predicate shared with the production dialog — 07d969df
- [x] 1.2 Exception codes, order and input types — 721b4dd6
- [x] 1.3 Per-pair decision — 721b4dd6
- [x] 1.4 Wire exceptions into planMrp — 721b4dd6

### Phase 2: Loader and storage

- [x] 2.1 Readable snapshot seams and BOM read — acb0ec1a
- [x] 2.2 MrpRunException table and migration — bf6a8f02
- [x] 2.3 Store and list exceptions in the run service and API — 2393d6b2

### Phase 3: Proof and paperwork

- [x] 3.1 Integration test — 46120698
- [x] 3.2 Realistic dataset count and benchmark print — f52942a3
- [x] 3.3 Compatibility, standards, catalogue and spec move — d4800f05
