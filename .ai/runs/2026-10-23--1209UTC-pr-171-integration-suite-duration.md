# PR #171: merge-ready, and cut the integration suite's duration

**Date:** 2026-10-23 12:09 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr 171`, dispatched by cezar)
**Spec:** none (CI/test infrastructure; the datasets stay as spec `2026-10-22--0902UTC-test-tenant-two-datasets` defines them)
**Status:** in progress

## Goal

Drive PR #171 (the #166 app-icons wait) to merge-ready, and, as the owner asked, cut the integration suite's wall-clock time: trim and optimize it, keeping the dataset small but sufficient.

## Plan

1. Merge `main` into the PR branch (done: one `lessons.md` conflict, both sides kept).
2. Measure where the time goes, using CI run 39938282999 (PR #171, 16m16s job): ~3 min build and start of the image, then 742 s of test files run one at a time (`fileParallelism: false`).
3. Cut it:
   - `tests/integration/browser.ts`: run agent-browser's native binary, not its Node wrapper. The wrapper starts Node, and on Linux spawns `ldd` too, for every command; the suite sends thousands.
   - `.github/workflows/ci.yml`: shard the integration job across parallel runners (`vitest --shard`), each with its own container, and keep one `integration-tests` result job.
   - Look at the dataset and the slowest files for anything that does not need to be there.
4. Verify: the gate, the touched integration files against a standalone build, then the PR's CI time against the 16m16s baseline.

## Log

- 12:09 — Claimed #171, merged `origin/main` (conflict in `.ai/lessons.md`: both sides' Testing entries kept).
- 12:09 — Baseline from CI run 39938282999: job 16m16s; `npm ci` 30 s, browser install 14 s, image build and start ~3 min, files 742 s. Slowest: `test-reset-realistic` 51 s (the realistic reset alone takes 38.1 s), `boms` 34 s, `planning-parameters` 34 s, `test-reset` 33 s, `navigation` 29 s.
- Dataset: tiny (2 months, ~550 documents) seeds at startup in ~1.4 s locally, and only three files reset Test. The dataset isn't what makes the suite slow: the browser-driven files are.
- Where the time goes, from a local run that logged every agent-browser command: 6,756 commands, ~400 s of a 428 s run. Every command went through `node_modules/.bin/agent-browser`, a Node wrapper that starts Node (and runs `ldd` on Linux) and then the native binary: 72 ms against 3.4 ms per call on the dev Mac. agent-browser's `wait` (`--fn`, `<selector>`, `--text`) polls every 100 ms: a condition true after 50 ms answers after 107 ms. `waitUntil`, `waitFor` and `waitForText` are about 1,000 of those commands.
- Probed the native waits' semantics so the replacements keep them: an expression that throws counts as false; the timeout is 25 s ("Wait timed out after 25000ms"); `wait <selector>` checks only the **first** match and needs a box and no `visibility: hidden`; `wait --text` is a case-sensitive substring of `innerText`. `eval` awaits a promise, and a navigation ends it with an error ("Inspected target navigated or closed").
- `browser.ts`: native binary (wrapper as fallback); `waitUntil` polls in the page every 10 ms in 2 s slices, retries across navigations, and keeps the 25 s limit; `waitFor`/`waitForText` use it with the probed semantics. Sample (boms, materials, api-tokens): 54 s → 35 s.
- The faster driver exposed races the wrapper's ~70 ms per command had hidden. Two files clicked a confirmation's destructive button while the alert dialog was still animating in ("covered by div.fixed.inset-0"). `click`/`clickRole` now first wait until the page's finite animations have finished, for at most 1 s. `tenants.test.ts` read the page after `waitFor("[data-slot=card-description]")`, which `/admin` already satisfies: it now waits for Test's own header first.
- CI: the integration job runs as a 4-shard matrix (`--shard=${{ matrix.shard }}/${{ strategy.job-total }}`, `fail-fast: false`). With the baseline durations, Vitest's hash split gives shards of 224/160/197/161 s. `tests/ci-workflow.test.ts` pins the sharding.
- First full local run with the new helper: 427.9 s, 1 failure (the `tenants.test.ts` race above).

## Changes

## Verification

## Follow-ups
