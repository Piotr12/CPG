# om-auto-implement-spec — CPG override

Extends the installed `om-auto-implement-spec`. Everything not listed here applies unchanged.

**The stamp** is the creation time in UTC with the minute: `STAMP=$(date -u +%Y-%m-%d--%H%MUTC)` → `2026-10-17--1432UTC`. It is the repo naming convention from AGENTS.md (see `.ai/skills/README.md`).

## Spec lookup (`references/spec-resolution.md`)

When matching a spec name or slug against filenames in `$SPECS_DIR` (and `$SPECS_DIR/implemented/`), strip the stamp prefix `YYYY-MM-DD--HHMMUTC-` before comparing. Still accept a date-only `YYYY-MM-DD-` prefix for specs written before this override existed.
