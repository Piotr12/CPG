# Production orders — issue #88

**Date:** 2026-10-20 20:45 UTC
**Agent:** Codex
**Spec:** .ai/specs/implemented/2026-10-20--2047UTC-production-orders.md
**Status:** done

## Goal
Deliver E10-S01: production orders pinning a BOM revision with derived calendar dates, shortage warnings, UI/API parity and reference guards.

## Log
- 20:50 UTC: Fresh-context scope review passes; clarified latest-at-create lead-time capture. npm ci installed 913 packages; lockfile unchanged; 10 known high advisories.
- 20:50 UTC: Wrote skeleton first, resolved four reversible defaults, then completed the design from PRD/decision register/data model and existing service contracts. Market comparison uses official ERPNext Work Order docs. No product code changed during spec writing. Shared test-env descriptor absent; text-only spec evidence permitted.
- 20:48 UTC: First descriptor code-block extraction selected prerequisite examples instead of label guards; no issue label applied. Corrected extraction to select `tracker_repo()` explicitly.
- 20:45 UTC: Read handoff, issue #88, pipeline config, lessons and engineering standards. Current linked worktree is clean; reuse it. Current user Piotr12; issue open, unassigned, no claim comments or referencing open PR. Classified as feature. No production-order implementation or covering spec exists.
- 20:48 UTC: Feature passes ticket readiness: user, problem, outcomes, exclusions and nonblocking Q05 are explicit. Route through autonomous spec writing, then implementation. User Guard requires approval before publishing shared branches; prepare concrete local deliverables before that gate.

## Changes
- Design PR #113 (`2c5a4cb`) and implementation PR #114 (`ce24740`), both merged on 2026-10-20.

## Verification
- Spec-stage lint passed (one pre-existing unused `lineError` warning in BomService); metadata tests: 2 files, 6 tests passed.
- Read-only issue, PR and code searches completed.

## Follow-ups
- None. Both PRs were merged; #88 is closed. The spec is in `implemented/` (closed out by the 2026-10-21 cleanup run, `.ai/runs/2026-10-21--0704UTC-cleanup-closed-stories.md`).
