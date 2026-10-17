# om-spec-writing — CPG override

Extends the installed `om-spec-writing`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Spec file name (step 2, `references/agentic-setup.md`)

Create the spec at `${SPECS_DIR}/<stamp>-<kebab-case-title>.md`, e.g. `.ai/specs/2026-10-17--1432UTC-work-order-release.md`. Never rename it afterwards; when it is fully implemented it moves to `.ai/specs/implemented/` with the same name (AGENTS.md, "Before finishing").
