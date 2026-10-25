# Fix #216: `label_exists` misses defined labels under `set -o pipefail`

**Date:** 2026-10-25 11:59 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 216`, dispatched by cezar)
**Spec:** none (bug)
**Status:** in progress

## Goal

Make the tracker descriptor's label guards find every defined label under `set -o pipefail` (issue #216).

## Log

- 11:59 Issue is a `bug`, assigned to the automation user, no open PR references it, no other claim. Triage: `.ai/trackers/github.md` still pipes the label listing into `grep -Fxq`, so it is unfixed. Claimed: `in-progress` + claim comment. Branch `fix/issue-216-label-guard-pipefail` in the cezar worktree.
- Reproduced against the live repo with the guard as written, five calls per label under `pipefail`: `ci-monitoring` 1/5, `in-progress` 3/5, `review` and `risk-low` 5/5, same as the issue.
- Fix: `grep -Fx -- "$1" >/dev/null` instead of `grep -Fxq "$1"`. Without `-q` grep reads the whole listing, so the writer never meets a closed pipe. `--` also lets a label that starts with `-` match. Rejected: collecting the names into a variable and piping them into `grep -q` with `printf`, since a long `printf` can meet the same broken pipe.
- Only the repo's copy (`.ai/trackers/github.md`) changes. The vendored source in `.agents/skills/om-setup-agent-pipeline/references/trackers/github.md` has the same line but is never edited here (AGENTS.md). Fixing it upstream is a follow-up.
- Regression test `tests/tracker-label-guards.test.ts` pulls the guards out of the descriptor and runs them in bash with `pipefail` against a fake `gh` whose listing (100,000 names) is far longer than a pipe buffer. With the old line, 2 of 4 tests fail and every early label reads "missing". With the fix, all pass.

## Changes

- `.ai/trackers/github.md` — `label_exists` no longer uses `grep -q`, and a comment explains why.
- `tests/tracker-label-guards.test.ts` — the regression test.
- `.ai/lessons.md` — the existing "Tracker label guards" lesson now states the general rule and points at the fix.

## Verification

- Live probe, five calls per label under `pipefail` with the fixed guard: `ci-monitoring`, `in-progress`, `review`, `risk-low` 5/5 each, and an undefined label answers false. zsh with `setopt pipefail`: 5/5.
- `npx vitest run tests/tracker-label-guards.test.ts` passes 4/4, and fails 2/4 with the old line.
- Gate, after `npm ci` (the worktree had no dependencies installed, so the first typecheck failed on missing modules): `npm run lint` 0 errors (1 warning in `packages/core/src/services/boms/bom.service.ts`, already on main); `npm run typecheck` exit 0; `npm run test:coverage` exit 0, 570 files and 4327 tests passed at the 100% thresholds; `npm run build` exit 0.
- No integration test: the change touches no page or flow.

## Follow-ups

- Upstream: the same `grep -Fxq` line is in the om-* collection's `om-setup-agent-pipeline/references/trackers/github.md`, so new installs copy the bug.
