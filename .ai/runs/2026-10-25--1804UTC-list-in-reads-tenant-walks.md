# Paged lists: the last three `$in` reads start from a key (#257)

**Date:** 2026-10-25 18:04 UTC
**Agent:** Claude Code / claude-opus-5-5, `om-auto-fix-issue 257` (cezar)
**Spec:** none
**Status:** done (PR in review; approval left to a human)

## Goal

Fix issue #257: three `IN` reads of the paged list pages still walked every row of the tenant, and
`packages/core/src/services/list-page-reads.test.ts` listed them in `KNOWN_WALKS`. Make each start from a key
and empty `KNOWN_WALKS`.

## Log

- 18:04 Triage (`om-verify-in-repo`): real and unfixed on `main` f54b4693; `KNOWN_WALKS` still names the walks,
  no PR references #257. Branch `fix/issue-257-list-in-reads-tenant-walks`, `npm ci`.
- 18:06 Scratch copy of `list-page-reads.test.ts` printing the SQL and plan of every walking read, plus a case
  reading the sources of *every* movement of the tenant. That case showed goods receipts walk too
  (`goods_receipt_tenant_code_code_unique`) once a page holds more than ~10 of them; the ledger case only missed
  it because its fixture page held few.
- 18:07 Ledger: `(tenant_code, id)` indexes on `goods_receipt`, `goods_issue`, `transfer_posting` and
  `production_completion` fixed the receipt and issue reads. The completions read still started from
  `production_order_tenant_code_id_index (tenant_code=?)`: populating `order` joins the order's own output,
  location and BOM revision (MikroORM joins a populated entity's filtered to-one relations), and SQLite starts
  that four-way join from the orders. `strategy: "select-in"` kept the same joins on the root query. Reading the
  completions alone, then their orders by `id IN`, plans both from `(tenant_code=? AND id=?)`.
- 18:08 Variance report: populating the material on the completion-line read (partial: code, description, base
  unit) plans `production_completion_line (tenant_code, completion_id)` then `material` by primary key. No
  `material (tenant, id)` index, which #247 found moves the completions list's join.
- 18:08 Customer orders: two single-table reads. Shipment lines by `orderLine IN` in keyset batches (the issue
  warns a `limit` would drop matches) through a new `shipment_line (tenant_code, order_line_id)` index, then the
  existing `postedShipmentLineIds` through `goods_issue_line (tenant_code, shipment_line_id)`. An order line found
  issued leaves the batch.
- 18:09 Migration `Migration20261025180850_list_key_read_indexes` (generated, five `create index`, renamed from
  the first slug). Migration counts moved (lesson 2026-10-23).
- 18:10 Side effects of the new indexes: wrapped `db.prepare` in `initOrm` (temporarily) to log every `select`
  the core unit suite prepares (54,429 distinct statements), then `explain query plan` each on a migrated
  database with and without the five indexes. 773 plans differ: 44 lose a tenant walk, 16 lose a temp sort,
  712 reorder or swap indexes with the same walked tables, and one gains a walk: a whole-tenant
  `count(TransferReversal)` now starts from `transfer_posting` instead of `transfer_reversal`, which only tests
  send. Instrumentation reverted.
- 18:12 Claimed #257. Full gate green; smoke test against a local standalone server (Docker unavailable).
- 18:20 PR #260 opened, lock handed to the PR. Independent review (fresh subagent, `om-code-review`): approve, no
  blocker or major. Three nits fixed: the lesson shortened, with the plan-diff procedure moved to
  `.ai/lessons/2026-10-25--1825UTC-diff-query-plans-for-a-new-index.md`; `movementSources` takes
  `Pick<StockMovement, "type" | "postingId">`, so the test's fake transfer postings need no cast;
  `postedShipmentLineIds` uses `REFERENCE_BATCH` and its doc no longer points at `postedOrderLineIds`.
  Lint, typecheck, coverage and build re-run green.

## Changes

- `packages/db/src/entities/`: `(tenant, id)` indexes on `GoodsReceipt`, `GoodsIssue`, `TransferPosting` and
  `ProductionCompletion`; `(tenant, orderLine)` on `ShipmentLine`.
- `packages/db/src/migrations/Migration20261025180850_list_key_read_indexes.ts` (+ `.snapshot.json`, `index.ts`).
- `packages/core/src/services/customer-orders/posted-order-lines.ts`: two keyset-batched single-table reads
  instead of the `goods_issue_line ⋈ shipment_line` join; `postedShipmentLineIds` takes `Pick<ShipmentLine, "id">`.
- `packages/core/src/services/stock/movement-sources.ts`: completions, then their orders, in separate reads.
- `packages/core/src/services/reports/variance-report.service.ts`: materials come with their lines.
- Tests: `list-page-reads.test.ts` (`KNOWN_WALKS` removed; new case reading every kind of ledger source, with
  fake transfer postings since the Test dataset has none), new `posted-order-lines.test.ts`, new
  `list-key-read-index-migration.test.ts`, migration counts in `orm.test.ts`, `database.test.ts`,
  `system-status.service.test.ts`, `transfer-reversal.entity.test.ts`, `tests/integration/smoke.test.ts`.
- `.ai/lessons.md`: extended the 2026-10-25 EXPLAIN lesson (joins become single-table reads, populate joins,
  diff every plan before adding an index).

## Verification

- `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (592 files, 4,545 tests, 100% thresholds),
  `npm run build` 0.
- `list-page-reads.test.ts` with the production files and migration reverted: 4 of 10 cases fail (customer
  orders, variance report, stock ledger, every source kind); all 10 pass with them.
- `tests/integration/smoke.test.ts`: 3/3 against a local standalone server on a fresh `DATA_DIR`. The full
  integration suite runs in CI.

## Follow-ups

- None filed. The test-only `count(TransferReversal)` plan change above needs no action.
