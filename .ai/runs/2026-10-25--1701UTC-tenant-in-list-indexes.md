# Paged lists: a page's `$in` read stops walking the tenant (#247)

**Date:** 2026-10-25 17:01 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 247`, dispatched by cezar)
**Spec:** none
**Status:** in progress

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
