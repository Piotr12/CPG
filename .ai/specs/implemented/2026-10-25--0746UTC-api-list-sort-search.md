# API list routes: optional sort and search

**Status:** implemented (#231)
**Created:** 2026-10-25 07:46 UTC
**Issue:** #221 (follow-up to #217, decision D6 of `.ai/pipeline/runs/2026-10-24--2206UTC-list-sort-search-units/PLAN.md`)

## 📝 TLDR

Since #217 the screens sort and search every main list on the server (`?q=&sort=&dir=`), but the matching API routes still return each list only in its fixed default order, with no search. This spec proposes that the thirteen tenant list routes accept `q`, `sort` and `dir` as **optional, additive** query parameters. The services already apply them, so the routes only need to validate them and pass them on. A caller that sends none of the three gets exactly what it gets today.

## 📝 Problem Statement

An API client that wants "transfers by planned dispatch, newest first" or "materials matching `steel`" has to fetch every page and sort or filter it on its side. The screens already have this on the server (#225). Decision D6 kept the API out of #217 on purpose, so that the public contract could be added and documented as its own change. That is this change.

## 📝 Proposed Solution

Each list route parses its query with one schema exported from the list's `*-list.schema.ts`, and passes `q`, `sort` and `dir` to the service's existing `list()` options. The parameters mean what they mean on the screen, with one difference: the API is **strict** where the screen is lenient.

| Parameter | Meaning | Invalid value |
| --- | --- | --- |
| `q` | Search text. It is trimmed, and blank means no search. Every word must match one of the list's ID or name fields, as on the screen (ASCII case-insensitive, #223). | More than 100 characters or 5 words: `400 VALIDATION_FAILED`, field `q`, message `SEARCH_TOO_LONG_MESSAGE`. |
| `sort` | One of the list's sort keys (table below). Equal values keep the list's default order: the business ID, or for lists without one (planning parameters, safety stock, forecasts) their material, location (and date) key. | Any other value: `400 VALIDATION_FAILED`, field `sort`, fixed message `SORT_KEY_MESSAGE` ("Sort by one of this list's columns."). |
| `dir` | `asc` or `desc`. | Any other value: `400 VALIDATION_FAILED`, field `dir`, fixed message `SORT_DIR_MESSAGE` ("Sort direction must be asc or desc."). |

Both messages are fixed English constants exported from `list-query.schema.ts`, not Zod's default enum text, which changes when Zod is upgraded. BACKWARD_COMPATIBILITY.md keeps API messages stable.

- **Defaults stay exactly as they are today.** Each service already defaults to `q = ""`, its first sort key and `asc` (for example `material.service.ts` `list`, `transfer.service.ts` `list`, `forecast.service.ts` `list`). Today's routes call `list()` with no options, or with `{ page }` only, so they already get those defaults. If `sort` is missing, the list keeps that default order. If `dir` is missing, the direction is `asc`. A `dir` sent without `sort` applies to the default key. So a request with none of the three reaches the service with the same options as today, and the order already documented in BACKWARD_COMPATIBILITY.md still holds.
- **Paging comes after search and sort.** On the paged lists, `page=2` is the second 100 of the searched, sorted list. Every page uses the same total order (the tie-breakers above), so pages never overlap.
- **The screens stay lenient.** Header links fall back silently when a key is unknown (`listSortSchema`'s `.catch`), and that doesn't change. The API is strict instead: a client that misspells a key gets told, rather than getting a silently different order. This is what the issue asks for.
- **Unknown query keys behave as they do today, on every route.** Three routes refuse unknown keys with 400 (`z.strictObject`), and keep refusing them: transfers, customer orders and production orders. The rest ignore unknown keys, and keep ignoring them through plain `z.object`, which strips them. That is forecasts and the purchase orders and purchase requisitions lists, which use `z.object` today, and the seven unpaged master-data lists, which parse nothing today. Only the three new keys are added and validated (see Resolved assumptions, Q1).

Alternatives considered:
- *A generic `?sort=field` over any entity column:* rejected. It would expose column names and UUID ordering (lesson 2026-10-21) and bypass the allow-list.
- *Lenient like the screens:* rejected. The issue asks for a 400 for an unknown key, and an API client can't see a silently wrong order.

### Routes and sort keys

The keys are the existing `*_SORTS` arrays, unchanged. The first key in each row is the default order. Each key becomes a public name, so renaming or removing one later is a breaking change.

| Route `GET /api/tenants/{tenant}/…` | Paged | `sort` keys (default first) |
| --- | --- | --- |
| `materials` | no | `id`, `description`, `type`, `baseUnit`, `status` |
| `locations`, `customers`, `suppliers` | no | `id`, `name`, `status` |
| `boms` | no | `output`, `id`, `priority`, `revision`, `validFrom`, `validThrough`, `status` |
| `planning-parameters` | no | `material`, `location`, `procurement`, `leadTime` |
| `safety-stock-targets` | no | `material`, `location`, `effectiveFrom`, `status` |
| `forecasts` | yes | `material`, `location`, `date` (combines with the existing `material`/`location` filters) |
| `customer-orders` | yes | `id`, `customer`, `location`, `status` |
| `production-orders` | yes | `id`, `output`, `location`, `finish`, `start`, `status` |
| `purchase-requisitions` | yes | `id`, `material`, `location`, `requiredDate`, `status` |
| `purchase-orders` | yes | `id`, `supplier`, `location`, `status` |
| `transfers` | yes | `id`, `material`, `source`, `plannedDispatch`, `status` |

## 📝 Architecture

This touches only the validator and route layers. No service, entity, migration, event or screen changes.

- `core/src/validators/lists/list-query.schema.ts` gains one shared builder, e.g. `listQueryShape(keys)` → `{ q: searchSchema, sort: z.enum(keys, SORT_KEY_MESSAGE).optional(), dir: z.enum(SORT_DIRECTIONS, SORT_DIR_MESSAGE).optional() }`. It is strict: there is no `.catch`.
- Each `*-list.schema.ts` exports its API query schema built from that shape. On the paged lists the schema also takes the existing `page` schema. Each schema uses the object mode in the unknown-keys rule above: `z.strictObject` for transfers, customer orders and production orders, and `z.object` for every other route. Forecasts keep `forecastFilterSchema`'s filters. The page-only schemas that services and screens use today (`transferListSchema`, `customerOrderListSchema`, …) stay as they are, or become the base the new schema extends. Neither the screens nor the services change behaviour.
- Each route handler calls `parseInput(<list>ListQuerySchema, Object.fromEntries(searchParams))` and passes the result to `cradle.<x>Service.list(...)`. The seven unpaged routes start parsing their query for the first time.
- Validation errors already go through `parseInput` → `ValidationError` → the `apiHandler` envelope, so no new error code is needed.

## 📝 API Contracts

The responses keep the same shape on every route. Only the request gains the optional parameters above. For example:

```
GET /api/tenants/acme/transfers?sort=plannedDispatch&dir=desc&q=steel&page=2
200 → { ok: true, data: [...] }: the second 100 transfers that "steel" matches (the Transfers
      screen's search fields), by planned dispatch descending with the transfer ID as tie-breaker
      (the same order the Transfers screen shows)

GET /api/tenants/acme/materials?sort=weight
400 → { ok: false, error: { code: "VALIDATION_FAILED", message, fieldErrors: { sort: [...] } } }
```

BACKWARD_COMPATIBILITY.md gets one paragraph listing the parameters, the per-route keys (the table above), the defaults, the strictness and the note that a request without them is unchanged. Each route's existing bullet gets a short "since #221 also `q`, `sort`, `dir`" pointer to that paragraph.

## 📝 Edge Cases & Failure Scenarios

- **`q` of only spaces:** treated as no search, the full list.
- **Repeated parameter (`?sort=id&sort=name`):** the last value wins (`Object.fromEntries`), as for `page` today.
- **A search that matches nothing:** `200 []`. On a paged list, every page is empty.
- **Non-ASCII search text:** it matches case-sensitively. This is the SQLite `LIKE` limit already tracked in #223, and the API inherits it unchanged.
- **Search on lists with a reference column:** it matches the referenced record's business ID and name too (material, customer, supplier, location), exactly as on the screen. No UUID is ever matched or ordered by.
- **Read-only tenant:** these are reads, so they are allowed, as before.

## 📝 Risks & Impact Review

- **Additive and reversible:** no schema change and no new dependency. The one new commitment is the set of key names, which become public.
- **Not a narrowing for any caller that worked yesterday.** A request without the new keys parses as before. On the routes that ignored unknown keys, a client that already sent a stray `q`, `sort` or `dir` will now get it applied, or a 400 if the value is invalid. That is the intended meaning of those names, and no documented client sends them.
- **Performance:** search is a per-word `LIKE` and sort uses a column without an index (#220). This is the same load the screens already put on these lists, at the same page size.

## 📝 Resolved assumptions (autonomous defaults)

| # | Question | Applied default | Why |
| --- | --- | --- | --- |
| Q1 | Should routes that ignore unknown query keys today (the seven unpaged lists, purchase orders, purchase requisitions) start refusing them? | **No.** Only `q`, `sort` and `dir` are validated, and every other key keeps today's behaviour on each route. | Refusing would be a narrowing on a protected surface, which the issue doesn't ask for. It is the least reversible option. |
| Q2 | Should `GET /api/users` (global, admin-only) get the same parameters? | **No, deferred.** | The issue names the tenant list routes. Users can follow with the same shape later. |
| Q3 | What direction applies when `sort` is sent without `dir`? | **`asc`**, the services' default. A `dir` without `sort` applies to the list's default key. | It matches the services and keeps the default request unchanged. |
| Q4 | Should shipments, goods receipts, goods issues, the audit and the reports gain sort or search? | **No.** | The screens don't offer them (#217). This spec only exposes what the services already do. |

## 📋 Phasing

One phase. The change is mechanical and the same on each route, small enough for one implementation PR.

## 📋 Implementation Plan

### Phase 1: sort and search on the tenant list routes

1. **Shared shape.** Add the strict `q`/`sort`/`dir` query shape to `list-query.schema.ts`, with unit tests: valid keys, unknown `sort` → error on `sort`, bad `dir`, `q` too long or with too many words, blank `q` → `""`, and all-absent → `{ q: "" }`.
2. **Per-list query schemas.** In each of the eleven `*-list.schema.ts` files (`named-record-list` covers locations, customers and suppliers), export the API query schema. For paged lists, compose it with the page schema and keep the route's current strict or strip mode. Forecasts keep their filters. Unit-test each one: its keys pass, an unknown key 400s, and unknown query keys keep today's behaviour.
3. **Routes.** Make the thirteen `GET` handlers parse with their schema and forward `{ page?, q, sort, dir }` (forecasts: `filter` plus options) to the service. Extend each route's `route.test.ts` to check that the parsed values reach the service, that the default request passes `{ q: "" }` with no sort, and that an unknown `sort` answers 400.
4. **Documentation.** Add the BACKWARD_COMPATIBILITY.md paragraph and the per-route pointers. Extend the "List sort and search (#217)" bullet in `.ai/docs/engineering-standards.md` with one sentence: the API list routes take the same keys strictly through the list's query schema.
5. **Integration tests.** Extend the existing API files: `materials-api`, `named-records-api`, `boms-api`, `planning-parameters-api` (it already drives safety stock), `forecasts-api`, `purchasing-api` (requisitions and orders), `transfers-api`, `shipments-api` (customer orders) and `variance-report-api` (production orders). In each, check that a search narrows the list to the file's own records, that a `sort`/`dir` pair orders them (with the business-ID tie-breaker), and that an unknown `sort` answers `400 VALIDATION_FAILED`. Assert only on the file's own records (lesson 2026-10-22).

## Acceptance criteria

- Every route in the table accepts `q`, `sort` and `dir`. A request without them returns byte-for-byte what it returns before this change.
- An unknown `sort`, a bad `dir`, or a `q` over the limits answers `400 VALIDATION_FAILED` with the error on that field.
- Every query key other than `q`, `sort` and `dir` behaves on each route exactly as before. On the routes that ignored every unknown key, those three are now applied, and an invalid value of one of them is a 400 (see Risks).
- BACKWARD_COMPATIBILITY.md documents the parameters and the keys of each route.
- Unit coverage stays at 100%. The touched integration files pass.

## Implementation notes

- **Merged with #224 and #229 before landing** (`om-auto-fix-pr`, 2026-10-25). The routes take each list's `*_SORTS` array, so the quantity sorts and the purchase-order `created` sort that #224 added are accepted on the API too; BACKWARD_COMPATIBILITY.md lists them. Since #229 search ignores the case of every letter, Polish ones included, so the "ASCII case-insensitive" wording above and the non-ASCII edge case no longer apply.
