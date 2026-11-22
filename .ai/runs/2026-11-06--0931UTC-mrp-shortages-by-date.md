# Group the Day view's short requirements by date once (#391)

**Date:** 2026-11-06 09:31 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, cezar headless)
**Spec:** none (follow-up nit from the #387 review)
**Status:** done

## Goal

The MRP report's Day view filtered `plan.shortages` once per shown day (90 scans of the whole list). Group it by `date` once and
look each day up, keeping each day's entries in the order MRP serves them. No behaviour change.

## Log

- 09:31 — Triage: `mrp-report.tsx:202` still filters per day; no PR or commit on `main` references #391. Claimed the issue.
- 09:33 — Added `shortagesByDate` to `mrp-shortages.tsx` (one pass, a `Map<date, entries>` in input order) and used it in
  `PlanDays`. Warnings (`plan.marks`) use the same per-day filter but are left alone: the issue asks only for shortages, and a
  pair's warnings are few.

## Changes

- `packages/app/src/components/mrp/mrp-shortages.tsx` — `shortagesByDate`.
- `packages/app/src/components/mrp/mrp-report.tsx` — `PlanDays` groups once and looks each day up.
- `packages/app/src/components/mrp/mrp-shortages.test.tsx` — interleaved days keep their own entries in order; no shortages, no days.

## Verification

- `npx vitest run` on `mrp-shortages.test.tsx` and `mrp-report.test.tsx` — 41 passed, the existing Short requirements tests unchanged.
- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (681 files, 5,710 passed, 100% thresholds met), `npm run build` — all exit 0.
- No integration file touched and no visible change, so none run locally; CI runs the suite, `mrp-report.test.ts` included.

## Follow-ups

- None. The Warnings column's per-day `plan.marks` filter has the same shape, but a pair's warnings are few; not worth an issue on its own.
