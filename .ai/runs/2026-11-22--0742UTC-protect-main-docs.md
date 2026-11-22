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

## Changes

- `AGENTS.md`: Deployment bullet.
- `.ai/docs/engineering-standards.md`: §4, the bullet that repeats the Deployment rule.

## Verification

- See the PR's summary comment and CI run. Docs-only change: no code, coverage or build surface changed.

## Follow-ups

- Owner: create the ruleset and decide how `spec-copies.yml` works once `main` refuses direct pushes.
