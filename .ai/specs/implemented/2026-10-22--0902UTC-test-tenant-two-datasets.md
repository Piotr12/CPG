# Two Test datasets: tiny by default, realistic on the admin's request

**Status:** implemented
**Created:** 2026-10-22 09:02 UTC
**Issue:** #163 (`main` red since #136), epic #78
**Amends:** `2026-10-21--0718UTC-test-tenant-dataset.md` (Q4, Q16, Risks "Seed duration"), and the reset of `2026-10-19--0913UTC-test-prod-tenants.md`

## Goal

Test gets two generated datasets instead of one. A **tiny** one seeds an untouched Test at startup and is
what a reset writes unless the admin asks otherwise; the integration suite runs on it. The **realistic**
one, the two-year history of #126, is a reset option the admin picks deliberately.

## Context

Since #136 every startup seed and every reset writes the two-year dataset: about 3,550 documents and
3,750 stock movements. The reset takes about 10 s on a developer Mac and 25–30 s on the CI runner, and
the whole server answers nothing else meanwhile (lesson of 2026-10-21). The two UI reset cases in
`tests/integration/test-reset.test.ts` wait 25 s for the result, so `main` fails its integration job
depending on the runner, and nothing deploys (#163). Profiling the seed (#163) found it bound by the ORM's per-query cost: about 30 % can be cut (kept on the local branch
`wip/issue-163-seed-perf`), not the 2.5× the 15 s budget needs on CI.

The owner's decision (2026-10-22, in the #163 session): "a small dataset for integration tests' needs and
the real-life dataset that the instance can be reset into at the admin's disposal. Default, and the one
tests use, is tiny; when resetting the Test tenant the admin can decide to use the realistic dataset
instead."

## Decisions

| # | Question | Answer | Rationale |
|---|---|---|---|
| Q1 | What is the tiny dataset? | The **same generator and catalogue** with a **2-month history** (`horizon.historyMonths: 2`); everything else in `test-tenant-config.json` is shared. For 2026-10-21 it holds about 550 documents and 476 movements, against 3,549 and 3,748. | The masters (26 materials, 4 plants, 10 customers, 6 suppliers, 16 BOMs, planning parameters, safety stock, a year of forecasts) and every business ID stay identical, so screens, tests and IDs that rely on them hold for both datasets. The unit tests already used exactly this configuration (`REDUCED_TEST_TENANT_CONFIG`), which it replaces. A hand-written set would be a second catalogue to keep consistent. |
| Q2 | Where are the two defined? | `core/src/domain/demo/test-datasets.ts`: `TEST_DATASETS = ["tiny", "realistic"]`, `DEFAULT_TEST_DATASET = "tiny"`, and the configuration of each, derived from the committed `TEST_TENANT_CONFIG` (realistic). The container value `testTenantConfig` becomes `testDatasets: Record<TestDataset, TestTenantConfig>`. | One file of numbers (spec #126 Q1) stays the source; tests still vary the datasets through the container (lesson of 2026-10-21). |
| Q3 | What does the startup seed write? | Tiny, under the unchanged rule (spec #126 Q4: only an untouched Test, all or nothing). | Startup stays fast on every deploy, and the integration suite starts from tiny. |
| Q4 | How does a reset pick the dataset? | API: `POST /api/tenants/test/reset` accepts an **optional** `dataset`, `"tiny"` or `"realistic"`; the body `{}` keeps working and means tiny. Any other value or field is `400 VALIDATION_FAILED`. UI: the Reset Test card has a **Dataset** select, Tiny preselected; the confirmation names the chosen dataset, and choosing Realistic shows that it takes longer and that the server waits for it. | Additive to the protected contract (`BACKWARD_COMPATIBILITY.md` §4): existing callers and their idempotency keys behave as before, except that `{}` now writes the tiny dataset (see Q6). |
| Q5 | Is the choice recorded? | Yes: the Global audit entry `tenants.tenant.reset` gets `dataset` in its `after`. Nothing is stored on the tenant: the next reset defaults to tiny again. | Who replaced Test with what stays traceable (R08) without new schema. |
| Q6 | What changes for an existing caller? | A reset without `dataset`, and the startup seed, now write two months of history instead of two years. Callers that want the two years send `"dataset": "realistic"`. ⚠ This is a behaviour change of the reset; the owner asked for it. | The owner's decision. |
| Q7 | Which budget applies? | Tiny: the 15 s budget of spec #126 holds with a wide margin (the reset of tiny takes about 1 s locally). Realistic: no budget beyond the reset API's own limits; it takes about 10 s locally and 25–30 s on the CI runner, during which the server queues other requests (spec #126 Implementation notes). Making it faster is #163's parked performance work. | The realistic reset is a deliberate admin action, warned in the dialog. |

## Requirements

- [x] `test-datasets.ts` with the two names, the default and their configurations; the container's `testDatasets`.
- [x] `seedTestTenantDataset(services, today, dataset = "tiny")` picks its configuration from the container; `seedDemoData` seeds tiny.
- [x] `TestResetService.reset(generation, actor, dataset = "tiny")` writes that dataset and records it in the audit entry.
- [x] The API body schema accepts the optional `dataset`; the UI server action and the Reset Test card pass the admin's choice (en and pl copy).
- [x] `BACKWARD_COMPATIBILITY.md` §4 reset entry, and an amendment note in spec #126.
- [x] Unit tests at 100 % coverage; `REDUCED_TEST_TENANT_CONFIG` removed in favour of the tiny dataset.
- [x] Integration tests: everything that needs two years of volume (customer and purchase orders beyond a page, the two-year ledger of a pair) moves to one file that resets Test to realistic through the API and back to tiny afterwards; the UI reset cases run on tiny.

## Out of scope

- Speeding up the realistic seed (#163's performance work, parked locally on `wip/issue-163-seed-perf`).
- A third dataset, or a persisted per-tenant default.
- Changing the dataset's shape (`test-tenant-config.json`).

## Acceptance criteria

- A fresh install's Test holds the tiny dataset; a reset with `{}` or the UI's default writes tiny; `{"dataset":"realistic"}` or the UI's Realistic choice writes the two years.
- The Global audit entry of each reset names its dataset.
- `tests/integration/test-reset.test.ts` passes in CI, and `main`'s Deploy run is green after merge.

## Implementation notes

Implemented by the pull request that closes #163 (run log `.ai/runs/2026-10-22--0902UTC-test-tenant-two-datasets.md`).

- **Measured** on the production standalone build on the dev Mac, dataset of 2026-10-22: the startup seed of tiny takes **1.4–1.5 s** (88 customer orders, 73 purchase orders, about 550 documents), against 9.0–9.3 s for the realistic one; an API reset to realistic takes **9.3–9.6 s**. The integration file `test-reset-realistic.test.ts` prints the runner's figure for the realistic reset in the CI log.
- Tiny keeps every master record and ID. What the history start dates moves with it: BOM validity starts and the first entries of the safety-stock series begin two months back, and the forecast quantities average the two months there are (`test-datasets.test.ts` pins this).
- The UI's dataset choice is a select on the Reset Test card, beside its button, because the shared confirmation dialog has no content slot; the dialog names the dataset it confirms and, for realistic, the wait. Like the generation, the dataset is fixed when the dialog opens.
- Integration tests: `test-reset-realistic.test.ts` holds what needs two years (customer orders beyond a page, purchase-order paging in the API and the UI, the two-year ledger of 00000007 and the paged ledger of 00000005). `customer-orders.test.ts` checks the cross-tenant 404 on an ID only the larger tenant has, whichever that is. The UI reset cases confirm tiny only and open the realistic confirmation without confirming it.

