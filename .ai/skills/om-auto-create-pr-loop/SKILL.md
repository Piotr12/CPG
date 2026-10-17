# om-auto-create-pr-loop — CPG override

Extends the installed `om-auto-create-pr-loop`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Run folder (step 2, `references/claim-pr.md`, `references/run-folder-layout.md`)

```bash
DATE=$(date -u +%Y-%m-%d--%H%MUTC)
RUN_DIR="${RUNS_DIR}/${DATE}-${SLUG}"
```

Wherever the skill or its references write `<date>-<slug>`, `<YYYY-MM-DD>-<slug>` or `${DATE}-${SLUG}`, the date part is the stamp. Files inside the run folder (`PLAN.md`, `HANDOFF.md`, `NOTIFY.md`, `checkpoint-<N>-checks.md`, …) keep their fixed names.

## Slot check

Match an existing run by slug, not by exact path: the slot is taken when `${RUNS_DIR}/????-??-??--????UTC-${SLUG}/` (or a flat `….md` plan with that slug) exists on `origin/$BASE_BRANCH` or any remote branch, or an open PR references it. The branch and PR checks are unchanged.

## Run log

AGENTS.md also requires a run log in `.ai/runs/` for autonomous runs. Keep it short and link to `$RUN_DIR` instead of repeating the plan.
