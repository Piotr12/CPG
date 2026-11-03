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
- Pending.

## Risks
- A `workflow_dispatch` on another ref can only really be exercised on GitHub. The test runs the refusal step with `bash` and pins the job conditions and the concurrency group. After merge, start Deploy by hand on a branch once and check that it fails at the first step.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The gate, its test and the docs

- [ ] 1.1 The gate, its test and the docs
