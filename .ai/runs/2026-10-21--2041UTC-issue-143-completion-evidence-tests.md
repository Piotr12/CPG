# E10-S03 — prove completions after a BOM revision or deactivation, read-only refusals, expired recipes and help search (#143)

**Date:** 2026-10-21 20:41 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (issue #143; catalogue `.ai/specs/research/CPG-acceptance.md`)
**Status:** done (PR #160, merged 2026-10-23 with CI green)

## Goal

Add the five tests #143 lists (T1–T5) and move the catalogue rows they prove to `Passed (automated)`. No behaviour change unless a test exposes a bug.

## Log

- 20:41 — Step 1: #143 unclaimed, no PR references it. Labelled `refactor` (tests only), so it took the bug chain by default; the triage gate confirmed each gap on `main` at `1882d6a`:
  - T1: `production-completion.service.test.ts` asserts the preview after revision 2 and deactivation, never a posted completion; nothing reactivates the BOM.
  - T2: the E2E-011 test in `tests/integration/production-completions.test.ts` checks the 409 but not stock or history.
  - T3: `production-order.service.test.ts` refuses explicit superseded pairs, not an explicit expired one.
  - T4: `search-help.test.ts` searches the real topics for "sign" only.
  - T5: the PRD-011 test's title says "leaving 60 outstanding" but it asserts `produced` only.
- 20:41 — Branch `fix/issue-143-completion-bom-readonly-help-tests` off `origin/main`; `npm ci --ignore-scripts`. Claimed #143.
- Plan: T1 drives the revision, deactivation and reactivation through `BomService.update`, as an admin would, then posts. T2 snapshots the stock ledgers before the refused POST and compares after. T3 makes an expired revision 2 the BOM's current one, so the pair is refused for its dates, not as superseded. T4 searches EN "completion" and the PL word the topic uses ("wykonanie"). T5 adds `outstanding` to the existing assertion.
- 20:44 — T4 first assumed the topic would be the first result for "posting a completion"; `tenant-audit` ranks first, since the search filters rather than ranks. The test now picks the topic by id from the "completion" results.
- 20:55 — No test exposed a bug, so there's no production change. Docker isn't reachable from this account (`~/.docker/run/docker.sock` missing), so the integration file ran against the standalone build (lesson of 2026-10-19).
- 21:05 — PR #160 opened, lock moved to the PR. An independent review subagent approved with 2 minors and 4 nits, all fixed:
  - the UX-013 evidence cited a code fact (`HELP_TOPIC_ROUTES`) that no test asserted; the test now asserts it;
  - the run log wasn't finalized;
  - E2E-011's `before` snapshot is now checked to be non-empty;
  - the PL query is now "księgowanie wykonania", which only the posting paragraph matches;
  - the shadowed `bom`/`revision` names are renamed;
  - the "Last updated" line now names the base commit.

## Changes
- `packages/core/src/services/production-orders/production-completion.service.test.ts` — T1 (new test), T5 (`outstanding`).
- `packages/core/src/services/production-orders/production-order.service.test.ts` — T3 (new test).
- `packages/app/src/help/search-help.test.ts` — T4 (new test).
- `tests/integration/production-completions.test.ts` — T2 (E2E-011 test extended).
- `.ai/specs/research/CPG-acceptance.md` — LFC-022, BOM-026, BOM-028, BOM-029, UX-013, E2E-011 → `Passed (automated)`. None of them has an MRP half.

## Verification
- `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (483 files, 3,266 tests, thresholds met), `npm run build` 0.
- `CPG_BASE_URL=http://127.0.0.1:3143 npm run test:integration -- tests/integration/production-completions.test.ts` against `node packages/app/server.js` from this build on an empty `DATA_DIR`: 4/4 passed.
- After the review fixes: the same four gate commands passed again (0/0/0/0, 3,266 tests), and the integration file passed 4/4 again on a fresh standalone build.
- The full integration suite runs in the PR's CI.

## Follow-ups
- None from this change.
