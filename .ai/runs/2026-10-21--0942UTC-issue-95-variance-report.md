# Issue #95 (E13-S02): the production variance report

**Date:** 2026-10-21 09:42 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 95`
**Spec:** to be written (`.ai/specs/<stamp>-production-variance-report.md`)
**Status:** in progress

## Goal
A report comparing each production order's target and pinned-BOM expected consumption with actual output and inputs — including extra components and zero-output waste, excluding reversed completions — with filters, in the UI and the API (issue #95).

## Log
- 09:42 Feature route (label `feature`). FR triage: no variance report exists (`reports/` holds only the stock report), no spec mentions one beyond the completions spec, and no PR references #95. `SDLC.md` has no Definition of Ready, so the ticket counts as ready. Dependency #89 (E10-S02, completions) is closed. Base branch `main` (config `auto`). Claimed the issue.
- 09:42 Route: `om-auto-write-spec 95` on `spec/production-variance-report` (design-only PR), then `om-auto-implement-spec` on `feat/production-variance-report` (implementation PR, `Closes #95`), as for #91 (#124/#125).

## Plan
1. Research completions, the stock report, PRD §07 and the acceptance scenarios; write the spec skeleton, resolve open questions with autonomous defaults, finish it with an implementation plan.
2. Current-screen screenshots and a proposed mockup; open the design PR.
3. Implement (core schema/service/pure builder → API route → admin page, nav, EN/PL, help → integration test), gate, open the implementation PR, review, QA.

## Changes

## Verification

## Follow-ups
