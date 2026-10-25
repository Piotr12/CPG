# Lists sort by quantity columns and the purchase order list by Created

**Date:** 2026-10-25 07:50 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue` feature route → `om-auto-implement-spec` → `om-auto-create-pr`)
**Issue:** #224 · **Spec PR:** #227
Source doc: .ai/specs/2026-10-25--0747UTC-list-quantity-and-po-date-sort.md

## Goal

Every main-list column that shows a stored quantity sorts by its numeric value, and the purchase order list shows and sorts by a *Created* date, as the spec describes. No migration, no API change, default orders unchanged.

## Scope

- `@cpg/db`: `decimalLengthKey(column)`, the single raw `ORDER BY` fragment.
- `@cpg/core`: `decimalOrderBy` in `domain/lists/list-query.ts`; the `*_SORTS` tuples and services of Forecasts, Production orders, Purchase requisitions, Transfers and Purchase orders; the order modules of Planning parameters and Safety stock.
- `@cpg/app`: `sortKey` on the quantity columns of those tables; the *Created* column on `OrdersTable` (EN/PL label).
- Docs: `engineering-standards.md` ("List sort and search").
- Integration tests of the touched lists.

**Non-goals:** computed figures (Outstanding, In transit, Lines); API `?sort=` (#221); indexes (#220); the spec file itself, which merges through spec PR #227.

## Implementation Plan

### Phase 1: Quantity and purchase order date sort

1. Ordering helpers (`decimalLengthKey` in `@cpg/db`, `decimalOrderBy` in core), tested on real SQLite.
2. Forecasts and production orders: a `quantity` sort key, service, table.
3. Purchase requisitions (`quantity`, `converted`, `abandoned`) and transfers (`quantity`, `dispatched`, `received`).
4. Planning parameters (`minimum`, `multiple`) and safety stock (`quantity`), using `parseDecimal` comparators.
5. Purchase order *Created* column and the `created` sort key.
6. Docs and integration tests.

## Risks

- MikroORM `raw()` as an `orderBy` key with the root alias: covered by step 1's real-database test.
- In-memory sorted lists must sort before paging: planning parameters and safety stock are not paged (they read the whole list, then sort), so nothing to page.

## Log

- 2026-10-25 07:47 UTC — Spec written (`om-auto-write-spec`), reviewed by a fresh-context subagent (verdict: proceed; layering and test-case notes folded in), spec PR #227 opened.
- 2026-10-25 07:50 UTC — Implementation branch `feat/list-quantity-and-po-date-sort` off `origin/main`.
- Steps 1.2–1.5 landed as one core commit (validators, services, order modules) and one app commit (tables, label), not one commit per step: each step was a one-line map entry per layer, and splitting by concept would have repeated the same files.
- Deviation from the spec's helper shape: instead of a separate `decimalOrderBy(property, column, dir)` export, `listOrderBy` takes `{ decimal: field }` (property and column share the name for every sorted field), so each service changes one map entry. The in-memory lists use a new `compareDecimals` in `domain/quantities/decimal.ts`.
- Found while testing: the demo dataset stores some quantities without six decimals (forecasts `"55"`, planning `"50"`), so the integer-length key, which doesn't assume `fixed`, was the right choice.
- Deviation: browser coverage is one new file, `list-quantity-sort.test.ts` (the Test tenant's seeded lists, read-only), plus a quantity step in the existing transfers #217 test, rather than a step in each concept's integration file. Abandoned, Dispatched and Received have unit and page tests only.
- Review (fresh-context `om-auto-review-pr` pass): approve, no blocker or major. Fixed: `decimalLengthKey` now refuses anything but a plain column name; the integration test no longer depends on the dataset's digit mix and matches `clickHydrated`'s visibility check; the "only raw SQL" wording is exact. Kept: the 999999999999.00000x pair (it documents the 18-digit range; 100/25/9.5 rule out text order).
- Integration: Docker unavailable, so run against a local standalone build (lesson 2026-10-23) on port 3424 with a fresh `DATA_DIR`.

## Verification

- `npm run lint`: 0 errors, 1 warning that was already on main (`bom.service.ts`).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0, 4,095 tests after the review fixes, 100 % statements, branches, functions and lines.
- `npm run build`: exit 0.
- Integration, against the local standalone server: `list-quantity-sort` 8/8 (new); `transfers`, `purchasing`, `goods-receipts`, `document-lifecycle`, `audit-history`, `stock-reversals` 43/43.

## Progress

PR: #228

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Quantity and purchase order date sort

- [x] 1.1 Ordering helpers — ff168766
- [x] 1.2 Forecasts and production orders — 2af2bb9f, e28ac4df
- [x] 1.3 Purchase requisitions and transfers — 2af2bb9f, e28ac4df
- [x] 1.4 Planning parameters and safety stock — 2af2bb9f, e28ac4df
- [x] 1.5 Purchase order Created column — 2af2bb9f, e28ac4df
- [x] 1.6 Docs and integration tests — e28ac4df, 6e054c9e
