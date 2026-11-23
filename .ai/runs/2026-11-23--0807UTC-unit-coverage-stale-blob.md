# Re-running a failed unit shard leaves unit-coverage red (#399)

**Date:** 2026-11-23 08:07 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 399`, bug route)
**Spec:** none
**Status:** done

## Goal

`unit-coverage` merges only the newest attempt's blob for each unit shard, so re-running a failed shard is enough to
turn it green (#399).

## Log

- 08:07 Triage: still unfixed on `main` (`613426a4`). Both `unit-tests` and `unit-timing` upload a fixed artifact name
  (`unit-blob-<shard>`), and `unit-coverage` downloads `unit-blob-*` with `merge-multiple: true`, so a re-run's blob and
  the failed attempt's land together. Only open PR mentioning #399 is #394, which just refers to it. Claimed the issue.
- Root cause: GitHub keeps every attempt's artifacts in a re-run workflow run, and the pattern download takes all of
  them; the two attempts wrote the same file name, so which one the merge saw was up to the download order.
- Options weighed: (a) each shard deletes its earlier attempt's artifact before uploading needs `actions: write` on
  jobs that run `npm ci` and the tests, a permission #371 is wary of; (b) attempt-named blobs plus a "newest per shard"
  pick in `unit-coverage` needs no permission. Took (b).
- Fix: blobs are `blob-<shard>-${{ github.run_attempt }}.json` in artifacts `unit-blob-<shard>-<attempt>`;
  `unit-coverage` runs `scripts/delete-stale-blobs.ts blob-reports` between the download and the merge. Vitest's
  `--merge-reports` reads every file in the folder (`readBlobs` in `vitest/dist/chunks/cli-api.*.js`), so the names
  don't matter to it.
- The lesson #399 asks to remove is added by the still-open #394, not on `main`. Added the rewritten lesson here
  and asked #394 to drop its bullet.

## Changes

- `.github/workflows/ci.yml`: attempt-named blobs and artifacts; the stale-blob step in `unit-coverage`.
- `scripts/delete-stale-blobs.ts` + `.test.ts`: the newest-per-shard pick, with a plain-`node` child-process test.
- `tests/ci-workflow.test.ts`: pins the names and the step order.
- `.ai/lessons.md`: re-run artifacts accumulate per attempt.

## Verification

- `npx vitest run tests/ci-workflow.test.ts scripts/delete-stale-blobs.test.ts`: 16 passed. With `ci.yml` reverted,
  three `ci-workflow` tests fail (blob names, timing blob name, the stale-blob step).
- Gate: `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (5762 passed, 2 skipped, 100%),
  `npm run build` 0 on the retry after Next.js's one-off `SecurityFatalError` advisory stop (lesson 2026-11-22; no
  upgrade run). No integration file touched; the change is CI-only, so no UI check.

## Follow-ups

- The re-run path itself can only be exercised on a real CI run: re-run one shard of this PR's run and check
  `unit-coverage`'s log prints the deleted stale blob.
