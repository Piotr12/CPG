# Execution plan: Deploy ships main only (#360)

**Date:** 2026-11-03 06:36 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task d9e0e7c1, `om-auto-fix-issue 360` → `om-auto-write-spec` → `om-auto-implement-spec`)
Source doc: .ai/specs/2026-11-03--0633UTC-deploy-main-only.md (spec PR #365; this branch carries it straight into `implemented/`)
Issue: #360

## Goal
A Deploy started by hand on any ref but `refs/heads/main` fails at its first step and never reaches `ci` or `deploy`. The `deploy` job checks the ref itself. A refused run can't cancel a `main` deploy waiting in `deploy-production`.

## Scope
- `.github/workflows/deploy.yml`: the refusal step first in `spec-copies`, `if:` on `deploy`, a ref-dependent concurrency group.
- `tests/deploy-workflow.test.ts` (new).
- AGENTS.md (Deployment bullet), `.ai/docs/engineering-standards.md` (CI/CD), the spec into `implemented/`.

## Non-goals
Branch protection, environments, `ci.yml`, `spec-copies.yml`, the Kamal configuration.

## Verification
- Full gate on 639ecb33: `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (677 files, 5,632 passed, 2 skipped, 100% coverage), `npm run build` 0.
- Mutations: deleting the step's `exit 1` fails 6 tests, deleting `deploy`'s `if` fails 1, and reading the ref through `${{ github.ref }}` fails 7.
- After the review fixes (5889f88e): `npx vitest run tests/deploy-workflow.test.ts tests/spec-copies-workflows.test.ts tests/ai-filenames.test.ts` 29 passed, lint 0, typecheck 0.
- No integration test, because no page or flow changes.

## Follow-ups
- #368: bind the deploy secrets to a `production` environment that only `main` may use, so a branch's own copy of `deploy.yml` can't deploy.

## Risks
- A `workflow_dispatch` on another ref can only really be exercised on GitHub. The test runs the refusal step with `bash` and pins the job conditions and the concurrency group. After merge, start Deploy by hand on a branch once and check that it fails at the first step.

## Progress
PR: #367

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The gate, its test and the docs

- [x] 1.1 The gate, its test and the docs — 639ecb33

### Review
- [x] R.1 Fresh-context review (approve: 1 design limit, filed as #368 and noted in the docs; 3 low findings) fixed — 5889f88e
