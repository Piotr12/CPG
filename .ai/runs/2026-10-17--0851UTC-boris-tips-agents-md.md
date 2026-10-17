# Add Boris Cherny's Claude Code tips to AGENTS.md

**Date:** 2026-10-17
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none
**Status:** done

## Goal

Choose the useful principles from Boris Cherny's 10 Claude Code tips (ykdojo.github.io/claude-code-tips summary) and add them concisely to `AGENTS.md`, covering planning complex tasks, verifying changes and recording lessons after corrections, without duplicating existing rules. Check that `CLAUDE.md` imports `@AGENTS.md`.

## Log

- WebFetch of the article was denied (headless session can't approve prompts); the user pasted the article text instead.
- Folded the principles into the existing "Mandatory workflow" steps rather than adding a separate section, so they don't duplicate the existing rules.
- Adopted: #2 plan mode / re-plan, #3 update rules after every correction (mapped to `.ai/lessons.md`), #4 skills (as a proposal), #5 fix bugs autonomously, #6 elegant solution + reduce ambiguity, #8 subagents; verification added as an explicit step with this repo's checks (`npm run lint`, `npm run build`).
- Skipped: #1 parallel worktrees (cezar handles that for the human), #7 terminal setup, #9 data/analytics, #10 learning output styles — human-side setup, not agent rules.

## Changes

- `AGENTS.md`
- `.ai/runs/2026-10-17--0851UTC-boris-tips-agents-md.md`

## Verification

- `CLAUDE.md` contains exactly `@AGENTS.md`.
- Docs-only change; no build or lint impact.

## Follow-ups

- None.
