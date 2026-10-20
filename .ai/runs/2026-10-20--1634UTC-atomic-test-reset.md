# Atomic Test reset — issue #93

**Date:** 2026-10-20 16:34 UTC
**Agent:** Codex
**Spec:** none (authoring required)
**Status:** in progress

## Goal
Implement issue #93 through the om-auto-fix-issue feature route: spec first, then a separate implementation PR.

## Log
- 2026-10-20 16:34 UTC: Read handoff, lessons, standards, tracker/config and issue. Issue is open, unassigned, with no claim or referencing open PR. Feature triage: no reset service/route exists; existing specs explicitly defer it to slice 2. Ticket includes problem, admin, expected outcomes, scope, dependencies and non-blocking questions.
- 2026-10-20 16:34 UTC: Scope: draft and review an atomic reset spec, produce UI evidence, publish its design-only PR, then implement from that spec with full tests. The cezar Guard applies to existing shared/base branches, production, irreversible and out-of-scope actions. This skill authorizes publishing new task-owned spec/implementation branches and PRs; those do not overwrite an existing shared branch.

## Changes
- Run log; spec and evidence pending.

## Verification
- Pending. Full configured gate required before finishing code changes.

## Follow-ups
- Publish design-only PR (Refs #93); implement on its own PR (Closes #93).

## Design checkpoint
- Fresh scope review: exactly one capability; no scope bundles. Architectural review found the nine-digit generation header bound, a stale captured-generation risk in import previews and the app/service transaction boundary. Revised the design to preserve the bound, read preview generation inside the transaction, and let the reset service own direct-call transactions.
- Baseline lint/typecheck/build passed; 287 unit-test files, 1,891 tests passed; statements/branches/functions/lines all 100%. Default integration run failed before tests because Docker is unavailable; standalone fallback is running.
- Current Cave control screenshot and three proposed-UI screenshots captured with agent-browser; narrow confirmation visually inspected. These are illustrative and do not prove a reset implementation.
