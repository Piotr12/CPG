# Run the full integration suite in CI only

**Date:** 2026-10-20 20:11 UTC
**Agent:** Claude Code (Opus 5.5), via cezar (follow-up to `/om-auto-fix-issue 87`)
**Spec:** none
**Status:** done

## Goal
Stop running the ~15-minute integration suite both locally and in CI. The owner asked why it ran twice for #87, then told the agent to proceed with the recommendation.

## Log
- CI (`ci.yml`) runs the full suite on every PR, against the branch merged with `main`, and deploys depend on it, so CI stays the gate. The local run is what gets dropped.
- New rule: locally, run only the integration files a change adds or touches (plus `smoke.test.ts` for a new migration), and check the PR's CI result before calling the work done.
- Removed `npm run test:integration` from the local gate in `.ai/agentic.config.json` and updated the documents that list the gate together.

## Changes
- `AGENTS.md` (Testing; Before finishing), `SDLC.md` (Validation gate), `CODE_REVIEW.md` (Validation gate), `.ai/docs/engineering-standards.md` (review checklist, §4), `.ai/agentic.config.json`, `.ai/lessons.md`.

## Verification
- `npx vitest run tests` (repo-wide checks, including the `.ai/` file-name rule): passed.
- Docs and config only; no code changed.

## Follow-ups
- None.
