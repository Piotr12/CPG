# Customer orders — issue #83

**Date:** 2026-10-20 16:34 UTC
**Agent:** Codex
**Spec:** .ai/specs/implemented/2026-10-20--1635UTC-customer-orders.md
**Status:** done

## Goal
Deliver issue #83 (E08-S01): tenant-scoped, audited customer orders with one header location, dated quantity lines, Open lifecycle, UI/API parity and Test demo data. Follow om-auto-fix-issue's feature route with separate design and implementation PRs.

## Log
- 16:34 UTC — Read handoff, lessons, engineering standards and feature-route skills. Issue is unassigned, open, feature/risk-high; no open PR references it and no customer-order code exists. The ticket meets the ticket-level readiness gate; a per-story spec is owed. Reuse cockpit worktree `cez/c76c36cd`. Installing local dependencies to avoid resolving main-checkout workspace links.

## Plan
1. Resolve PRD/catalogue rules, inspect existing quantity, tenant, master-data and document patterns. Write and review a focused customer-orders spec; publish a design-only PR with documented defaults.
2. Implement entities/migration, pure quantity/document rules, service and material-reference protections, with real SQLite tests.
3. Implement API/actions and list/detail/edit screens using shared wrappers/components, translations, help and navigation; add unit and integration coverage.
4. Seed Test, run lint/typecheck/100% coverage/build/integration, inspect the live flow, review and publish one implementation PR with evidence.

- 16:38 UTC — Wrote skeleton then full spec with eight autonomous defaults from PRD/catalogue. Fresh-context scope review approved; clarified line positions have no database uniqueness constraint. Design metadata tests: 2 files / 6 tests passed. Shared test-env descriptor absent, so design visuals skipped per skill. npm ci completed; 10 known high advisories reported, no dependency changes.

## Changes
- Design-only spec PR #101; implementation remains on separate PR #102.

## Verification
- Initial read-only triage: `gh issue view 83`, current user Piotr12, open PR search `[]`, code search no customer-orders implementation.

## Follow-ups
- Review and merge design #101 with implementation #102; implementation claim/evidence remain owned by its tracking plan.

- 17:47 UTC — Design verified against the implemented behaviour and moved to implemented/ with original creation stamp. Performance clarifications record bounded collection/batches/index. Source validation and production UI verification are recorded on implementation #102; no runtime code is on this design branch.
