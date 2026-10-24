# Consolidate `.ai/lessons.md`

**Date:** 2026-10-23 21:55 UTC
**Agent:** Claude Code (claude-opus-5-5), dispatched by cezar
**Spec:** none (owner request: "can this be trimmed, every agent leaves a note, are they all required? if not, do a correction PR that aggregates that a bit")
**Status:** done

## Goal

`.ai/lessons.md` had grown to 167 bullets and 73 KB. Every agent reads it at the start of every task. Aggregate it without losing a distinct rule, and stop it from growing back the same way.

## Log

- 21:40 — Read all 167 entries on `main` (`db50cf07`). What I found:
  - **Exact or near duplicates:**
    - "A faster test driver exposes the waits…" (twice);
    - zsh `path` (twice);
    - stopping a standalone server by port (three times, counting "Kill the whole server");
    - standalone copies needing `static`/`public` and a fresh directory (six entries);
    - reversal to zero not erasing posting history (three);
    - `wait --fn` returning a DOM element (two);
    - absolute screenshot paths (two);
    - piped typecheck (two);
    - error `params` (three);
    - generated SQLite table rebuilds (two);
    - the shared integration app, admin and database (four);
    - hidden previous pages and dialogs (three).
  - **Same topic in neighbouring bullets:**
    - bulk writes;
    - paging;
    - dialogs and refresh;
    - tables and tall dialogs;
    - sidebar;
    - identity map;
    - migrations in tests;
    - agent-browser quirks;
    - streaming and hydration waits;
    - `next dev` diagnostics;
    - follow-up and spec paperwork.
  - **Misfiled:** about 20 "Agent pipeline (om-* skills)" bullets were general, UI or testing lessons. The "General" section held a mix of database, UI and process entries.
  - **Not needed:**
    - "Leave the full integration suite to CI" is already a standing rule in AGENTS.md (Testing).
    - "Apply the latest scoped authorization to a pending publication" was a one-off about one session's approval flow.
  - **Too long:** many bullets ran to five or more sentences of narrative. AGENTS.md asks for one or two.
- 21:50 — Rewrote the file into eight topic sections: database; services and errors; UI; unit tests; integration tests and agent-browser; Next.js; tooling and CI; process and pipeline.
  - Each merged lesson leads with the rule and keeps its evidence (issue, file), with sub-bullets where several related rules share one topic. The two `[details]` links are kept.
  - The header now says to search first and extend an existing entry.
  - AGENTS.md says the same, and why: a duplicate costs every later run.
  - I checked every old bullet against the new file. The workbook cell limit and centring sidebar targets were missing from the first draft, and I added them back.
- The two lessons added by open PR #193 (filing the spec as implemented, and adapting shared help copy) are folded in here: "Close the paperwork in the PR that does the work" and "Adapt shared help copy to each topic". They come out of #193, so the two PRs don't conflict.

## Changes

- `.ai/lessons.md`: 167 bullets and 73 KB down to 82 bullets and 30 KB, with no distinct rule dropped beyond the two listed above.
- `AGENTS.md`: the "Record lessons" step and the lessons template note.

## Verification

- `npx vitest run tests/` (repo-wide checks, including `ai-filenames` and `spec-images`): 17 files, 319 tests passed.
- No code changed, so lint, typecheck, coverage and build are unaffected; CI runs them on the PR.

## Follow-ups

- None. If entries start to duplicate again, the header rule is the place to tighten.
