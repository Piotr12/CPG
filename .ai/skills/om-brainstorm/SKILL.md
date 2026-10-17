# om-brainstorm — CPG override

Extends the installed `om-brainstorm`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Brief file name (step 6, `references/agentic-setup.md`)

Write the brief to `${SPECS_DIR}/briefs/<stamp>-<slug>.md`, e.g. `.ai/specs/briefs/2026-10-17--1432UTC-lot-sizing.md`.
