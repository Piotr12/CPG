# Execution plan: CPG onboarding skill, prompt, downloads and install guide (#398)

**Date:** 2026-11-23 08:13 UTC
**Agent:** Claude Code / Opus 5.5 (lead), one Opus worker (app side)
**Source doc:** `.ai/specs/implemented/2026-11-23--0810UTC-cpg-onboarding-skill.md` (spec PR #404)
**Issue:** #398
**Branch:** `feat/issue-398-cpg-onboarding-skill` (from `main`)
**Status:** in progress

## Goal

Implement the spec on one PR: the skill and the `cpg_onboarding` prompt (phase 1), and the downloads, `/agents` guide and homepage section (phase 2).

## Units (cut by file ownership)

| Unit | Owner | Files |
| --- | --- | --- |
| U1 skill + prompt | lead | `mcp/**` (incl. `mcp/README.md`), `BACKWARD_COMPATIBILITY.md`, `.ai/lessons.md`, this run folder |
| U2 downloads + guide + homepage | worker | `packages/app/**`, `tests/integration/agents.test.ts`, `tests/**` repo checks that need a new entry (e.g. help or page lists) |

The worker brief is `WORKER-U2.md` in this folder.

## Progress

- [ ] 1. U1: write `SKILL.md`
- [ ] 2. U1: `onboarding.py`, prompt registration, `INSTRUCTIONS`, tests
- [ ] 3. U1: `test_skill_text.py`
- [ ] 4. U2: `agent-downloads/` pure functions + tests
- [ ] 5. U2: download routes + `outputFileTracingIncludes`
- [ ] 6. U2: `/agents`, homepage section, EN/PL, help topic `ai-agents`
- [ ] 7. U2: `tests/integration/agents.test.ts`
- [ ] 8. Docs: `mcp/README.md`, `BACKWARD_COMPATIBILITY.md` §4 and §6, lessons
- [ ] 9. Acceptance run (spec A11) and evidence on the PR
- [ ] 10. Full gate, spec `Status: implemented`, PR

## Log

- 08:13: branch from `origin/main`, with the spec carried into `implemented/` (lesson 2026-11-02). A placeholder `SKILL.md` is committed so U2's paths exist.
