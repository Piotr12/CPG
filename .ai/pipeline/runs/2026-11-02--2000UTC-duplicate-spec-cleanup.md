# Execution plan: a push to main deletes the active copy of a spec already implemented or archived (#351)

**Date:** 2026-11-02 20:00 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task 62cb60f1, `om-auto-fix-issue 351` → `om-auto-implement-spec`)
Source doc: .ai/specs/2026-11-02--1953UTC-duplicate-spec-cleanup.md (spec PR #359; this branch carries it straight into `implemented/`)
Issue: #351

## Goal
`main` never deploys a commit that holds an active spec copy beside `implemented/` or `archive/`. A new `spec-copies.yml` deletes that copy on `main` and starts Deploy. Deploy's first job skips CI and the deploy for such a commit.

## Scope
- `scripts/spec-copies.ts` (pure `isValidName`, `activeCopies`), `scripts/delete-spec-copies.ts` (command), their tests.
- Config: `vitest.config.mts` (node project, coverage), `tsconfig.json` (include, `erasableSyntaxOnly`, `allowImportingTsExtensions`), `eslint.config.mjs` (`no-console` off for `scripts/**`).
- `tests/ai-filenames.test.ts` imports the shared functions.
- `.github/workflows/spec-copies.yml` (new), `.github/workflows/deploy.yml` (check job, `permissions`), `tests/spec-copies-workflows.test.ts`.
- AGENTS.md, `.ai/docs/engineering-standards.md`, `.ai/lessons.md`, the spec into `implemented/`.
- Deletes the active copy of #327's spec, which #355/#356 left on `main` (as #354 and #359 do).

## Non-goals
Branch protection, required checks or a merge queue. Where specs live. Deploying refs other than `main` (#360).

## Risks
- A workflow that pushes to `main` can only be exercised on `main`. The unit tests pin its wiring, and the command runs as a real `node` child process in a test. The first real run happens after merge: watch the first `spec-copies` run on `main`.

## Progress
> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Guard, workflows, docs
- [ ] 1.1 The guard's decision and its command
- [ ] 1.2 The workflows
- [ ] 1.3 Docs, lesson and the spec into implemented/
