# Repo-local skill overrides

Each `<skill-name>/SKILL.md` here extends the installed om-* skill of the same name (`.agents/skills/<skill-name>/SKILL.md`). The installed skill loads it right after `.ai/agentic.config.json`; local rules win where both cover the same repo specifics, and everything else in the installed skill applies unchanged. Overrides cannot relax the installed skill's safety rules.

Edit these files, not `.agents/skills/` — the vendored skills are replaced on every upgrade.

## Why they exist

AGENTS.md names every dated `.ai/` file `YYYY-MM-DD--HHMMUTC-slug` (UTC, `date -u +%Y-%m-%d--%H%MUTC`), and `tests/ai-filenames.test.ts` enforces it. The om-* skills default to a date-only `YYYY-MM-DD-slug`. The overrides below switch every skill that writes or parses such a name to the repo convention — called **the stamp** in the override files.

| Skill | What changes |
| --- | --- |
| `om-auto-create-pr` | Plan file `.ai/pipeline/runs/<stamp>-<slug>.md`; slot check by slug |
| `om-auto-create-pr-loop` | Run folder `.ai/pipeline/runs/<stamp>-<slug>/`; slot check by slug |
| `om-auto-continue-pr` | Adopted plans use the stamp |
| `om-auto-continue-pr-loop` | Flat-plan migration keeps the plan's stamp |
| `om-spec-writing` | Spec file `.ai/specs/<stamp>-<slug>.md` |
| `om-auto-write-spec` | Same spec name as `om-spec-writing` |
| `om-brainstorm` | Brief file `.ai/specs/briefs/<stamp>-<slug>.md` |
| `om-synthetic-users` | Walkthrough session folders use the stamp |
| `om-auto-implement-spec`, `om-auto-fix-issue` | Spec lookup strips the stamp |
| `om-followup-issue-from-pr` | Slug derivation strips the stamp |
