# Worker brief U2: downloads, `/agents` guide, homepage section (#398)

You implement Phase 2 of the spec `.ai/specs/implemented/2026-11-23--0810UTC-cpg-onboarding-skill.md`: steps 4–7 of its Implementation Plan, plus the `BACKWARD_COMPATIBILITY.md`-free parts of step 8 (the lead owns `BACKWARD_COMPATIBILITY.md`, `mcp/**`, `.ai/lessons.md`). Read the spec in full first, especially resolved assumptions A4–A10 and the "Downloads (app)" and "The guide" sections. They are the source of truth. Also read `AGENTS.md`, `.ai/docs/engineering-standards.md` and the `UI and React`, `Unit tests`, `Integration tests` and `Next.js` sections of `.ai/lessons.md`.

## Scope (files you may touch)

- `packages/app/**`, including `next.config.ts`, `src/agent-downloads/`, `src/app/downloads/`, `src/app/agents/`, `src/app/page.tsx`, `src/i18n/messages/{en,pl}.ts`, and `src/help/topics.ts` (new topic `ai-agents` → `/agents`, EN and PL).
- `tests/integration/agents.test.ts` (new), and any repo-wide check under `tests/` that must list a new page or URL.
- Do NOT touch `mcp/**`, `BACKWARD_COMPATIBILITY.md`, `.ai/lessons.md` or `.ai/specs/**`. The lead is rewriting `mcp/cpg_mcp/skills/cpg-onboarding/SKILL.md`. Your code reads it by path, and your tests use temp directories, never its text.

## Facts already checked

- `uvx --from http://host/cpg-mcp.zip cpg-mcp` installs from a zip of `mcp/`, with no git needed (uv 0.11.14). It caches by URL, so the URL must change with the content. That is why `cpg-mcp-{hash}.zip` exists.
- `fflate` is already a dependency of `@cpg/app`. Add no new dependency.
- `process.cwd()` is `packages/app` under `next dev` and under the standalone `server.js`, which chdirs to its own dir. Use `/* turbopackIgnore: true */` on the dynamic `fs` path.
- Every page needs a help topic (`tests/every-page-has-help.test.ts`). Dictionaries need the same keys in EN and PL, and no string can be identical in both unless it is placeholders only (`messages.test.ts`). Build commands, paths and URLs in code, not in the dictionaries.

## To check yourself

- Codex's user skills folder (spec A10). Look in Codex's current official documentation. If it documents one, add its one-liner next to Claude Code's. If it doesn't, list only the `cpg_onboarding` prompt for Codex. Say which in your report, with the source URL.
- The uv install commands in the spec against `https://docs.astral.sh/uv/getting-started/installation/`.

## Definition of done

- 100% coverage on everything you add or change (`npm run test:coverage`), plus `npm run lint`, `npm run typecheck` and `npm run build`, all green. Judge them by exit code, never by a piped tail.
- `tests/integration/agents.test.ts` passes against the production image or a local standalone build (lesson 2026-10-23, "Running integration tests against a local standalone server"). Also run `tests/integration/help.test.ts` and `footer.test.ts` if you touch what they cover.
- Check by hand on a local standalone build that `uvx --from http://localhost:<port>/downloads/cpg-mcp-<hash>.zip cpg-mcp` (with no token set) prints the "CPG_API_TOKEN is not set" message. That proves the archive installs from the traced files. Use a temp `UV_CACHE_DIR`.
- Take viewport screenshots (absolute paths, 1280×800) of the homepage section and `/agents` for Windows and macOS, in EN, plus one in PL. Save them under `.ai/pipeline/runs/2026-11-23--0813UTC-cpg-onboarding-skill/screens/`.
- Commit on your branch in logical commits that end with the `Co-Authored-By` line, then report with `cez task report`. The evidence lists the commands and their exit codes, the uvx check output, the screenshot paths and the Codex finding.
