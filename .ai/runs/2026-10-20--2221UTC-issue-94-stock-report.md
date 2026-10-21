# Issue #94 (E13-S01): the current stock report

**Date:** 2026-10-20 22:21 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 94`
**Spec:** `.ai/specs/implemented/2026-10-20--2221UTC-stock-report.md`
**Status:** done

## Goal
A report of physical on-hand and in-transit stock per material and location, with filters, a zero-balance toggle and a drill-down into the pair's signed ledger and its source documents, in the UI and the API (issue #94).

## Log
- 22:21 Feature route (label `feature`). FR triage: no report exists. `/admin/{tenant}/stock` shows one pair's balance, transit and its newest 100 movements. Its source is a type and a raw posting UUID, with no link. No PR references #94, no spec covers it, and `SDLC.md` has no Definition of Ready. Dependency #82 (E07-S03) is merged. Claimed the issue.
- 22:21 No spec existed. It is written on this branch, with the implementation on one PR (the cezar task owns one branch), as for #82, #84, #86 and #87.
- Plan: core (schema, pure row builder, `StockReportService`, movement sources, paged pair ledger) → app (report route and page, stock-page source links and paging, sidebar, EN/PL, help) → integration tests → docs → gate.
- 22:40 core: `stockReportQuerySchema`, the pure `PairTally`/`reportPage`, `StockReportService.read`, and the `movement-sources.ts` leaf. `StockService.get` now pages the ledger and adds each movement's `source`. The paging test (600 pairs) caught a bug: pairs were tallied by the masters' UUIDs, so rows weren't in business-ID order. They are now tallied by `code` (lesson added).
- 23:00 app: the report route and page, `components/reports/stock-report-screen.tsx`, the shared `PageLinks`, and shadcn `checkbox`, added through the shadcn CLI. The Stock screen gained a visible Type column, a linked Source column, ledger paging and a link to the report. Also the sidebar entry `stockReport` (after Stock, flat), EN/PL and the `stock-report` help topic. The lint rule against MikroORM `filters` fired on a React prop of that name, which is now `selected` (lesson added).
- 23:40 Integration: the Docker build failed with "no space left on device". Following the lessons, nothing shared was pruned. The tests ran instead against the standalone production build, from a fresh copy with a fresh `DATA_DIR`. `stock-report-api`, `stock-report`, `stock` and `transfers` passed. `navigation` needed "Stock report" in its EN and PL lists. It then passed on a fresh server, including the check that the sidebar fits at 1280 × 800.
- 00:00 Independent review (subagent) found no blockers and no major issues. Fixed from its findings:
  - a movement without a document now shows "—", not "This correction";
  - "Rows: {count}";
  - plain comparison of IDs;
  - the Type column stays visible;
  - `BACKWARD_COMPATIBILITY.md` now says the Stock `GET` validates `page`;
  - spec notes on the Ledger button and on loading the masters whole.
- 00:20 Screenshots showed both tables unreadable at 390 px. The report's location now moves under the material and its figures stack in one cell on phones, and the integration test asserts that each Ledger button stays in view. The Stock ledger's columns got minimum widths, so it scrolls sideways instead of collapsing to one character per line.
- 2026-10-21 `/om-auto-fix-pr 120`: the PR conflicted with `main`, which had gained stock import (#81) and production completions (#89).
  - Merged `main` in. Both new sidebar entries are kept, Stock import before Stock report, and so are the DI lines, help topics and strings. The checkbox tests are combined.
  - The ledger's sources now cover production completions, linked to their production order. A stock import posts corrections, so its movements are their own source.
  - Gate after the merge: 431 files, 2,789 tests, 100% coverage; lint, typecheck and build clean.
  - Integration on the standalone build (Docker still out of space): `navigation`, `stock-report`, `stock-report-api`, `stock`, `stock-import`, `production-completions` and `transfers` all passed (43 tests). The sidebar still fits at 1280 × 800 with both new entries.

## Changes
- core: `validators/reports/stock-report.schema.ts`, `domain/reports/stock-report-rows.ts`, `services/reports/stock-report.service.ts` (`stockReportService`), `services/stock/movement-sources.ts`. `StockService.get` now pages the ledger (`page`, `movementCount`) and adds each movement's `source`. Also `stockLedgerQuerySchema`, plus the DI and index lines.
- app: `GET /api/tenants/{tenant}/reports/stock`, `/admin/[tenant]/reports/stock`, `components/reports/stock-report-screen.tsx`, `components/layout/page-links.tsx`. The Stock screen got the Type and linked Source columns, paging and the report link, and the stock route takes `page`. Also the sidebar entry and icon, EN/PL strings, and the `stock-report` help topic, with the `stock` topic updated.
- ui: shadcn `checkbox` (CLI-generated) with its test.
- Integration: `stock-report.test.ts` (5), `stock-report-api.test.ts` (7). `navigation.test.ts` gets the new EN and PL entries, and `transfers.test.ts` the renamed ledger table.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, engineering standards §5, two lessons, and the spec moved to `implemented/`.

## Verification
- `npm run lint`: 0 errors. The one warning, in `bom.service.ts`, predates this run.
- `npm run typecheck`: clean.
- `npm run test:coverage`: 414 files, 2,658 tests passed, 100% on all four metrics.
- `npm run build`: succeeded.
- Integration: Docker had no disk space ("no space left on device"), so the tests ran against the standalone production build on a fresh copy and a fresh `DATA_DIR`. `stock-report`, `stock-report-api`, `stock`, `transfers` and `navigation` passed: 5 files, 36 tests. The full suite, and the run on the Docker image, are left to CI.
- UI checked in a real browser with screenshots: the report at 1280 px in Prod (transit) and in Test (zero toggle), at 390 px, and the Stock ledger with source links at 1280 and 390 px.
- `npm audit`: not run. The only new code is CLI-generated from `radix-ui`, which is already a dependency, so no dependency changed.

## Follow-ups
- Older lists (transfers, customer orders, production orders) still render their page links inline. They could switch to `PageLinks`.
- A Reports group in the sidebar, when the variance and last-MRP reports arrive.
- The acceptance catalogue statuses for UX-017, INV-012, API-014, UX-021 and TEN-018 are updated when epic E13 closes.
