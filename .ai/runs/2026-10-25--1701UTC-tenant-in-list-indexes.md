# Paged lists: a page's `$in` read stops walking the tenant (#247)

**Date:** 2026-10-25 17:01 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 247`, dispatched by cezar)
**Spec:** none
**Status:** done (PR #259 in review; approval left to a human)

## Goal

Without ANALYZE statistics, SQLite plans `tenant_code = ? AND <column> IN (…more than a few…)` through the
single-column `<table>_tenant_code_index`, walking every row of the tenant. Make a paged list's read of its
page's lines (and records by `id IN`) cost the same whatever the tenant's size.

## Log

- 17:01 Triage: bug label, unassigned, no open/merged PR or commit fixes it (#250 only names it as a follow-up).
  Branch `fix/issue-247-tenant-in-list-indexes`, `npm ci`.
- 17:10 Scratch (SQLite 3.53.4): even a 5-key `IN` plans through the tenant index; a `(tenant_code, order_id)`
  index is chosen at 5, 12, 50 and 100 keys. A survey of every paged list's page read on the tiny Test dataset
  (all `IN` queries, `explain query plan`) found more than the issue lists: the PO, CO, shipment, GR and GI
  line reads, their "posted" checks (`goods_receipt_line.order_line_id`, `goods_issue_line.shipment_line_id`,
  `shipment_line.order_line_id`), the GR/GI stock-reversal `$or`, and the variance report's production orders
  (`id IN`, through the `(tenant_code, code)` unique), completion lines and materials (`id IN`).
- 17:25 Tried the issue's second option first, since one mechanism would cover every present and future
  `IN` read: synthetic `sqlite_stat1` rows for every tenant-led index (tenant = 100,000 of 1,000,000 rows,
  later columns at SQLite's own defaults), refreshed from `initOrm` on the migrator's `migrated`/`reverted`
  events. It fixed every `IN` read in the survey and left the list queries' plans unchanged, but the full
  suite showed it moves the plans #240 tuned on purpose: the demand review's window reads went from the
  `(tenant_code, required_date)` / `(tenant_code, date)` range to the 10-material `IN` list. The tenant column's
  estimate is both what a tenant-only scan costs and the base a range on a tenant-led index is cut from, so
  no value keeps the range plans and fixes the `IN` reads. Reverted; going with composite indexes.
- 17:35 Candidates checked one by one in the survey. A `material (tenant_code, id)` index fixed the variance
  report's material read but moved the completions list's join onto `material_tenant_code_index` (SQLite then
  probes materials by tenant inside the loop), so it was dropped. The customer-order posted check is a join
  (`goods_issue_line ⋈ shipment_line`): SQLite's "more terms wins" adjustment applies only between plans for
  one table, so no index moves the join's start; it needs two bounded single-table reads. Both deferred to #257
  and listed as `KNOWN_WALKS` in the new test. The stock-reversal `$or` (GR/GI lists, audit page) is split into
  two reads, each through its existing `(tenant_code, original_id|inverse_id)` unique.
- 17:45 Migration `Migration20261025171522_tenant_in_list_indexes` (generated, `create index` only, 9 indexes).
  Migration counts moved (lesson 2026-10-23). New `list-page-reads.test.ts`: 7 of 8 cases fail with the
  production files reverted, all pass with them. Timing (100-order page, `em.find(PurchaseOrderLine, order IN)`,
  best of 7): 300 lines 1.8 ms / 100,000 lines 1.7 ms with the index; 1.6 ms / 8.5 ms without.
  Claimed #247 (claim comment), filed #257.
- 18:05 PR #259 opened (labels `review`, `bug`, `skip-qa`, `priority-low`, `risk-medium`; lock handed to the PR).
  Independent review (fresh subagent, `om-code-review`): approve, no blocker or major. Minors fixed: the stock
  ledger, a paged list with `id IN` source reads, joined the test with its walks listed in `KNOWN_WALKS`, and
  those walks were added to #257. Its completions read now starts from the new `production_order (tenant_code, id)`
  index rather than `production_completion_tenant_code_index`, a walk of the same kind. Found while doing it: the
  completions case took "the first production order", which has no stable order now that the new index can
  serve `tenant_code = ?`, so it sometimes picked an order without completions. Fixtures are now picked by count.
  Nit kept: `reversalLinks` now populates `original`, which the audit page doesn't need (a primary-key join).

## Changes

- `packages/db/src/migrations/Migration20261025171522_tenant_in_list_indexes.ts` (+ `.snapshot.json`, `index.ts`):
  9 `(tenant_code, column)` indexes, declared on the line entities and `ProductionOrder`.
- `packages/core/src/services/stock/movement-reversals.ts`: the `$or` becomes one read per side, deduplicated;
  `AuditService.reversalLinks` reuses it.
- Tests: `packages/core/src/services/list-page-reads.test.ts` (new), `packages/db/src/tenant-in-list-index-migration.test.ts`
  (new), migration counts in `orm.test.ts`, `database.test.ts`, `system-status.service.test.ts`,
  `transfer-reversal.entity.test.ts` and `tests/integration/smoke.test.ts`.
- `.ai/lessons.md`: sharpened the 2026-10-25 EXPLAIN lesson.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (590 files, 4,525 tests, 100% thresholds) and
  `npm run build`: all exit 0 at 19c71540. After the review fixes (test file and docs only), lint, typecheck
  and the new test (three runs) were re-run.
- `tests/integration/smoke.test.ts` passed (3/3) against a local standalone server on a fresh `DATA_DIR`
  (Docker unavailable). The full integration suite runs in CI.
- `list-page-reads.test.ts`: 7 of 8 original cases fail with the production files reverted.

## Follow-ups

- #257: the customer-order posted-line check (a join), the variance report's materials and the stock ledger's
  source documents (`id IN`) still walk the tenant.
- Possible later decision for the owner: fixed `sqlite_stat1` statistics would cover every `IN` read at once,
  but only with per-column figures that keep the range plans #240 tuned (see 17:25 above).
