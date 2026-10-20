# Issue #94 (E13-S01): the current stock report

**Date:** 2026-10-20 22:21 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 94`
**Spec:** `.ai/specs/2026-10-20--2221UTC-stock-report.md`
**Status:** in progress

## Goal
A report of physical on-hand and in-transit stock per material and location, with filters, a zero-balance toggle and a drill-down into the pair's signed ledger and its source documents, in the UI and the API (issue #94).

## Log
- 22:21 Feature route (label `feature`). FR triage: no report exists. `/admin/{tenant}/stock` shows one pair's balance, transit and its newest 100 movements. Its source is a type and a raw posting UUID, with no link. No PR references #94, no spec covers it, and `SDLC.md` has no Definition of Ready. Dependency #82 (E07-S03) is merged. Claimed the issue.
- 22:21 No spec existed. It is written on this branch, with the implementation on one PR (the cezar task owns one branch), as for #82, #84, #86 and #87.
- Plan: core (schema, pure row builder, `StockReportService`, movement sources, paged pair ledger) → app (report route and page, stock-page source links and paging, sidebar, EN/PL, help) → integration tests → docs → gate.

## Changes

## Verification

## Follow-ups
