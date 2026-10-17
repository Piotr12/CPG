# om-auto-write-spec — CPG override

Extends the installed `om-auto-write-spec`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Spec file name (step 3)

`om-spec-writing` writes the spec at `${SPECS_DIR}/<stamp>-${SLUG}.md` (its own override). Use that path wherever this skill refers to `${SPECS_DIR}/{YYYY-MM-DD}-${SLUG}.md` — in the PR body, the `Spec:` reference line and follow-up comments. Evidence under `${SPECS_DIR}/assets/${SLUG}/` keeps its slug-only folder name.
