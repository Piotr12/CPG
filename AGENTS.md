<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Instructions for every AI agent (Claude Code, Codex, Cursor, …) working in this repository. `CLAUDE.md` only imports this file — keep all agent rules here.

## The `.ai/` metadata folder

All AI working metadata lives in `.ai/`. Using it is **mandatory**, not optional.

```
.ai/
├── README.md
├── specs/                  # SDD specifications (written by the human, implemented by agents)
│   ├── README.md
│   ├── YYYY-MM-DD-slug.md  # active specs — not yet fully implemented
│   ├── implemented/        # specs that have been fully implemented
│   │   └── README.md
│   └── archive/            # specs that were superseded, abandoned or rejected
│       └── README.md
├── runs/                   # one log per autonomous AI run
│   ├── README.md
│   └── YYYY-MM-DD-slug.md
├── lessons.md              # long-term memory: index of lessons learned
└── lessons/                # long-form write-ups linked from lessons.md
    ├── README.md
    └── YYYY-MM-DD-slug.md
```

`.ai/cezar/` is local state of the cezar cockpit — it is gitignored; never edit or commit it.

### Naming convention

Every file in `specs/` (and its subfolders), `runs/` and `lessons/` is named `YYYY-MM-DD-slug.md`:

- `YYYY-MM-DD` — the date the file was **created** (never changed afterwards, even when a spec is moved).
- `slug` — short, lowercase, kebab-case description, e.g. `2026-10-17-user-login.md`.
- If the name is already taken, append a counter: `2026-10-17-user-login-2.md`.

`README.md` files are the only exception.

## Mandatory workflow

### 1. Before starting any task

1. **Read `.ai/lessons.md`** and open any linked lesson relevant to the task. Do not repeat a mistake that is already recorded there.
2. **Check `.ai/specs/`** for a spec covering the task. If one exists, it is the source of truth — implement what it says. If the task conflicts with the spec, stop and ask the human instead of guessing.
3. **If this is an autonomous run** (you are working without a human approving each step — e.g. dispatched by cezar, a scheduled/automated job, a headless session), **create the run log** `.ai/runs/YYYY-MM-DD-slug.md` right away (template below).

### 2. While working

- Keep the run log up to date as you go (decisions, deviations from the spec, blockers) — not only at the end, so an interrupted run still leaves a trail.
- Do not rewrite the intent of a spec. Specs are authored by the human. You may tick off checklist items or add an `## Implementation notes` section; anything that changes scope must be raised with the human.

### 3. Before finishing

1. **Finalize the run log**: outcome, what changed, how it was verified, follow-ups.
2. **Record lessons**: after fixing a bug, hitting a non-obvious pitfall, or discovering something worth remembering long-term, add an entry to `.ai/lessons.md` (see format below). Update or remove entries that turned out to be wrong.
3. **Move the spec** once it is fully implemented and verified: `git mv .ai/specs/<file> .ai/specs/implemented/`. Superseded or abandoned specs go to `.ai/specs/archive/` (add a one-line note at the top of the spec saying why).
4. Commit the `.ai/` changes together with the code they describe.

## Templates

### Spec — `.ai/specs/YYYY-MM-DD-slug.md`

```markdown
# <Title>

**Status:** draft | ready | in progress | implemented | archived
**Created:** YYYY-MM-DD

## Goal
## Context
## Requirements
- [ ] ...
## Out of scope
## Acceptance criteria
```

### Run log — `.ai/runs/YYYY-MM-DD-slug.md`

```markdown
# <Title>

**Date:** YYYY-MM-DD
**Agent:** <tool / model>
**Spec:** <path to spec, or "none">
**Status:** in progress | done | partial | failed | blocked

## Goal
## Log
- <timestamped notes: steps taken, decisions, deviations>
## Changes
- <files / commits>
## Verification
- <commands run and their results>
## Follow-ups
```

### Lesson — entry in `.ai/lessons.md`

```markdown
- **YYYY-MM-DD — <short title>** — <what happened / what to do instead, one or two sentences>. [details](lessons/YYYY-MM-DD-slug.md)
```

Keep `lessons.md` short and scannable — one bullet per lesson, grouped by topic. When a lesson needs more than a couple of sentences (root cause analysis, reproduction steps, code samples), write it up in `.ai/lessons/YYYY-MM-DD-slug.md` and link it from the bullet.
