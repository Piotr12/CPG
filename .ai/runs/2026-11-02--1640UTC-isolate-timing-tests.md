# Run the timing tests on a runner of their own (#337)

**Date:** 2026-11-02 16:40 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 337`)
**Spec:** none (the budgets stay `2026-10-27--0556UTC-mrp-runs`'s, Risks)
**Status:** done

## Goal

The MRP timing test's CI bounds fail on unchanged code when other test files share its runner (#337).
Make the CI bound measure the code, not the runner's contention, without loosening `CI_FACTOR`.

## Log

- 16:00 Triage. Since #338 split the unit suite (merged 10:23 UTC) the timing test has not failed: the five red
  unit runs since then failed in `tests/ai-filenames.test.ts` (four) and two migration tests (one). The margin
  is thin, though: across four post-split runs the ten-times run reached 26,066 ms of 30,000 (worst case 15,915–23,419)
  and the longest stall 1,113 ms of 1,500, against a worst case of 15.7–21.4 s right after the split.
- 16:35 Decision. The issue leaves the choice to the owner; the owner told the run to proceed on reasonable
  assumptions, so it takes the issue's first option and the one that keeps the contract: run the timing files
  on their own. `CI_FACTOR` and the budgets are unchanged.
- Three files assert an upper time bound: `mrp-run-timing.test.ts`, `mrp-report-reads.test.ts`,
  `demand-review-reads.test.ts`. `write-gate.test.ts` measures time too, but only lower bounds, which contention
  can't break, so it stays in the shards.
- Plan: a `timing` Vitest project lists the three files and the `node` project excludes them; the shards run
  `--project=!timing`; a `unit-timing` job runs `--project=timing --no-file-parallelism`, writes a blob with
  coverage, and `unit-coverage` merges it with the shards'. `tests/ci-workflow.test.ts` checks the jobs, and a
  repo test checks every test file asserting an upper time bound is in the timing project.
- 16:45 Implemented as planned; the owner's instruction to proceed counts as the decision the issue asked for.
- 16:47 Local CI flow (shard 1/2, shard 2/2 with `--project=!timing`, then the timing project with
  `--no-file-parallelism`, then `--merge-reports`): 669 files, 100% coverage on all four measures. One failure,
  `tests/ai-filenames.test.ts`, is `main`'s own (the active copy of #320's spec), fixed by open PR #350.

- 17:35 CI on #357 (run 41486362110): `unit-timing` green in 232 s. Ten-times worst case 16,439 ms (15,915–23,419
  in a shard), run 11,131 ms (17,076–26,066), longest stall 861 ms (up to 1,113). `unit-tests (2)` failed only on
  `main`'s spec duplicate, so this PR deletes the active copy too, as #338 did; #350 deletes the same file.

## Changes

- `vitest.config.mts`: `TIMING_TESTS` and a `timing` project; the `node` project excludes those files.
- `.github/workflows/ci.yml`: shards run `--project=!timing`; new `unit-timing` job; `unit-coverage` needs both.
- `tests/ci-workflow.test.ts`: pins the timing job, the shards' exclusion and the merge's `needs`.
- `tests/timing-tests.test.ts` (new): every test asserting an upper bound on a `performance.now()` figure is in
  the timing project and nothing else is; the node project excludes them.
- `.ai/lessons.md`: new timing-project lesson.
- `.ai/specs/2026-11-02--1304UTC-mrp-make-proposal-acceptance.md`: deleted (its `implemented/` copy stays).

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
- `tests/ci-workflow.test.ts` + `tests/timing-tests.test.ts`: 11 passed. Dropping `demand-review-reads.test.ts`
  from `TIMING_TESTS` fails the detector test (mutation check), and the config was restored.
- Local CI flow as above: shard 1 333 files passed (135 s), shard 2 332 of 333 (59 s, `main`'s spec failure),
  timing 3 files 54 tests passed, 2 skipped (92 s), merge 100% statements/branches/functions/lines.
- Timing job alone, locally: ten-times run 4,880 ms, worst case 6,639 ms, longest stall 339 ms.
- Review (independent subagent): approve, minors only. Applied: the detector also counts `toBeLessThanOrEqual`,
  `assert.ok(… < …)` and `process.hrtime`, skips itself, and scans the node project's include; comment fixes.
- The CI run on #357 is the evidence that matters for the bound; its figures are recorded on the PR.

## Follow-ups

- #350 deletes the same spec copy; whichever lands second merges cleanly.
