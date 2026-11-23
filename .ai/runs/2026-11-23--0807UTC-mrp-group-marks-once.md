# Group the MRP Day view's warnings, and the proposals' marks, once (#397)

**Date:** 2026-11-23 08:07 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 397`, dispatched by cezar)
**Spec:** none (follow-up refactor from #391 / #392's review)
**Status:** done

## Goal

No behaviour change. The Day view's Warnings column filtered `plan.marks` once per day (`mrp-report.tsx`), and the proposals table filtered it once per proposal (`mrp-proposals.tsx`): the shape #391 removed from the Short requirements column. Group each list once and look it up.

## Log

- 08:07 — Triage: still on `main` @613426a4 (`mrp-report.tsx:199`, `mrp-proposals.tsx:83`); no open PR or commit references #397. Claimed the issue.
- Plan: generalise #392's `shortagesByDate` into `groupBy(items, key)` (`components/mrp/group-by.ts`), use it for the shortages and marks by date in `PlanDays` and for the marks by proposal in `MrpProposals`; move its test to `group-by.test.ts`. `mrp-report.test.tsx` and `mrp-proposals.test.tsx` stay unchanged.

- 08:10 — Implemented. `groupBy<T, K>(items, key)` replaces #392's `shortagesByDate` (one helper, keyed by date or by proposal) rather than adding a marks-only twin. `core`'s `groupBy` in `services/shipments/shipment-records.ts` has the same body, but importing a service file into these components would pull `@cpg/core` runtime code into them (lesson 2026-10-19), so the app keeps its own.
- 08:14 — Gate: lint and typecheck green; the first `test:coverage` was killed (exit 143, no test output, cause not found) and `next build` stopped once on the `SecurityFatalError` upgrade notice (lesson 2026-11-22). Re-ran both: green. The Next.js upgrade the notice asks for is not done here.

## Changes

- `packages/app/src/components/mrp/group-by.ts` (new) and `group-by.test.ts` (new; takes over `shortagesByDate`'s tests, adds marks by day and by proposal).
- `mrp-report.tsx` — `PlanDays` groups marks and shortages by date once.
- `mrp-proposals.tsx` — the need-date cell looks its proposal's marks up in a map built once.
- `mrp-shortages.tsx` / `.test.tsx` — `shortagesByDate` and its tests removed (moved).

## Verification

- `npx vitest run packages/app/src/components/mrp` — 9 files, 99 tests passed; `mrp-report.test.tsx` and `mrp-proposals.test.tsx` unchanged.
- `npm run lint` — exit 0. `npm run typecheck` — exit 0.
- `npm run test:coverage` — 688 files, 5,758 passed, 2 skipped; 100% statements, branches, functions, lines.
- `npm run build` — exit 0 (on the retry, see log).
- No integration test touched: the rendered markup is unchanged, and the MRP report's integration tests run in CI.

## Follow-ups

- `next build` reports a Next.js 16.4.2 security advisory; an upgrade belongs in its own dependency PR.
