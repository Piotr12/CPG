# om-followup-issue-from-pr — CPG override

Extends the installed `om-followup-issue-from-pr`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Slug derivation (step 3)

When deriving a document's `<slug>`, strip the stamp prefix `YYYY-MM-DD--HHMMUTC-` (and, for older files, a date-only `YYYY-MM-DD-` prefix) after removing the directory and `.md`. `.ai/specs/2026-10-17--1432UTC-work-order-release.md` → `work-order-release`.
