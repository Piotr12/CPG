# om-auto-continue-pr-loop — CPG override

Extends the installed `om-auto-continue-pr-loop`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Run folder lookup (`references/run-folder-lookup.md`)

When a flat plan `${RUNS_DIR}/<name>.md` is migrated into a run folder, the folder is `${RUNS_DIR}/<name>/` — it keeps the plan's existing stamp and slug. A run folder created without an existing plan to inherit from takes a fresh stamp: `${RUNS_DIR}/<stamp>-<slug>/`.
