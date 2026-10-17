# om-auto-continue-pr — CPG override

Extends the installed `om-auto-continue-pr`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Adopted plans (`references/adopt-pr.md`)

When adoption writes a new plan, name it `${RUNS_DIR}/<stamp>-<slug>.md`, with the stamp taken when the plan is written. Plans found through a PR's `Tracking plan:` line are used as they are, whatever their name.
