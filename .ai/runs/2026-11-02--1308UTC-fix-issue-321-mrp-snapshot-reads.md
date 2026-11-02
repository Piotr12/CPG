# Fix issue #321 — MRP snapshot: corrupt dates the SQL-ranged reads skip, and the BOM revision read

**Date:** 2026-11-02 13:08 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` via cezar
**Spec:** none (follow-up of `.ai/specs/implemented/2026-11-01--0737UTC-mrp-planning-exceptions.md`, implementation notes)
**Status:** done

## Goal

Issue #321, two limits recorded on #316:

1. A forecast or safety target whose stored date isn't a real day and sorts outside the SQL date range is never read, so never reported as Invalid UoM Conversion.
2. `readBoms` reads current revisions with `$or: [{ bom, number }]` in chunks of 100, and SQLite walks the tenant's revisions per chunk.

## Log

- 13:00 Step 1: issue open, no assignee, no `in-progress`, no claim comment, no PR referencing it. Labels `refactor`, `priority-low`, `risk-low`. Classified as the bug chain (corrective, not a new capability).
- Triage (`om-verify-in-repo`): still unfixed on `origin/main` (`ab0b20da`). `snapshot/forecasts.ts` and `snapshot/safety-targets.ts` filter dates in SQL; `snapshot/boms.ts` sends `$or` chunks of 100. The same limit applies to `readConsumingLines` (non-Open lines, one SQL range per month), which the spec notes don't list.
- Root cause measured with a throwaway test (deleted):
  - Plans without ANALYZE: the revision `$or` seeks `bom_revision_bom_id_number_unique (bom_id=? AND number=?)` as a `MULTI-INDEX OR` for up to 2 terms; from 3 terms it walks `bom_revision_tenant_code_index`. A `bom IN` seeks `bom_id` up to 3 keys. An `indexed by` hint makes larger chunks start from a walk of the tenant's BOMs instead, so no gain.
  - Cost of the revision read, 3 revisions per BOM, best of 3: 300 BOMs 9.0 ms (chunks of 100) vs 18.6 ms (chunks of 2); 3,000 BOMs 293 vs 178 ms; 10,000 BOMs 2,679 vs 569 ms. Chunks of 100 grow with BOMs × revisions; chunks of 2 grow linearly, longest read 1 ms.
  - Corrupt-date read in SQL (`date(x) is not x`) over a tenant's forecasts: 1.7 ms at 31,000 rows, 25 ms at 310,000 (a walk in SQLite, nothing hydrated).
- Decision: (1) forecasts and consuming lines keep their month reads and add one read of the rows whose date isn't a real day and that sort outside the window; safety targets drop the SQL range and cut off in code with `beforeCutOff`, like the other in-code seams. (2) revisions are read two `(bom, number)` terms at a time inside each chunk of 100 BOMs; the lines keep one read per chunk.

- 13:10 Claimed #321 (assignee, `in-progress`, claim comment).
- Implementation: `notCalendarDate(column)` in `@cpg/db` (a raw filter term, `(date(x) is x) = 0`, with the column guard shared with `decimalLengthKey` as `plainColumn`). `readForecasts` and `readConsumingLines` add one corrupt-date read outside their window; `readSafetyTargets` reads every target and cuts off with `beforeCutOff` (its plan was the tenant-index walk with the range too, checked with EXPLAIN); `readBoms` seeks revisions `REVISION_TERMS` (2) at a time.
- Regression check: with the seam sources reverted, 6 of the 44 snapshot tests fail (the three new corrupt-date tests, the forecast and consuming-line plan tests, the BOM plan test); with them, all pass.

## Changes

- `packages/db/src/calendar-date-filter.ts` (+ test), `packages/db/src/sql-column.ts`, `decimal-order.ts`, `index.ts`, `index.test.ts`
- `packages/core/src/services/mrp/snapshot/{forecasts,order-lines,safety-targets,boms}.ts`, `mrp-snapshot.service.test.ts`
- `.ai/specs/implemented/2026-11-01--0737UTC-mrp-planning-exceptions.md` (known limits resolved), `.ai/docs/engineering-standards.md`

## Verification

- `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0.
- `npm run test:coverage`: 666 files, 5,454 tests passed, 100% statements/branches/functions/lines. The first run failed only `tests/ai-filenames.test.ts`, on `main`'s duplicate `2026-11-02--1031UTC-mrp-automatic-mode.md` spec (left by #340, fixed by open PR #347); the rerun deleted that copy locally and restored it afterwards, so this PR doesn't touch it.
- `mrp-run-timing.test.ts`, run alone, fix vs `main` sources on this machine: ten times 3,100 vs 3,181 ms, longest stall 107 vs 128 ms; realistic 293 vs 329 ms. No regression (an earlier fix run overlapped `npm run typecheck` and read 8.4 s; discarded).
- No integration test touched: no screen, route or migration changes.

## Follow-ups

- The production dialog's read (`resolveProductionOptions`) keeps chunks of `REFERENCE_BATCH_SIZE`: it reads one output's BOMs, so its walk is linear, not BOMs × revisions.
- CI's spec-filename check stays red until #347 lands.
