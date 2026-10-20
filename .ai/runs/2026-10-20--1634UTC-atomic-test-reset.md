# Atomic Test reset — issue #93

**Date:** 2026-10-20 16:34 UTC
**Agent:** Codex
**Spec:** none (authoring required)
**Status:** done (design phase; implementation continues in its pipeline plan)

## Goal
Implement issue #93 through the om-auto-fix-issue feature route: spec first, then a separate implementation PR.

## Log
- 2026-10-20 16:34 UTC: Read handoff, lessons, standards, tracker/config and issue. Issue is open, unassigned, with no claim or referencing open PR. Feature triage: no reset service/route exists; existing specs explicitly defer it to slice 2. Ticket includes problem, admin, expected outcomes, scope, dependencies and non-blocking questions.
- 2026-10-20 16:34 UTC: Scope: draft and review an atomic reset spec, produce UI evidence, publish its design-only PR, then implement from that spec with full tests. The cezar Guard applies to existing shared/base branches, production, irreversible and out-of-scope actions. This skill authorizes publishing new task-owned spec/implementation branches and PRs; those do not overwrite an existing shared branch.

## Changes
- Spec and four screenshots plus static proposed UI; commit 6eb300c; design-only PR #105.

## Verification
- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`: passed. Unit tests: 287 files / 1,891 tests; all coverage measures 100%.
- `npm run test:integration`: blocked by unavailable Docker. Standalone fallback: 213 passed, 1 Docker-only skip, one app-icons failure due to missing public assets at startup. After copying public assets before restart, all 5 targeted app-icon tests passed.
- Metadata/image-reference tests: 2 files, 6 tests passed.
- Fresh scope review passed. Static architectural findings addressed in spec; reset behavior is not implemented or verified.

## Follow-ups
- Design-only PR: https://github.com/Piotr12/CPG/pull/105 (Refs #93). Implement on its own branch/PR (Closes #93); no base merge or production actions authorized. Screenshot upload to the shared qa-evidence branch was deferred under the cezar Guard; artifact links are on PR #105.

## Design checkpoint
- Fresh scope review: exactly one capability; no scope bundles. Architectural review found the nine-digit generation header bound, a stale captured-generation risk in import previews and the app/service transaction boundary. Revised the design to preserve the bound, read preview generation inside the transaction, and let the reset service own direct-call transactions.
- Baseline lint/typecheck/build passed; 287 unit-test files, 1,891 tests passed; statements/branches/functions/lines all 100%. Default integration run failed before tests because Docker is unavailable; standalone fallback is running.
- Current Cave control screenshot and three proposed-UI screenshots captured with agent-browser; narrow confirmation visually inspected. These are illustrative and do not prove a reset implementation.

## Implementation handoff completed
- 2026-10-20 17:25 UTC: Implementation PR #106 passed the local full gate (1,922 unit tests, all coverage measures 100%; 221 production-standalone integration tests, one Docker-only skip). Source spec moved to implemented/ with its creation stamp unchanged and relative links fixed. This branch remains design-only; independent code review and high-risk QA remain required before merge.
