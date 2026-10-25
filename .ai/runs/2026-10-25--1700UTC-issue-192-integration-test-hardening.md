# Close-early over the API, customers in the browser, and integration test hardening (#192)

**Date:** 2026-10-25 17:00 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue 192`, cezar headless)
**Spec:** none (test-only issue; the catalogue rows live in `.ai/specs/research/CPG-acceptance.md`)
**Status:** done

## Goal

Ship #192: API integration tests for the three close-early routes never called over HTTP, a customer create and rename browser flow, the integration hardening items, and the catalogue rows UX-009, UX-023, API-031, AUD-022, UX-026, E2E-006, E2E-013 and E2E-014 proven or with their remaining gap stated.

## Root-cause brief (om-root-cause)

Summary: test-surface gaps, no product defect. The issue's line numbers predate later merges; positions below are on `main` at `79ecf0b6`.

- Close-early: `purchase-orders`, `purchase-requisitions` and `production-orders` `/[id]/close-early` are reached only through server actions. Add one API test to `tests/integration/document-lifecycle.test.ts`: 200 with `closed-early`, one `<concept>.<entity>.closed-early` audit entry for the document, and 409 `VERSION_CONFLICT` on the stale version.
- Customers: `named-records.test.ts` only lists customers and checks the empty-name refusal. Add create + rename with the audit rows, like suppliers.
- Tests with no `expect` (found by parsing every `it` body, `tests/integration`): `demand-review.test.ts:104`, `forecasts.test.ts:197`, `materials.test.ts:114`, `named-records.test.ts:103`, `navigation.test.ts:356`. Add outcome assertions, and a repo-wide check (`tests/integration-expects.test.ts`) so a new one fails `npm test`.
- `import-api.test.ts:221`: 5 s budget vs ~2.6 s on CI. Raise to 4× headroom (12 s) with the measurement printed to stdout.
- `users.test.ts:42` `landsOn` waits for "pathname changed": wait for the exact expected path. The alice chain (create → … → reactivate) leans on earlier tests: give each test an idempotent `alice(state)` precondition through the users API.
- `audit-history.test.ts`: the #145 field test and the Polish test read `reversedRecords` made by the AUD-004 test. Move the API setup into a memoized fixture each test awaits.
- `forecasts.test.ts`: tests that read forecasts an earlier test added. Same memoized-fixture approach where they lean on another test's records.
- `test-reset-realistic.test.ts` `afterAll`: retry the restore once, fail the file loudly when it still fails, and revoke the token in a `finally`. The ledger-paging test is tagged UX-017 (in-transit report): drop the wrong tag.
- Catalogue rows: UX-009 (`footer.test.ts`, normal user on an operational page), UX-023 (navigation and help have no pricing/invoicing), API-031 (`api-users.test.ts`: `PATCH /api/users/[id]` writes a Global audit entry, tenant audit and data unchanged), AUD-022 (unit tests with hundreds of rows, one invalid), UX-026 (goods issue while a production order needs the stock), E2E-014 (normal user's BOM write 403, then a goods issue attributed to their token), E2E-006 (two sessions, two order lines, same stock: one wins, one audit entry), E2E-013 (replayed goods issue leaves one `goods-issues.goods-issue.posted` entry).

Risks: integration files share one server and database; every new test asserts only on its own records. No product code changes.

## Log

- 17:00 Claimed via `om-fix`. Docker is unavailable on this machine: integration files run against a local standalone server (lessons, 2026-10-23), CI runs them in the image.
- 17:05 Close-early API test and customer create/rename pass first time.
- 17:06 The `expect` check first flagged `test.map(…)` on a variable holding Test tenant rows: it now counts only calls whose first argument is a test name.
- 17:08 Users: `alice()` brings her to the state a test needs through the users API (create, password, active), so each test runs alone; `-t "reactivates alice"` and `-t "password reset"` pass alone on a server where the chain had run.
- 17:10 Audit history and forecasts: the records several tests read are memoized fixtures (`reversedRecords`, `correctedInUi`, `threeForecasts`, `changedAndRemoved`) made by whichever test needs them first; the dependent tests pass alone.
- 17:12 The realistic restore moved into `untilOk` (`tests/integration/api.ts`), unit-tested in `tests/integration-helpers.test.ts`.
- 17:13 AUD-022 delegated to a subagent (two core test files only): 500-row workbooks, one invalid row late, with a control commit proving the rows were applied and rolled back. Reviewed its diff. Its finding: the stock commit refuses on the token before posting, so the 500-line case proves "nothing changes" and the existing 40-line test still proves the rollback of real stock writes.
- 17:16 E2E-014's audit filter first matched a customer order sharing the BOM's ID: filtered by subject type too (lessons, 2026-10-22).
- 17:17 UX-026 asserts the unreserved goods issue and the production order's shortage; the next MRP run is #14, so the row stays Partially verified.
- 17:35 Independent review (fresh subagent, `om-code-review`): request changes on one major, fixed. API-031's snapshot read the master lists through `allPages`, but they don't page (`page` is ignored), so it would never stop once a list reached 100 rows: one read each now. Also fixed: DORA reactivated at the end; UX-023 back to Partially verified (core planning is MRP, #14); the 500-line stock case now also fails its last chunk and rolls 475 posted lines back; the `expect` check walks subfolders and reports a test with no inline callback; E2E-013 counts audit entries by shipment; word-bounded money terms in UX-023; `untilOk` pauses before a retry; UX-026 cancels its order in a `finally`.

## Changes

- `tests/integration/document-lifecycle.test.ts`: close-early over the API for purchase orders, requisitions and production orders (200 `closed-early`, one audit entry with account and token, 409 `VERSION_CONFLICT` on the stale version); UX-026.
- `tests/integration/named-records.test.ts`: customer create and rename with their audit rows; the empty-name test asserts the list is unchanged.
- `tests/integration-expects.test.ts` (new): every integration test asserts an outcome; `demand-review`, `forecasts`, `materials`, `named-records` and `navigation` tests gained their assertions.
- `tests/integration/import-api.test.ts`: the 2,000-row dry-run budget is 12 s (4× the CI measurement), printed to stdout.
- `tests/integration/users.test.ts`: `landsOn` waits for the exact path; every test sets up its own alice.
- `tests/integration/audit-history.test.ts`, `forecasts.test.ts`: memoized fixtures instead of earlier tests' records.
- `tests/integration/test-reset-realistic.test.ts`, `api.ts`, `tests/integration-helpers.test.ts`: the restore is retried once and fails the file with its reason; the token is revoked in a `finally`; the ledger-paging test loses the wrong UX-017 tag.
- `tests/integration/footer.test.ts` (UX-009), `navigation.test.ts` (UX-023), `api-users.test.ts` (API-031), `shipments-api.test.ts` (E2E-006, E2E-013, E2E-014), `packages/core/src/services/imports/import.service.test.ts` and `stock-import.service.test.ts` (AUD-022).
- `.ai/specs/research/CPG-acceptance.md`: UX-009, API-031, AUD-022, E2E-006, E2E-013, E2E-014 → Passed (automated); UX-023 and UX-026 → Partially verified (MRP, #14).

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0, 589 files, 4,522 tests, 100% thresholds held.
- `npm run build`: exit 0.
- CI on PR #258: every check green on both pushes (bca88098, d77e1230), all four integration shards included.
- Integration, the 13 touched files in one pass on a fresh local standalone server (`CPG_BASE_URL`): 13 files, 141 tests passed; the 2,000-row dry run took 428 ms, the realistic reset 6.3 s. The full suite runs in CI against the Docker image.

## Follow-ups

- None filed. The issue's out-of-scope item (137 app test files mock the app's own `auth/*` modules) waits for the owner's decision on the engineering standards, as the issue says.
