# Every list with the dataset (Step 4.4, spec Q14)

**When:** 2026-10-21T14:46:42Z
**Server:** production standalone build of f5c4956+ (all code in this PR), fresh `DATA_DIR`, Test seeded at startup in 9.2 s for 2026-10-21; Apple-silicon Mac, loopback. Docker is unavailable here, and the CI image runs the integration suite on the PR.
**How:** agent-browser, signed in as the admin. UI: a full navigation per screen; times from the Navigation Timing entry (responseStart / responseEnd, the latter including the streamed Suspense content / DOMContentLoaded), rows = `tbody > tr` of each visible table. API: `fetch` from the same session; time to the full body.

## UI screens

| Screen | First byte (ms) | Full response (ms) | DOM ready (ms) | Rows shown |
|---|---|---|---|---|
| `/admin/test` | 3 | 21 | 25 | — |
| `/admin/test/materials` | 3 | 20 | 25 | Materials:26 |
| `/admin/test/locations` | 3 | 27 | 31 | Locations:4 |
| `/admin/test/customers` | 3 | 20 | 24 | Customers:10 |
| `/admin/test/suppliers` | 3 | 19 | 23 | Suppliers:6 |
| `/admin/test/planning-parameters` | 3 | 38 | 44 | Planning parameters:48 |
| `/admin/test/safety-stock` | 3 | 40 | 45 | Safety stock:50 |
| `/admin/test/boms` | 3 | 36 | 40 | BOMs:16 |
| `/admin/test/forecasts` | 2 | 45 | 52 | Forecasts:120 |
| `/admin/test/customer-orders` | 2 | 46 | 51 | Customer orders:100 |
| `/admin/test/customer-orders/00000589` | 2 | 25 | 29 | Lines:1 Shipments:1 |
| `/admin/test/purchase-requisitions` | 6 | 25 | 29 | Purchase requisitions:5 |
| `/admin/test/purchase-orders` | 2 | 35 | 40 | Purchase orders:100 |
| `/admin/test/purchase-orders/00000466` | 3 | 25 | 29 | Lines:1 Goods receipts:1 |
| `/admin/test/production-orders` | 6 | 39 | 45 | Production orders:100 |
| `/admin/test/production-orders/00000390` | 2 | 25 | 29 | Pinned component requirements and current stock:5 Completions:1 |
| `/admin/test/transfers` | 3 | 24 | 28 | Transfers:1 |
| `/admin/test/stock?material=00000005&location=00000001` | 2 | 38 | 45 | Stock movements:100 |
| `/admin/test/reports/stock` | 3 | 39 | 45 | Current stock:48 |
| `/admin/test/reports/variance` | 2 | 67 | 77 | Production variance:50 Components of production order 000000 … (and one nested component table per order) |
| `/admin/test/audit` | 3 | 24 | 29 | Audit — Test:1 |
| `/admin/test/materials/00000005` | 3 | 20 | 25 | Unit conversions:1 |
| `/admin/test/boms/00000016` | 2 | 21 | 25 | Recipe (revision 1):5 Revisions:1 |

## List APIs (`GET /api/tenants/test/…`)

| Path | Status | Time (ms) | Body | Items |
|---|---|---|---|---|
| `materials` | 200 | 50 | 4 KB | 26 |
| `locations` | 200 | 5 | 0 KB | 4 |
| `customers` | 200 | 5 | 1 KB | 10 |
| `suppliers` | 200 | 4 | 1 KB | 6 |
| `planning-parameters` | 200 | 9 | 7 KB | 48 |
| `safety-stock-targets` | 200 | 6 | 5 KB | 50 |
| `boms` | 200 | 9 | 11 KB | 16 |
| `forecasts` | 200 | 9 | 11 KB | 120 |
| `customer-orders` | 200 | 20 | 63 KB | 100 |
| `customer-orders?page=6` | 200 | 15 | 56 KB | 89 |
| `shipments` | 200 | 20 | 54 KB | 100 |
| `shipments?page=7` | 200 | 8 | 21 KB | 40 |
| `goods-issues` | 200 | 27 | 58 KB | 100 |
| `goods-issues?page=7` | 200 | 11 | 17 KB | 30 |
| `purchase-requisitions` | 200 | 4 | 2 KB | 5 |
| `purchase-orders` | 200 | 13 | 57 KB | 100 |
| `purchase-orders?page=5` | 200 | 10 | 38 KB | 66 |
| `goods-receipts` | 200 | 105 | 209 KB | 450 |
| `goods-receipts?purchaseOrder=00000001` | 200 | 5 | 1 KB | 1 |
| `production-orders` | 200 | 14 | 44 KB | 100 |
| `production-orders?page=4` | 200 | 7 | 39 KB | 90 |
| `production-orders/00000001/completions` | 200 | 6 | 1 KB | 1 |
| `transfers` | 200 | 3 | 0 KB | 0 |
| `stock?material=00000005&location=00000001` | 200 | 11 | 68 KB | 100 |
| `stock?material=00000005&location=00000001&page=2` | 200 | 6 | 24 KB | 35 |
| `reports/stock` | 200 | 5 | 13 KB | 48 |
| `reports/variance` | 200 | 26 | 52 KB | 50 |
| `audit` | 200 | 4 | 0 KB | 0 |

## Outcome

- Every paged list pages by 100 (customer orders 6 pages, shipments and goods issues 7, purchase orders 5, production orders 4, a pair's ledger 2), and every unpaged list renders well within the usual time (≤ 77 ms for the full streamed page on the heaviest screen, the variance report at 50 orders a page).
- The one unpaged list API that carries the volume is `GET …/goods-receipts`: 450 receipts, 209 KB, 105 ms. That is acceptable, and paging it is already tracked by #115, so no new follow-up is filed. Requisitions (5), masters, forecasts (120) and the stock report (48 pairs) are small.
- No list failed the check, so no follow-up issue is needed (spec Q14).
