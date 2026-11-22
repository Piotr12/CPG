# Protect main: document what ties the production secrets to reviewed code (#371)

**Date:** 2026-11-22 07:42 UTC
**Agent:** Claude Code / Claude Opus 5.5 (om-auto-fix-issue, dispatched by cezar)
**Spec:** none (the issue's acceptance criteria are the scope)
**Status:** partial (docs PR open; the ruleset is the owner's repository setting)

## Goal

#371 has two criteria: (1) a ruleset on `main` that requires a pull request and the CI checks and blocks force pushes and deletion, and (2) AGENTS.md's Deployment bullet saying that `main`'s protection is what ties the `production` secrets to reviewed code. The issue says the owner makes (1), and that (2) can ship as a PR.

## Log

- 07:42 Triage: `gh api repos/Piotr12/CPG/rulesets` returns `[]` and `branches/main/protection` returns 404, so `main` has no protection. The gap is real and still open. The last 40 first-parent commits on `main` all came from pull requests.
- Classified as the bug route (a security gap, not a new feature). Claimed #371 (assignee, `in-progress`, claim comment).
- Found a conflict the owner has to settle before creating the ruleset: `spec-copies.yml` pushes its cleanup commit straight to `main` with `GITHUB_TOKEN` (#351). A ruleset with no bypass refuses that push, so the run fails whenever it finds a copy. Adding GitHub Actions as a bypass actor would reopen the hole #371 closes: any branch's workflow can ask for `contents: write` and `actions: write`, push an edited `deploy.yml` to `main` with `GITHUB_TOKEN`, then start Deploy on `main`. So the bypass is not the default; the choice goes to the owner.
- Added the sentence to AGENTS.md's Deployment bullet, and the same sentence to the copy of that bullet in `.ai/docs/engineering-standards.md` §4, so the two docs stay in step.
- The PR says `Refs #371`, not a closing keyword: criterion (1) stays open until the owner creates the ruleset. The PR should merge only after the ruleset exists, otherwise the new sentence describes a protection that isn't there yet.

- 07:51 PR #394's `unit-timing` failed: `mrp-run-timing.test.ts`, ten times, worst case for proposals, longest event-loop stall 1645 ms against a 1500 ms budget. The PR changes only docs, and `main`'s last four green runs measured 892–1207 ms for the same case, so this was runner noise. Re-ran the failed job, and it passed.
- 08:01 `unit-coverage` then failed by merging attempt 1's failing timing result. The run held two `unit-blob-timing` artifacts and `download-artifact` picked the stale one. Deleted the stale artifact (14745726155) and re-ran `unit-coverage`. Recorded as a lesson.

## Changes

- `AGENTS.md`: Deployment bullet.
- `.ai/docs/engineering-standards.md`: §4, the bullet that repeats the Deployment rule.
- `.ai/lessons.md`: a re-run unit shard leaves `unit-coverage` red until the stale blob artifact is deleted.

## Verification

- `npx vitest run tests/ai-filenames.test.ts`: 4 passed. `npm run lint`: clean. Docs only, so coverage, build and integration ran in CI.
- PR #394 CI run 44999593457, attempt 3: every check passed (lint, typecheck, unit-tests 1–2, unit-timing, unit-coverage, build, integration-tests 1–4).

## Follow-ups

- Owner: create the ruleset and decide how `spec-copies.yml` works once `main` refuses direct pushes.
- `ci.yml`'s `unit-coverage` could download only the latest attempt's blobs, so re-running a shard is enough. Separately, the ten-times worst-case stall (892–1645 ms against 1500) is close enough to its budget to flake.
