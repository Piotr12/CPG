# Issue #82 (E07-S03): transfers between two locations, with transit and write-offs

**Date:** 2026-10-20 20:46 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 82`
**Spec:** `.ai/specs/2026-10-20--2046UTC-transfers.md`
**Status:** in progress

## Goal
Single-material transfers between two locations with planned dates: partial dispatches into transit, partial receipts out of it, reasoned write-offs, all atomic, in the ledger, the audit, the UI and the API (issue #82).

## Log
- 20:46 Feature route (label `feature`). FR triage: no transfer code in `packages/`, no PR references #82, `SDLC.md` has no Definition of Ready section, no spec covers transfers. Dependency #80 (E07-S01) is closed. Claimed the issue (assignee, `in-progress`, claim comment).
- 20:46 No spec existed: written on this branch, with the implementation on one PR (the cezar task owns one branch), as for #86 and #87.
- Plan (spec Implementation Plan): db entities + migration → core rules/schema/service/guards → app routes/actions/pages/components → integration tests and docs → gate.

## Changes

## Verification

## Follow-ups
