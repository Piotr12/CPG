# Issue #84 (E08-S02): shipments and goods issues against one customer order

**Date:** 2026-10-20 20:45 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 84`
**Spec:** `.ai/specs/2026-10-20--2045UTC-shipments-goods-issues.md`
**Status:** in progress

## Goal
Shipments against one customer order, and goods issues that lower physical stock and fulfil the order's lines, never beyond the outstanding quantity or the stock on hand. The issue that fulfils the last outstanding quantity completes the order. Available in the UI and the API (issue #84).

## Log
- 20:45 Feature route (label `feature`). FR triage: no shipment/goods-issue code in `packages/`, no open PR references #84, and the ticket meets the ticket-level tier (problem, roles, outcome, scope, no blocking question). No spec exists, so the spec is written on this branch, as for #86/#87.

## Changes

## Verification

## Follow-ups
