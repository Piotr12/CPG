# om-auto-create-pr — CPG override

Extends the installed `om-auto-create-pr`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Plan path (step 1)

```bash
DATE=$(date -u +%Y-%m-%d--%H%MUTC)
PLAN_PATH="${RUNS_DIR}/${DATE}-${SLUG}.md"
```

Wherever the skill or its references write `<date>-<slug>` or `${DATE}-${SLUG}`, `<date>` is the stamp — including the run folder when the run hands off to `om-auto-create-pr-loop`.

## Slot check

The stamp carries the minute, so match an existing run by slug, not by exact path: the slot is taken when a path matching `${RUNS_DIR}/????-??-??--????UTC-${SLUG}.md` or `${RUNS_DIR}/????-??-??--????UTC-${SLUG}/` exists on `origin/$BASE_BRANCH` or any remote branch, or an open PR references it. The branch and PR checks are unchanged.

## Run log

AGENTS.md also requires a run log in `.ai/runs/` for autonomous runs. Keep it short and link to `$PLAN_PATH` instead of repeating the plan.
