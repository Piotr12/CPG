# Execution plan: CPG onboarding skill, prompt, downloads and install guide (#398)

**Date:** 2026-11-23 08:13 UTC
**Agent:** Claude Code / Opus 5.5 (lead), one Opus worker (app side)
**Source doc:** `.ai/specs/implemented/2026-11-23--0810UTC-cpg-onboarding-skill.md` (spec PR #404)
**Issue:** #398
**Branch:** `feat/issue-398-cpg-onboarding-skill` (from `main`)
**Status:** done

## Goal

Implement the spec on one PR: the skill and the `cpg_onboarding` prompt (phase 1), and the downloads, `/agents` guide and homepage section (phase 2).

## Units (cut by file ownership)

| Unit | Owner | Files |
| --- | --- | --- |
| U1 skill + prompt | lead | `mcp/**` (incl. `mcp/README.md`), `BACKWARD_COMPATIBILITY.md`, `.ai/lessons.md`, this run folder |
| U2 downloads + guide + homepage | worker | `packages/app/**`, `tests/integration/agents.test.ts`, `tests/**` repo checks that need a new entry (e.g. help or page lists) |

The worker brief is `WORKER-U2.md` in this folder.

## Progress

- [x] 1. U1: write `SKILL.md`
- [x] 2. U1: `onboarding.py`, prompt registration, `INSTRUCTIONS`, tests
- [x] 3. U1: `test_skill_text.py`
- [x] 4. U2: `agent-downloads/` pure functions + tests
- [x] 5. U2: download routes + `outputFileTracingIncludes`
- [x] 6. U2: `/agents`, homepage section, EN/PL, help topic `ai-agents`
- [x] 7. U2: `tests/integration/agents.test.ts`
- [x] 8. Docs: `mcp/README.md`, `BACKWARD_COMPATIBILITY.md` §4 and §6, lessons
- [x] 9. Acceptance run (spec A11) and evidence on the PR
- [x] 10. Full gate, spec `Status: implemented`, PR

## Log

- 08:13: branch from `origin/main`, with the spec carried into `implemented/` (lesson 2026-11-02). A placeholder `SKILL.md` is committed so U2's paths exist.
- 08:18: U1 done (0c702d70). The skill-text test found the regex missed the capitalised "Help topic" in the glossary, so it now matches case-insensitively. A `uv build` wheel contains `cpg_mcp/skills/cpg-onboarding/SKILL.md`. Docs committed (541cccd2): README, BACKWARD_COMPATIBILITY §4/§6, and the uvx-cache lesson.
- 08:18: trial acceptance run started: a local standalone build on :3398 with the tiny Test dataset, a token created through the UI, and `claude -p` limited to the `cpg` MCP plus the skill.
- 09:2x: headless `claude -p` refused to start (expired login), so the acceptance run used Codex CLI 0.164.0 with `--ignore-user-config`. Its first run stopped at `cpg_mrp_run`: `codex exec` refuses non-read-only MCP tools under its default approval policy. With `default_tools_approval_mode = "approve"`, it ran the whole loop without a refused call (`acceptance-run.md`).
- U2 (worker 47830272, $8.33) reported done. Merged with `--no-ff` and no deletions. Gate on the merged tree: py 0 (135 tests, 100%), lint 0, typecheck 0, test:coverage 0 (696 files, 5826 passed, 100%), build 0.
- Merged standalone build on :3398: `agents`, `help` and `footer` integration tests 0 (28 passed). `/agents?os=macos` names `/downloads/cpg-mcp-22fd43443df9.zip` (200, immutable). With a fresh `UV_CACHE_DIR`, an MCP client running `uvx --from <that URL> cpg-mcp` lists the prompt `cpg_onboarding` and 34 admin tools and gets the skill body. Through the 307, `cpg-mcp-000000000000.zip` gives the same.

## Verification

| Check | Result |
| --- | --- |
| `mcp`: ruff, ruff format, pyright, pytest --cov 100% | 0, 135 passed |
| `npm run lint` / `typecheck` / `test:coverage` / `build` | 0 / 0 / 0 (5826 passed) / 0 |
| integration `agents`, `help`, `footer` on the standalone build | 0, 28 passed |
| uvx from the served zip (current and old hash), the prompt over MCP | ok |
| Acceptance run (Codex, only the skill and the MCP) | full loop, 0 refused calls |

## Follow-ups

- The owner's call (from U2): `next build` shows the SecurityFatalError upgrade notice, which asks for `next upgrade --agent=security`. That would change dependencies, so it wasn't done.
- Not checked: `claude mcp add … -- uvx …` on native Windows PowerShell. It follows Claude Code's documented syntax.
- The owner's call: link `/agents` from the signed-in sidebar. Today only the homepage and help topic `ai-agents` reach it.
