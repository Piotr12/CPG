# Two Test datasets: tiny by default, realistic on request (#163)

**Date:** 2026-10-22 09:02 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 163` redirected by the owner, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md`
**Status:** done

## Goal

Turn `main` green for good (#163) by the owner's decision: a tiny dataset for startup, the default reset
and the integration tests; the realistic two-year dataset as an admin reset option.

## Log

- 06:55–09:30 — Triage and profiling for #163 (the realistic seed: 8.9 s locally, ~61,600 statements,
  ORM-bound). Performance work (seed paths without read-back views, batched posting lookups, a
  prepared-statement cache) brought it to ~6.1 s locally, still above the budget on CI. Parked on the
  local branch `wip/issue-163-seed-perf` (not pushed) when the owner chose this direction instead.
- 09:02 — Owner's decision: only the two-dataset feature, as its own spec and implementation PR, tiny
  the default for startup and tests. Wrote the spec. Tiny = 2-month history of the same generator:
  measured 83 customer orders, 73 purchase orders, 476 movements for 2026-10-21 (1 month: 60/53/324;
  3 months: 106/89/623). Two months keeps the masters identical and matches the unit tests' reduced config.

- 09:30 — `domain/demo/test-datasets.ts` (names, default, configurations); the container's `testDatasets`
  replaces `testTenantConfig`; the seeder, startup seed and reset take a dataset name; the reset audits it.
  First test draft wrongly expected identical masters: BOM validity and the safety-stock series start with
  the history, and forecasts average it; the test now pins exactly that.
- 10:00 — API body and UI action accept the optional `dataset`; the Reset Test card got a Dataset select
  (the confirm dialog has no content slot), en/pl copy, help text.
- 10:30 — Integration: volume checks moved to `test-reset-realistic.test.ts` (API reset to realistic and
  back). No Docker on this Mac, so the touched files ran against the production standalone build with
  `CPG_BASE_URL`. First runs: a dialog overlay still fading (added a wait) and a purchasing UI paging check
  (moved). A "fresh" server restart silently failed with EADDRINUSE, so a rerun hit the old server's users;
  killing by port fixed it (lesson).

## Changes

- Core: `domain/demo/test-datasets.ts`, container/cradle `testDatasets`, `seed-demo-data.ts`, `demo-data.ts`,
  `test-reset.service.ts` (dataset parameter, audited), `validators/tenants/test-reset.schema.ts`.
- App: reset route and server action pass the dataset; `reset-test-card.tsx` Dataset select; en/pl messages; help.
- Tests: unit tests for all of the above; `tests/setup/demo-fixtures.ts` loses `REDUCED_TEST_TENANT_CONFIG`;
  integration `test-reset-realistic.test.ts` (new), `test-reset`, `test-reset-api`, `stock-report`,
  `purchasing`, `purchasing-api`, `customer-orders` adapted.
- Docs: spec `implemented/2026-10-22--0902UTC-test-tenant-two-datasets.md`, amendment note in spec #126,
  `BACKWARD_COMPATIBILITY.md` §4 reset entry, lessons.

## Verification

- `npm run test:coverage`: 484 files, 3,269 tests, 100 % (final run after every edit).
- `npm run lint`: 0 errors (one pre-existing warning in `bom.service.ts`); `npm run typecheck`: clean.
- `npm run build`: passed.
- Integration, against the standalone production build on a fresh data directory, 19 files in one run
  (`test-reset`, `test-reset-api`, `test-reset-realistic`, `stock-report`, `purchasing-api`,
  `customer-orders`, `boms-api`, `boms`, `forecasts-api`, `forecasts`, `materials-api`, `materials`,
  `named-records`, `planning-parameters-api`, `planning-parameters`, `purchasing`, `stock-reversals`,
  `stock`, `smoke`): 121 tests passed. Startup seed of tiny 1.4–1.5 s; realistic API reset 9.3–9.6 s.
- The full integration suite in Docker runs in CI on the PR.

## Follow-ups

- The realistic reset still takes ~25–30 s on the CI runner and blocks the server meanwhile; the parked
  local branch `wip/issue-163-seed-perf` has ~30 % of savings if that matters later.
