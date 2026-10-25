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
- In-memory sorted lists must sort before paging: step 4's tests check page 2.

## Log

- 2026-10-25 07:47 UTC — Spec written (`om-auto-write-spec`), reviewed by a fresh-context subagent (verdict: proceed; layering and test-case notes folded in), spec PR #227 opened.
- 2026-10-25 07:50 UTC — Implementation branch `feat/list-quantity-and-po-date-sort` off `origin/main`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Quantity and purchase order date sort

- [ ] 1.1 Ordering helpers
- [ ] 1.2 Forecasts and production orders
- [ ] 1.3 Purchase requisitions and transfers
- [ ] 1.4 Planning parameters and safety stock
- [ ] 1.5 Purchase order Created column
- [ ] 1.6 Docs and integration tests
