# Drive PR #349 (MRP snapshot reads, #321) to merge-ready

**Date:** 2026-11-02 16:04 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr 349`, dispatched by cezar)
**Spec:** none for this run (#349 implements #321's known limits, recorded in `.ai/specs/implemented/2026-11-01--0737UTC-mrp-planning-exceptions.md`)
**Status:** blocked

## Goal

Get #349 to merge-ready without merging it: base merged in, review clean, required checks green.

## Log

- 16:00 Claimed #349 (already assigned to Piotr12, no foreign lock). The PR was `CONFLICTING` against `main`.
- 16:00 Merged `origin/main` (2dc4ad75). One conflict, in `.ai/docs/engineering-standards.md` line 75–76: `main` extended the `data-table.tsx` bullet (#311 pinned columns) and this PR extended the sort/search bullet (`notCalendarDate`). Non-overlapping, so I kept both. Lint and typecheck pass. Pushed 8717ebea.
- 16:02 `tests/ai-filenames.test.ts` fails on `main` again: #344 (the spec PR) merged after #345 had moved `2026-11-02--1304UTC-mrp-make-proposal-acceptance.md` to `implemented/`, so both copies exist. This is base breakage and out of scope for #349. Opened #350 to delete the active copy, the same fix #347 made for #340. With it, the test passes (5/5).
- 16:03 Re-review of the full diff and the merge: no blocker, major or minor. One nit: an overlong doc-comment line in `snapshot/forecasts.ts` (the 50e59d63 edit). Fixed it. The earlier review's findings were all handled in 50e59d63, and nothing in `main`'s MRP changes (#345) touches the snapshot read modules.
- 16:30 CI for 34e982bc ([run 41478450273](https://github.com/Piotr12/CPG/actions/runs/41478450273)): lint, typecheck, build, unit shard 1, integration 1–4 ✅. Unit shard 2 and unit-coverage ❌, only `tests/ai-filenames.test.ts`, the base breakage. Labels: `blocked` until #350 merges. `ci-monitoring` removed.

## Outcome

The code is merge-ready: base merged, re-review approves, local gate green. CI is blocked only by `main`'s duplicate spec, which #350 removes (#350's CI is all green).

## Changes

- Merge commit 8717ebea (`main` into the PR branch).
- `packages/core/src/services/mrp/snapshot/forecasts.ts`: doc comment rewrapped.
- Separate PR #350: deletes the duplicate active spec on `main`.

## Verification

- `npm run lint`, `npm run typecheck`: pass on the merge result.
- `npm run test:coverage` on the merge result: 5,547 passed, with 1 failure, `tests/ai-filenames.test.ts`, the base breakage above (fails on `main` too).
- `npm run test:coverage` with that duplicate spec set aside locally (as #350 does, not committed here): 669 files, 5,548 passed, 2 skipped, coverage thresholds (100%) met, exit 0.
- `npm run build`: pass.
- Integration tests: not run locally. The PR changes no page or flow, and CI runs all four shards.

## Follow-ups

- Merge #350, re-run #349's failed jobs (unit shard 2, unit-coverage), then `om-approve-merge-pr 349`.
- Human decision, not blocking: should a corrupt date on a *historical* forecast or completed line flag its material on every run? The chain kept that behaviour on purpose; see the PR's summary comment.
