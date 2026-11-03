# Execution plan: deploy secrets live in a production environment that only main may use (#368)

**Date:** 2026-11-03 08:17 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task e2f2f203, `om-auto-fix-issue 368` → `om-auto-write-spec` → `om-auto-implement-spec`)
Source doc: .ai/specs/2026-11-03--0815UTC-deploy-secrets-production-environment.md (spec PR #370; this branch carries it straight into `implemented/`)
Issue: #368

## Goal
The `deploy` job names the `production` environment, a test keeps every secret-reading job in any workflow bound to it, and the docs drop #367's caveat. The owner moves the secrets into the environment, which only `main` may use, and deletes the repository copies.

## Scope
- `.github/workflows/deploy.yml`: `environment: production` on `deploy`.
- `tests/deploy-workflow.test.ts`: the environment and a secret scan over every workflow file.
- AGENTS.md (Deployment bullet), `.ai/docs/engineering-standards.md` (CI/CD), the spec into `implemented/`.

## Non-goals
Branch protection, reviewers or timers on the environment, `ci.yml`, `spec-copies.yml`, the Kamal configuration. The repository settings themselves, which the owner changes (spec step 4).

## Log
- 08:13 UTC — FR triage: #368 open and unclaimed, no PR references it, no `environment:` in any workflow, no environments on the repository, `SDLC.md` has no Definition of Ready. GitHub's docs (read from the public `github/docs` repository; WebFetch was denied): branch rules match `GITHUB_REF`, environment secrets reach only jobs naming the environment, a missing environment is created without rules on first use.
- 08:15 UTC — spec PR #370 (design only, `Refs #368`).
- 08:17 UTC — implementation branch `feat/deploy-secrets-production-environment` from `origin/main`. Deviation from the feature route's `Closes`: this PR references #368 (spec Q7), because merging can't delete the repository secrets.

## Verification
- Mutations: deleting `environment: production` fails 2 tests; adding a `ci.yml` job that echoes `secrets.SSH_PRIVATE_KEY` fails the scan.

## Follow-ups
- Owner: the five settings steps in the spec (environment and `main` rule, its secrets, merge, check a `main` deploy, delete the repository secrets), then close #368.

## Risks
- The environment only protects the secrets once the repository copies are deleted. Until then a branch's copy can still read them, as today.

## Progress
PR: (pending)

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The environment, its test and the docs

- [ ] 1.1 The environment, its test and the docs

### Review
- [ ] R.1 Fresh-context review
