# .ai

Metadata for AI-assisted development of this project. The rules for using it live in [`AGENTS.md`](../AGENTS.md) at the repository root.

| Path | Purpose |
| --- | --- |
| [`docs/`](docs/) | Standing project documents, e.g. [`engineering-standards.md`](docs/engineering-standards.md) |
| [`specs/`](specs/) | Specifications for spec-driven development (SDD) |
| [`runs/`](runs/) | Logs of autonomous AI runs |
| [`lessons.md`](lessons.md) | Long-term memory: lessons learned by AI agents |
| [`lessons/`](lessons/) | Long-form lesson write-ups linked from `lessons.md` |
| [`agentic.config.json`](agentic.config.json) | Settings of the om-* agent pipeline (see [`SDLC.md`](../SDLC.md)) |
| [`pipeline/runs/`](pipeline/runs/) | om-* execution plans and run folders |
| [`skills/`](skills/) | Repo-local overrides of the om-* skills |
| [`trackers/`](trackers/), [`browsers/`](browsers/) | How the om-* skills talk to GitHub and drive the browser |
| `analysis/`, `scripts/`, `qa/` | om-* reports, test-environment scripts, QA state (run artifacts are gitignored) |

`cezar/` holds local state of the cezar cockpit and is gitignored.

All files in `specs/`, `runs/` and `lessons/` (not `docs/`, whose files keep stable names), are named `YYYY-MM-DD--HHMMUTC-slug.md`, and each run in `pipeline/runs/` is named `YYYY-MM-DD--HHMMUTC-slug` (plus `.md` for a flat plan) — creation date and 24-hour **UTC** time, e.g. `2026-10-17--1432UTC-user-login.md` (`date -u +%Y-%m-%d--%H%MUTC`). The om-* skills' fixed-name spec files (`product-brief.md`, `backlog.md`, `assets/`, `research/`) are exempt. `npm test` checks it.
