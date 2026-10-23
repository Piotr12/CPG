# PR #171: merge-ready, and cut the integration suite's duration

**Date:** 2026-10-23 12:09 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-pr 171`, dispatched by cezar)
**Spec:** none (CI/test infrastructure; the datasets stay as spec `2026-10-22--0902UTC-test-tenant-two-datasets` defines them)
**Status:** done

## Goal

Drive PR #171 (the #166 app-icons wait) to merge-ready, and, as the owner asked, cut the integration suite's wall-clock time: trim and optimize it, keeping the dataset small but sufficient.

## Plan

1. Merge `main` into the PR branch (done: one `lessons.md` conflict, both sides kept).
2. Measure where the time goes, using CI run 39938282999 (PR #171, 16m16s job): ~3 min build and start of the image, then 742 s of test files run one at a time (`fileParallelism: false`).
3. Cut it:
   - `tests/integration/browser.ts`: run agent-browser's native binary, not its Node wrapper. The wrapper starts Node, and on Linux spawns `ldd` too, for every command; the suite sends thousands.
   - `.github/workflows/ci.yml`: shard the integration job across parallel runners (`vitest --shard`), each with its own container. (No separate result job in the end: there is no branch protection, and `deploy.yml`'s `needs: ci` already waits for every shard.)
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
- First full local run with the new helper: 427.9 s, 1 failure (the `tenants.test.ts` race above). Second full run after the fix: 388 passed, 1 skipped (`startup-guard`, Docker only), 0 failed, 428.1 s.
- 12:33 — Pushed 1429971. Fresh-context review: approve, minor findings only. Fixed: the native binary is used only when executable and not on musl; a syntax error fails at once; the last slice stays inside the deadline; the timeout names the last in-page error.
- CI run 39954264051: shards 2 and 4 green, 1 and 3 red. Shard 3 never ran tests: `agent-browser install --with-deps` stalled on Ubuntu's apt mirror (fonts-noto-cjk) until the 10-minute cap, and on shard 4 it took 9 min. Sharding multiplies that exposure. The runner image already has Chrome's libraries, so the install now runs without `--with-deps` (`tests/ci-workflow.test.ts` pins it). Shard 1 failed `app-icons.test.ts` with `[]`, #166 itself: signed out, `/admin` redirects to `/login` by a hard navigation (seen locally: the navigation entry is `/login`), and the read hit the new document before its head. The test now reads `/admin` signed in, waiting for its own path, which is the partially prerendered page its comment says it covers.
- CI run 39957643129 (docs-only a1c76a2): shard 2 failed `audit-history.test.ts` ("expected inverse not to be the correction"). `follow` waited for `subjectId=` in the URL after clicking, but the page it left already had one: another race the faster waits exposed. It now waits for the URL to change as well. Scanned the other URL waits after clicks: each waits for a parameter only the submit adds.
- CI run 39956419066 on 489b941: all green. Install 3 s per shard. Integration shards finished in 6.0, 6.0, 6.3 and 6.8 min (Vitest 309–365 s each, ~3 min of it the image build and start). Baseline: one 16m16s job.

## Changes

- `tests/integration/browser.ts`: native agent-browser binary; in-page polling for `waitUntil`/`waitFor`/`waitForText`; `click`/`clickRole` wait for finite animations.
- `tests/integration/tenants.test.ts`: wait for Test's header before reading. `tests/integration/audit-history.test.ts`: `follow` waits for the URL to change.
- `tests/integration/app-icons.test.ts`: the #166 wait, then `/admin` read signed in on its own path.
- `.github/workflows/ci.yml`: four-shard integration matrix, `agent-browser install` without `--with-deps`. `tests/ci-workflow.test.ts` pins both.
- `AGENTS.md`, `SDLC.md`: suite duration. `.ai/lessons.md`: three entries (driver races, agent-browser wait semantics, apt mirror and shards).
- Dataset: unchanged. Tiny is already small (2 months, ~1.4 s seed) and only three files reset Test. The realistic reset (38–41 s on the runner) stays in `test-reset-realistic.test.ts`, inside one shard.

## Verification

- Local, standalone build: full suite twice (second run 388 passed / 1 skipped / 0 failed, 428 s); sample boms + materials + api-tokens 54 s → 35 s; after the review fixes, six files (boms, materials, api-tokens, tenants, navigation, app-icons) 55/55; app-icons after its fix 5/5.
- `npm run lint`: 0 errors, 1 warning (`lineError` in `bom.service.ts`, already on `main`). `npm run typecheck`: exit 0. `npm run test:coverage`: 487 files, 3322 tests, 605 files fully covered. `npm run build`: exit 0 (this run made no app change after it).
- CI run 39956419066: lint, typecheck, unit-tests, build and integration-tests 1–4 all green. Integration wall-clock 16m16s → 6m48s (slowest shard).

## Follow-ups

- The CI run's critical path is now `unit-tests` (8m13s on 39956419066), not the integration suite.
- Each shard still spends ~3 min building the image. Building it once and sharing it would cut ~2 min more but adds an artifact hop. Not done.
