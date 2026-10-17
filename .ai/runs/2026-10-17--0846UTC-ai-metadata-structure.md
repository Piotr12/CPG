# Set up AI metadata structure

**Date:** 2026-10-17
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none
**Status:** done

## Goal

Create `AGENTS.md`, `CLAUDE.md` (importing `@AGENTS.md`) and the `.ai/` folder with `specs/` (+ `implemented/`, `archive/`), `runs/`, `lessons.md` and `lessons/`, each folder with a README, and make the agent files enforce using them.

## Log

- `.gitignore` ignored the whole `/.ai/` (added for cezar). Narrowed it to `/.ai/cezar/` so the new metadata is tracked while cezar's local state stays ignored.
- Kept the `next dev`-managed Next.js block at the top of `AGENTS.md` unchanged and appended the project rules below it.
- Same naming convention (`YYYY-MM-DD-slug.md`) applied to `lessons/` long-form write-ups for consistency.

## Changes

- `.gitignore`, `AGENTS.md`, `CLAUDE.md`
- `.ai/README.md`, `.ai/lessons.md`
- `.ai/specs/README.md`, `.ai/specs/implemented/README.md`, `.ai/specs/archive/README.md`
- `.ai/runs/README.md`, `.ai/runs/2026-10-17--0846UTC-ai-metadata-structure.md`
- `.ai/lessons/README.md`

## Verification

- `git status` shows the new `.ai/` files as tracked and nothing under `.ai/cezar/`.

## Follow-ups

- None.
