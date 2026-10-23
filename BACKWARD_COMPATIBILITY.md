# Backward compatibility

What this repository treats as a **protected contract surface**, and how a change to one must be made. Review skills (`om-code-review`, `om-auto-review-pr`) check every PR against this file; implementation skills warn when a change does not comply.

CPG has no external API consumers or published packages yet. What a careless change breaks today is the **production deployment**: every merge to `main` deploys to cpg.baby, and the SQLite database on the `/externaldata` volume outlives every container. Most surfaces below exist because of that.

## How a deploy overlaps old and new code

Kamal starts the new container while the old one is still serving. The new container applies pending migrations in `instrumentation.ts` before it answers `/up`, and kamal-proxy switches traffic only then. For a short window, **the old release runs against the new schema**. `kamal rollback` also runs the previous image against the already-migrated database, because migrations are never rolled back automatically.

So every schema and data change must keep the previous release working: **expand, then contract**, in separate deploys.

## Protected surfaces

### 1. Database schema and migrations

Source: `packages/db/src/entities/`, `packages/db/src/migrations/` (+ `.snapshot.json`, `migrations/index.ts`), the production file `/externaldata/cpg.sqlite`.

**Breaking:**
- editing, renaming, reordering or deleting a migration that has been pushed to `main`;
- dropping or renaming a table or column, or narrowing a column's type, in the same release that stops using it;
- adding a `NOT NULL` column without a default to a table that has rows;
- a migration that rewrites data so the previous release can no longer read it;
- changing the primary key or identity of an existing entity (e.g. `Setting.key`).

**Required path:**
1. Change schema only through a new migration (`npm run db:migration:create -- <name>`), committed with the snapshot and the regenerated `migrations/index.ts`.
2. Additive first: new tables, nullable or defaulted columns, new indexes. Ship the code that writes the new shape.
3. Remove or rename in a **later** PR, after the release that stopped reading the old shape has been live. Each step is its own deploy.
4. Every migration has a working `down()`, and its test covers up and down against a real SQLite file.
5. The PR is `risk-high` and its body carries a rollback note: what `kamal rollback` does against the migrated database.

### 2. Data directory and runtime configuration

Source: `packages/core/src/config.ts` (`loadConfig`), `Dockerfile`, `config/deploy.yml`.

| Contract | Current value |
| --- | --- |
| `DATA_DIR` | `/externaldata` in the image, bind-mounted from `/externaldata/cpg.baby` on the VM; `<repo>/data` locally |
| `DATABASE_FILE` | `cpg.sqlite` inside `DATA_DIR` |
| `DEBUG_SQL` | `1` logs SQL, development only |
| `CPG_ADMIN_PASSWORD` | Required by the server: the built-in admin's password, 12+ characters, no leading or trailing whitespace. Missing or invalid → the process exits at startup, so `/up` never turns healthy. Comes from `.kamal/secrets` / the GitHub Actions secret of the same name |
| Container user | uid 1001, which must be able to write `DATA_DIR` |
| Everything the app persists | under `DATA_DIR` |

**Breaking:** renaming or removing an environment variable, changing a default, moving a persisted file or directory inside `DATA_DIR`, writing anything persistent outside it, or changing the container user.

**Required path:** keep reading the old name or location as a fallback for at least one release, or ship a migration that moves the data. Update `config/deploy.yml`, `.kamal/secrets` and the Dockerfile in the same PR. A new required variable needs a safe default or a deploy-time check that fails before traffic switches.

### 3. Health check and container contract

Source: `packages/app/src/app/up/route.ts`, `Dockerfile`, `config/deploy.yml`.

`GET /up` returns `200` `text/plain` `OK` only after a database round trip through `systemStatusService.ping()`. kamal-proxy gates every deploy on it. The image listens on port 3000 and starts with `node packages/app/server.js`.

**Breaking:** changing the path, status or behaviour of `/up`, removing the database check (a broken data volume would then go live), adding authentication to it, or changing the port or start command without the matching `config/deploy.yml` change.

### 4. Public URLs

Source: `packages/app/src/app/`. Today that is:

- `/`, `/login` and `/help`, which are public. `/help` accepts `?q=` and anchors topics as `#<topic-id>`.
- `/admin` (the Global tenant chooser), `/admin/users` and `/admin/tokens` (help topics `managing-users`, `api-tokens`), `/admin/test` and `/admin/prod` (the tenant homes). Every tenant page lives under `/admin/{tenant}/`, with eight-digit record IDs:
  - master data: `/admin/{tenant}/materials` and `/admin/{tenant}/materials/{id}`, `/admin/{tenant}/locations`, `/admin/{tenant}/customers` and `/admin/{tenant}/suppliers` (help topics `materials`, `material-conversions`, `locations`, `customers`, `suppliers`), `/admin/{tenant}/planning-parameters` and `/admin/{tenant}/safety-stock` (help topics `planning-parameters`, `safety-stock`), `/admin/{tenant}/boms` and `/admin/{tenant}/boms/{id}` (with `?revision=N` for an older revision; help topics `boms`, `bom-revisions`) and `/admin/{tenant}/import` (admin only: a normal user is sent to `/admin`; help topic `import`);
  - demand: `/admin/{tenant}/forecasts` (help topic `forecasts`; it accepts `?material=` and `?location=` to narrow the list, and since #140 `?page=` for its pages of 100), `/admin/{tenant}/customer-orders` and `/admin/{tenant}/customer-orders/{id}` (help topics `customer-orders`, `customer-order-detail`) and `/admin/{tenant}/shipments/{id}` (help topic `shipment`);
  - supply and movements: `/admin/{tenant}/purchase-requisitions`, `/admin/{tenant}/purchase-orders` and `/admin/{tenant}/purchase-orders/{id}` (help topics `purchase-requisitions`, `purchase-orders`, `purchase-order`), `/admin/{tenant}/production-orders` and `/admin/{tenant}/production-orders/{id}` (help topics `production-orders`, `production-order-detail`), `/admin/{tenant}/transfers` and `/admin/{tenant}/transfers/{id}` (help topics `transfers`, `transfer`), and the stock, stock import, reports and audit pages below.

  All of them require a signed-in session and redirect to `/login` otherwise; tenant pages are readable by every account unless noted.
- physical stock (spec `2026-10-20--1634UTC-stock-ledger-corrections`, D07): UI `/admin/{tenant}/stock` accepts `?material={id}&location={id}&page={n}`, help topic `stock`; the API is listed below.
- the current stock report (spec `2026-10-20--2221UTC-stock-report`, E13-S01): UI `/admin/{tenant}/reports/stock` accepts `?material={id}&location={id}&includeZero=true&page={n}`, help topic `stock-report`; the API is listed below.
- the production variance report (spec `2026-10-21--0947UTC-production-variance-report`, E13-S02): UI `/admin/{tenant}/reports/variance` accepts `?material={id}&location={id}&status={state}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&page={n}`, help topic `variance-report`; the API is listed below.
- the audits (spec `2026-10-19--1050UTC-audit-log`, E02-S02; filters since E13-S03, spec `2026-10-21--0944UTC-audit-history-filters`): UI `/admin/audit` and `/admin/{tenant}/audit`, help topics `global-audit` and `tenant-audit`; API `GET /api/audit` and `GET /api/tenants/{tenant}/audit`, read-only for every signed-in account, `GET` only:
  - all four accept `?before={entry id}&limit={1–100}` (keyset paging, newest first) and, since E13-S03, the optional filters `subjectType` (letters), `subjectId` (requires `subjectType`), `account` (username, case-insensitive), `channel` (`ui`|`api`) and `from`/`to` (`YYYY-MM-DD`, UTC days, inclusive), combined with AND. An empty value is no filter; unknown keys are ignored;
  - the response is `{ entries, nextBefore }` with each entry's `id`, `occurredAt`, `action`, `subject`, `before`, `after`, `actor`, `sessionId`, `channel` and `token`, unchanged by E13-S03. A malformed filter is `400 VALIDATION_FAILED` keyed by parameter; these names were ignored before E13-S03, so a request that sent one malformed now gets 400. A foreign or unknown cursor is `404 AUDIT_CURSOR_NOT_FOUND`;
  - a screen bookmark that filters a record is `?subjectType={type}&subjectId={id}`.

**Breaking:** removing or renaming a page URL users can bookmark, a help topic id, or the `q` parameter. **Required path:** a redirect from the old URL in the same PR, or a topic kept under its old id.

**Cookies** (`packages/app/src/auth/session-cookie.ts`, `packages/app/src/preferences/theme.ts`):

| Cookie | What it does | What renaming it would do |
| --- | --- | --- |
| `cpg_session` | the `httpOnly` session token | signs everyone out |
| `cpg_theme` | `light`/`dark`; read by the inline head script before first paint, deliberately not `httpOnly`, never trusted by the server | gives every user one flash of the light theme until they sign in again |

Rename either one only by reading the old name for one release.

Route handlers under `app/api/` are protected the same way: their paths, methods, request schemas, the result envelope (`{ ok, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`), error codes and HTTP statuses. Changes are additive (new optional fields, new routes), and removals go through a deprecation release. Today's routes:

- `GET /api/tenants` and `GET /api/tenants/{tenant}` (404 `TENANT_NOT_FOUND`). Each tenant is `{ code, name, generation, readOnly }`;
- `PATCH /api/tenants/{tenant}` (`{ readOnly }` and nothing else, admin only; spec `2026-10-19--2018UTC-read-only-tenants`). It sets the tenant's read-only flag and answers the tenant. It is global metadata, not tenant data, so it is the stated exception to the tenant-write rules below: its key goes in the global store, it takes no `Dataset-Generation`, and it works while the tenant is read-only;
- `POST /api/tenants/test/reset` (`{}` or `{ "dataset": "tiny" | "realistic" }`, bearer admin only): atomically replaces Test business data/audit with demonstration data, increments its generation and restores its original read-only flag. Prod and global identities/audit survive. Requires both `Idempotency-Key` and current `Dataset-Generation` even when Test is read-only. Response: the new `{ code, name, generation, readOnly }`. No Prod reset route exists. Missing generation is 428 `GENERATION_REQUIRED`, stale is 409 `GENERATION_STALE` **before key lookup**; 409 `GENERATION_EXHAUSTED` at 999999999. The reset deletes old Test keys and stores its own receipt in the new generation. After a lost response, fetch current metadata and retry the **same** key with the current generation to replay; do not automatically use a new key, which requests another reset. A later reset removes that receipt too. This is the sole tenant-data operation allowed while Test is read-only; ordinary writes retain the existing refusal. A failed reset stores no key and rolls back data, generation, flags and audit. A successful reset cannot be undone by rolling back application code. Since #126 the demonstration data is the generated dataset (`core/src/domain/demo/test-tenant-config.json`), generated for the reset's date, and IDs restart at 00000001. Since #163 (spec `2026-10-22--0902UTC-test-tenant-two-datasets`) the body may name the dataset: `tiny`, two months of history, is the default, so **`{}` writes tiny** (it wrote the two years before); `realistic` writes the two years, which takes about 10 s locally and longer on slower hosts, during which the server queues other requests and completes them afterwards. Any other field or value is `400 VALIDATION_FAILED`. The Global audit entry `tenants.tenant.reset` records the dataset in `after.dataset`. Headers and responses are unchanged.
- `GET /api/tokens` (the caller's own tokens);
- `DELETE /api/tokens/{id}` (404 `TOKEN_NOT_FOUND`);
- `GET /api/users` (403 `FORBIDDEN` for a normal user). Each row carries `version`;
- `POST /api/users` (`{ username, password }`, admin only; 409 `CONFLICT` for a taken name);
- `PATCH /api/users/{id}` (`{ active, version }`, admin only);
- `PUT /api/users/{id}/password` (`{ password, version }`, admin only);
- `GET /api/preferences` and `PATCH /api/preferences` (`{ locale?, theme? }`, the caller's own);
- the materials of one tenant (spec `2026-10-19--1858UTC-materials`). Reads are open to any signed-in account; writes are admin only (403 `FORBIDDEN` otherwise). A material is addressed by its eight-digit ID, and quantities and factors are JSON **strings**, never numbers:
  - `GET /api/tenants/{tenant}/materials`;
  - `POST /api/tenants/{tenant}/materials` (`{ type, description, baseUnit }`; 409 `CONFLICT` for a create racing past the retry, 409 `MATERIAL_IDS_EXHAUSTED` past 99999999);
  - `GET /api/tenants/{tenant}/materials/{id}` (with its `conversions`; 404 `MATERIAL_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/materials/{id}` (`{ version, description?, type?, baseUnit?, active? }`; an `id` in the body is 400; 409 `BASE_UNIT_HAS_CONVERSIONS`, `BASE_UNIT_IN_USE` once a BOM references the material or while planning parameters, safety targets or forecasts hold quantities in it, `MATERIAL_TYPE_IN_USE` for a type change once a BOM references it, and `MATERIAL_MADE_AT_LOCATIONS` for a change to raw while it is Make somewhere);
  - `POST /api/tenants/{tenant}/materials/{id}/conversions` (`{ unit, numerator, denominator }`; 400 `UNIT_IS_BASE_UNIT`, 409 `CONVERSION_EXISTS`);
  - `PATCH /api/tenants/{tenant}/materials/{id}/conversions/{unit}` (`{ numerator, denominator, version }`; 404 `CONVERSION_NOT_FOUND`);
  - `DELETE /api/tenants/{tenant}/materials/{id}/conversions/{unit}`, the first `DELETE` with a JSON body: `{ version }`.
- the locations, customers and suppliers of one tenant (spec `2026-10-19--2014UTC-locations-customers-suppliers`), with the same read and write rules. `{kind}` is `locations`, `customers` or `suppliers`, and each record is addressed by its eight-digit ID, numbered per tenant and per kind:
  - `GET /api/tenants/{tenant}/{kind}` (inactive records included);
  - `POST /api/tenants/{tenant}/{kind}` (`{ name }`; 409 `CONFLICT` for a create racing past the retry, 409 `LOCATION_IDS_EXHAUSTED`, `CUSTOMER_IDS_EXHAUSTED` or `SUPPLIER_IDS_EXHAUSTED` past 99999999);
  - `GET /api/tenants/{tenant}/{kind}/{id}` (404 `LOCATION_NOT_FOUND`, `CUSTOMER_NOT_FOUND` or `SUPPLIER_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/{kind}/{id}` (`{ version, name?, active? }`, at least one of them; an `id` in the body is 400).
- the planning parameters and safety-stock targets of one tenant (spec `2026-10-20--0532UTC-planning-parameters-safety-stock`), with the same read and write rules. `{material}` and `{location}` are eight-digit IDs; quantities are base-unit JSON **strings**, returned with six decimals; `leadTimeDays` is a JSON integer. A new row is 409 `MATERIAL_INACTIVE` or `LOCATION_INACTIVE` for an inactive reference, and 404 `MATERIAL_NOT_FOUND` or `LOCATION_NOT_FOUND` for an unknown one:
  - `GET /api/tenants/{tenant}/planning-parameters` (by material, then location);
  - `POST /api/tenants/{tenant}/planning-parameters` (`{ material, location, procurement, leadTimeDays, minimumQuantity, lotMultiple }`; 400 with a `procurement` field error for Make on a raw material; 409 `PLANNING_PARAMETERS_EXIST`);
  - `PATCH /api/tenants/{tenant}/planning-parameters/{material}/{location}` (`{ version, procurement?, leadTimeDays?, minimumQuantity?, lotMultiple? }`, at least one of them; 404 `PLANNING_PARAMETERS_NOT_FOUND`, or `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for an unknown or malformed ID in the path);
  - `DELETE /api/tenants/{tenant}/planning-parameters/{material}/{location}` (`{ version }`; the same 404 codes as `PATCH`);
  - `GET /api/tenants/{tenant}/safety-stock-targets` (by material, location, then date);
  - `POST /api/tenants/{tenant}/safety-stock-targets` (`{ material, location, effectiveFrom, quantity }`, the date as `YYYY-MM-DD`; 409 `SAFETY_STOCK_TARGET_EXISTS` for a second target on one date);
  - `PATCH /api/tenants/{tenant}/safety-stock-targets/{material}/{location}/{effectiveFrom}` (`{ quantity, version }`; 404 `SAFETY_STOCK_TARGET_NOT_FOUND`, or `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for an unknown or malformed ID in the path);
  - `DELETE /api/tenants/{tenant}/safety-stock-targets/{material}/{location}/{effectiveFrom}` (`{ version }`; the same 404 codes as `PATCH`).
- the forecasts of one tenant (spec `2026-10-20--1700UTC-forecasts`), with the same read and write rules. A forecast is the demand expected of a material at a location on a day, with no customer, keyed by `{material}`, `{location}` (eight-digit IDs) and `{date}` (`YYYY-MM-DD`); quantities are JSON **strings**, returned in the material's base unit with six decimals, and may be sent in any unit the material converts (`unit`, the base unit when omitted):
  - `GET /api/tenants/{tenant}/forecasts` (by material, location, then date; the optional `material` and `location` query parameters narrow it, and anything that is not an eight-digit ID is 400. Since #140 it comes in pages of 100: additive `?page=2`, 1-based, applied after the filters, and a page past the last is empty. `page` defaults to 1, so a caller that sends none gets the first 100 forecasts, every forecast for a tenant with no more than 100. Request successive pages until one returns fewer than 100. A malformed `page` is 400, where it used to be ignored);
  - `POST /api/tenants/{tenant}/forecasts` (`{ material, location, date, quantity, unit? }`; 409 `FORECAST_EXISTS` for a second forecast on one day, 400 with a `unit` or `quantity` field error for a unit the material doesn't convert or a quantity that rounds to nothing or overflows);
  - `PATCH /api/tenants/{tenant}/forecasts/{material}/{location}/{date}` (`{ quantity, unit?, version }`; 404 `FORECAST_NOT_FOUND`, or `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for an unknown or malformed ID in the path);
  - `DELETE /api/tenants/{tenant}/forecasts/{material}/{location}/{date}` (`{ version }`; the same 404 codes as `PATCH`).
- the BOMs of one tenant (spec `2026-10-20--0757UTC-boms`), with the same read and write rules. A BOM is addressed by its eight-digit ID, numbered per tenant; `priority` is a JSON integer (1 is the highest, up to 999); dates are `YYYY-MM-DD`, both included, and `validThrough` null means no end; each component line is `{ material, quantity, unit }` on input, its quantity a JSON **string** per one base unit of the output, and is returned as `{ material, quantity, enteredQuantity, enteredUnit, numerator, denominator }`, `quantity` in the component's base unit with six decimals. Field errors of a line are keyed by its path, `components.N.<field>`. A new BOM or line is 409 `MATERIAL_INACTIVE` for an inactive material and 404 `MATERIAL_NOT_FOUND` for an unknown one:
  - `GET /api/tenants/{tenant}/boms` (each with its current recipe; by output, priority, then ID);
  - `POST /api/tenants/{tenant}/boms` (`{ output, priority, validFrom, validThrough?, components }`; 400 with field errors for a raw output, a finished component, a repeated material or a line its conversion refuses; 409 `BOM_PRIORITY_CONFLICT`, `BOM_CYCLE`, `BOM_ID_RACE` or `BOM_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/boms/{id}` (with its `revisions`, newest first; 404 `BOM_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/boms/{id}` (`{ version, priority?, validFrom?, validThrough?, components?, active? }`, at least one besides `version`; `components` is the complete list; a real recipe change adds a revision, an identical one or a toggle doesn't; an `id` or `output` in the body is 400; 409 `BOM_PRIORITY_CONFLICT` or `BOM_CYCLE` as for `POST`, and `VERSION_CONFLICT` for a stale version or a revision saved at the same moment);
  - `GET /api/tenants/{tenant}/boms/{id}/revisions/{revision}` (404 `BOM_REVISION_NOT_FOUND`). Revisions never change.
- physical stock (spec `2026-10-20--1634UTC-stock-ledger-corrections`, D07): both roles can read and correct one tenant; decimal quantities are strings. UI `/admin/{tenant}/stock` accepts `?material={id}&location={id}&page={n}`, help topic `stock`:
  - `GET /api/tenants/{tenant}/stock?material={id}&location={id}&page={n}` returns a physical quantity in BUoM (zero for a missing pair) and a page of up to 100 movements, newest first (`page` defaults to 1, so a caller that sends none gets the newest 100 as before; since E13-S01 a malformed `page` is 400, where it used to be ignored. Additive since E13-S01: `page`, `movementCount`, and each movement's `source` `{ id, document }`, where `id` is its goods receipt's, goods issue's, transfer's or production completion's business ID and `document` is `{ type: "purchase-order" | "shipment" | "transfer" | "production-order", id }`, both null for a correction), with source, entered unit/factor, date and actor; since E07-S03 also `inTransitFrom` and `inTransitTo`, what Open transfers have in transit from and to the location, and `transitTransfers`, the IDs of those transfers (additive);
  - `POST /api/tenants/{tenant}/stock/corrections` takes `{ material, location, quantity, unit, reason }`, where `quantity` is a nonzero signed **change**, never a target balance; the date/source/actor/factor are server-owned. A body that names a `transfer` is 400 on `transfer` (since E07-S03; it used to be dropped): transit is written off on its transfer. Returns the immutable movement with its before/after balance. Shared bearer/key/generation/read-only requirements apply;
  - 409 `INSUFFICIENT_STOCK` includes available/required quantities; 400 `QUANTITY_OUT_OF_RANGE` or `QUANTITY_ROUNDS_TO_ZERO`; 409 `MATERIAL_INACTIVE` / `LOCATION_INACTIVE`, 404 missing references;
  - any movement permanently locks both material type and BUoM (`MATERIAL_HAS_MOVEMENTS`, 409), even at zero stock. Nonzero stock blocks material/location deactivation (`STOCK_NOT_EMPTY`, 409 with the affected pair and quantity). Movements remain immutable; future reversals append history.
- the purchase requisitions and purchase orders of one tenant (spec `2026-10-20--1636UTC-purchase-requisitions-orders`). Unlike master data, **any** token may write them (not only the admin's); the other read and write rules are the same. Both are addressed by an eight-digit ID, numbered per tenant and per kind; both start `open`; neither changes stock. Quantities are JSON **strings**: on input in any unit the material converts (`{ quantity, unit }`), on output `quantity` in the material's base unit with six decimals plus `enteredQuantity`, `enteredUnit`, `numerator`, `denominator`; dates are `YYYY-MM-DD`. A new document is 409 `MATERIAL_INACTIVE`, `LOCATION_INACTIVE` or `SUPPLIER_INACTIVE` for an inactive master, and 404 `MATERIAL_NOT_FOUND`, `LOCATION_NOT_FOUND` or `SUPPLIER_NOT_FOUND` for an unknown one, the other tenant's included:
  - `GET /api/tenants/{tenant}/purchase-requisitions` (by ID; each with `converted`, `outstanding` and `status` `open` or `completed`);
  - `POST /api/tenants/{tenant}/purchase-requisitions` (`{ material, location, quantity, unit, requiredDate }`; 400 with field errors for a quantity or unit its conversion refuses; 409 `REQUISITION_ID_RACE` or `REQUISITION_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/purchase-requisitions/{id}` (404 `REQUISITION_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/purchase-requisitions/{id}` (`{ version, requiredDate }`; a `material`, `location`, `quantity` or `unit` in the body is 400; `VERSION_CONFLICT` for a stale version);
  - `GET /api/tenants/{tenant}/purchase-orders` (by ID, in pages of 100: additive `?page=2`, 1-based, an empty list past the last; `page` defaults to 1, so a caller that sends none gets the first 100 orders, every order for a tenant with no more than 100, and since #126 a malformed `page` is 400 where it used to be ignored; each with its `lines`, numbered from 1, each with `received`, `outstanding` (never negative) and `status` `open` or `completed`; an order is `open` or `completed`);
  - `POST /api/tenants/{tenant}/purchase-orders` (`{ supplier, location, lines: [{ material, quantity, unit, plannedDate, requisition?, location? }] }`, 1 to 100 lines. A line may name an Open `requisition` of its material and the order's location, which converts that much of it; a line `location` other than the order's is 400 on `lines.N.location`, a requisition of another material or location 400 on `lines.N.requisition`; field errors of a line are keyed by its path, `lines.N.<field>`. 404 `REQUISITION_NOT_FOUND`; 409 `REQUISITION_NOT_OPEN`, `REQUISITION_OVER_CONVERTED`, `ORDER_ID_RACE` or `ORDER_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/purchase-orders/{id}` (404 `PURCHASE_ORDER_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/purchase-orders/{id}` (`{ version, lines: [{ line, plannedDate }] }`, the planned dates of lines by their number, a number the order doesn't have is 400 on `lines.N.line`; a `supplier` or `location` in the body, or a line's `material`, `unit` or `quantity`, is 400 (until E09-S02 a line's extra fields were dropped); `VERSION_CONFLICT` for a stale version; 409 `PURCHASE_ORDER_NOT_OPEN` once the order is `completed`).
  - A material with an open order line can't be deactivated: `PATCH /api/tenants/{tenant}/materials/{id}` answers 409 `MATERIAL_IN_OPEN_ORDER`, naming the order, and a base-unit change once any requisition or order line holds a quantity of it is 409 `BASE_UNIT_IN_USE`.
  - A location that an Open purchase order delivers to, or that has an Open requisition, can't be deactivated: `PATCH /api/tenants/{tenant}/locations/{id}` answers 409 `LOCATION_HAS_PURCHASE_ORDERS` (`params.order`) or `LOCATION_HAS_REQUISITIONS` (`params.requisition`), naming the lowest such document, and changes nothing (since E09-S03, #141; until then the deactivation succeeded and every receipt on the order was then refused `LOCATION_INACTIVE`).
- the goods receipts of one tenant (spec `2026-10-20--1933UTC-goods-receipts`). Any token may post them. A receipt is against one Open purchase order, has an eight-digit ID numbered per tenant, and never changes; posting it raises stock at the order's location, dated the server's UTC day, adds to each order line's `received` and completes the order once every line is received in full, all in one transaction or not at all:
  - `GET /api/tenants/{tenant}/goods-receipts` (newest first, in pages of 100: `?page=2`, 1-based, a page past the last is empty; `page` defaults to 1, so a caller that sends none gets the newest 100 receipts, every receipt for a tenant with no more than 100, and since #115 a malformed `page` is 400; `?purchaseOrder=00000001` keeps one order's, 404 `PURCHASE_ORDER_NOT_FOUND` for an order the tenant doesn't have). Each is `{ id, purchaseOrder, location, businessDate, createdAt, lines: [{ line, material, quantity, enteredQuantity, enteredUnit, numerator, denominator }] }`, `line` being the order line's number;
  - `POST /api/tenants/{tenant}/goods-receipts` (`{ purchaseOrder, lines: [{ line, quantity, unit, purchaseOrder? }] }`, 1 to 100 lines, each for a different order line; no date is taken). The posted receipt adds `warnings`, `[{ code: "OVER_RECEIPT", line, excess }]` for each line that received more than was outstanding: an excess is accepted. A line `purchaseOrder` other than the receipt's is 400 on `lines.N.purchaseOrder`, a line number the order doesn't have 400 on `lines.N.line`, a repeated one 400 on the repeat; 404 `PURCHASE_ORDER_NOT_FOUND`; 409 `PURCHASE_ORDER_NOT_OPEN`, `MATERIAL_INACTIVE`, `LOCATION_INACTIVE`, `RECEIPT_ID_RACE` or `RECEIPT_IDS_EXHAUSTED`; 400 on `lines.N.quantity` when the line's received total would not fit, and `QUANTITY_OUT_OF_RANGE` when the stock balance would not;
  - `GET /api/tenants/{tenant}/goods-receipts/{id}` (404 `GOODS_RECEIPT_NOT_FOUND`).
  - Each receipt line's stock movement has `type` `goods-receipt` and the receipt's internal UUID as its `postingId`.
- the transfers of one tenant (spec `2026-10-20--2046UTC-transfers`). Any token may write them. A transfer moves one material from a source to a different destination location, has an eight-digit ID numbered per tenant, starts `open`, and is `completed` once its planned quantity is received; creating it changes no stock. Quantities are JSON strings as for purchasing (input `{ quantity, unit }` in any unit the material converts; output six-decimal base quantities plus the entered quantity, unit and factor); dates are `YYYY-MM-DD`. A transfer view is `{ id, material, source, destination, quantity, enteredQuantity, enteredUnit, numerator, denominator, plannedDispatch, plannedArrival, dispatched, received, writtenOff, inTransit, undispatched, status, createdAt, updatedAt, version }`:
  - `GET /api/tenants/{tenant}/transfers?page=N` (by ID, 100 per page; another query parameter is 400);
  - `POST /api/tenants/{tenant}/transfers` (`{ material, source, destination, quantity, unit, plannedDispatch, plannedArrival }`; the same location twice is 400 on `destination`, an arrival before the dispatch 400 on `plannedArrival`, a `materials` or `lines` field 400 on it; inactive or unknown masters as for purchasing; 409 `TRANSFER_ID_RACE` or `TRANSFER_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/transfers/{id}` (with its newest 100 `postings`, each `{ id, kind, businessDate, occurredAt, quantity, enteredQuantity, enteredUnit, numerator, denominator, reason, actorUsername, channel, legs: [{ place, location, quantity, before, after }] }`, `kind` `dispatch`, `receipt` or `write-off`, `place` `source`, `transit` or `destination`; 404 `TRANSFER_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/transfers/{id}` (`{ version, plannedDispatch, plannedArrival }`; a `material`, `source`, `destination`, `quantity` or `unit` is 400; `VERSION_CONFLICT`; 409 `TRANSFER_NOT_OPEN` once completed);
  - `POST /api/tenants/{tenant}/transfers/{id}/dispatches` and `…/receipts` (`{ quantity, unit }`), and `…/write-offs` (`{ quantity, unit, reason }`), each returning `{ transfer, posting }`, dated the server's UTC day, both legs in one transaction or nothing. 409 `TRANSFER_OVER_DISPATCH` beyond what is left to dispatch, `INSUFFICIENT_STOCK` beyond the source's physical stock, `TRANSFER_OVER_RECEIPT` / `TRANSFER_OVER_WRITE_OFF` beyond what is in transit (each with `params` `transfer`, `available`, `requested`, `unit`), `TRANSFER_NOT_OPEN` on a completed transfer.
  - A dispatch's stock movement has `type` `transfer-dispatch`, a receipt's `transfer-receipt`, and the posting's `id` as its `postingId`.
  - A location that an Open transfer leaves from or goes to can't be deactivated (409 `LOCATION_HAS_OPEN_TRANSFERS`, `params.transfer`), nor a material with an Open transfer (409 `MATERIAL_IN_OPEN_TRANSFER`); a base-unit change once any transfer holds the material is 409 `BASE_UNIT_IN_USE`.
- the master-data and BOM import (spec `2026-10-20--0908UTC-master-data-bom-import`). The workbook travels as **base64** in a JSON body, at most 512 KB once decoded:
  - `GET /api/import/template` (any signed-in account, bearer or session cookie): the `.xlsx` template, as an attachment;
  - `POST /api/tenants/{tenant}/import/dry-run` (`{ workbook }`, admin only): the `ImportReport` (`{ committed: false, previewToken, summary, rows, errors }`). Errors in the workbook are in `errors`, each `{ sheet, row, column, code, message, params? }`, not an error status; `previewToken` is set only when there are none. 400 `VALIDATION_FAILED` on `workbook` for a file that isn't base64, is over 512 KB, isn't a readable `.xlsx`, has more than 2,000 rows, unpacks past 20 MB or has sheets spanning more than 200,000 cells;
  - `POST /api/tenants/{tenant}/import/commit` (`{ workbook, previewToken }`, admin only): the same report with `committed: true`, every row applied, or nothing; 400 on a missing `previewToken`, 409 `IMPORT_STALE` when the re-run differs from the dry run (a record the rows name or write was edited, or the workbook differs).
  - The report's own codes are `IMPORT_EMPTY`, `IMPORT_UNKNOWN_SHEET`, `IMPORT_DUPLICATE_SHEET`, `IMPORT_MISSING_COLUMN`, `IMPORT_UNKNOWN_COLUMN`, `IMPORT_UNKNOWN_ID`, `IMPORT_DUPLICATE_KEY`, `IMPORT_MISSING_REFERENCE`, `IMPORT_NEW_RECORD_INACTIVE`, `IMPORT_REFERENCE_REQUIRED`, `IMPORT_BOM_WITHOUT_LINES` and `IMPORT_LINE_WITHOUT_HEADER`, beside the services' own codes.
  - **The workbook layout is protected too** (`core/src/domain/imports/workbook-layout.ts`): admins keep filled templates, so the sheet names, column headers and what each column means change only by adding (a new optional sheet or column). Renaming one needs the old name accepted for one release.
- the stock import (spec `2026-10-20--2225UTC-stock-import`, E07-S02). Both roles; UI `/admin/{tenant}/stock-import`, help topic `stock-import`. The workbook travels as base64 with the master import's limits, and the routes answer the master import's `ImportReport`:
  - `GET /api/stock-import/template` (any signed-in account, bearer or session cookie): the `.xlsx` template, as an attachment;
  - `POST /api/tenants/{tenant}/stock-import/dry-run` (`{ workbook }`): the report. Each row is `update` (a movement would post; `changes` lists `Physical quantity` before → after, `Movement`, and `Entered` for another unit) or `unchanged`, `record` being `{material}/{location}`; `created` is always 0. It writes no stock;
  - `POST /api/tenants/{tenant}/stock-import/commit` (`{ workbook, previewToken, reason }`): the same report with `committed: true`, every movement posted as one `correction` posting with `reason`, or nothing. 400 on a missing `previewToken` or `reason`; 409 `IMPORT_STALE` when a listed balance (or the workbook) changed since the dry run.
  - A row's quantity is the **desired physical balance**, never a change; positions not listed are untouched. Its own codes are the master import's plus `IMPORT_TRANSIT_COLUMN` (a `Transfer`, `Transfer ID`, `In transit` or `In-transit` column).
  - **The Stock sheet's layout is protected** (`core/src/domain/imports/stock-layout.ts`) as the master workbook's is.

- customer orders of one tenant (spec `2026-10-20--1635UTC-customer-orders`, design #101), maintained by both roles with the same key/generation/read-only rules. IDs are eight digits; quantities are JSON strings; dates are ISO `YYYY-MM-DD`:
  - `GET /api/tenants/{tenant}/customer-orders` and `/{id}` (404 `CUSTOMER_ORDER_NOT_FOUND`), returning header customer/location/status/version and ordered lines with stable UUID, material, stored BUoM quantity, entered quantity/unit/factor, requiredDate, fulfilled/abandoned quantities and status;
  - `POST /api/tenants/{tenant}/customer-orders` (`{ customer, location, lines: [{ material, quantity, unit, requiredDate }] }`), returns HTTP 200 through the shared envelope. Header/lines start Open, progress zero. Unknown references use existing 404 codes, inactive newly selected masters 409 `{KIND}_INACTIVE`, exhausted/racing IDs 409 `CUSTOMER_ORDER_IDS_EXHAUSTED` / `CUSTOMER_ORDER_ID_RACE`;
  - `PATCH /api/tenants/{tenant}/customer-orders/{id}` (`{ version, customer, location, lines: [{ id?, material, quantity, unit, requiredDate }] }`), replaces the visible aggregate; existing IDs must belong to this order and appear once. Omitted unposted lines become hidden historical references, preserving material type/BUoM locks. New lines have no ID. A no-op writes no audit and preserves version; a real line-only edit advances header version. An unchanged entered quantity/unit/material preserves its historical factor;
  - all request objects are strict: no client-written status/progress/ID or line location override; line errors use `lines.N.field`. Non-Open orders and posted-field edits are 409 `CUSTOMER_ORDER_LOCKED`; quantity cannot fall below fulfilled plus abandoned. Outstanding demand blocks material/location deactivation (`MATERIAL_HAS_CUSTOMER_DEMAND`, `LOCATION_HAS_CUSTOMER_ORDERS`); customer deactivation remains allowed.
  - a goods issue advances the order's `version`, and fulfils lines: a line whose `fulfilled` reaches its quantity becomes `completed`, and the order once every line is. A `PATCH` that lowers a delivered line to exactly its fulfilled quantity completes it the same way. A line that a shipment names can't be removed or change its material (409 `CUSTOMER_ORDER_LOCKED`).
- shipments and goods issues of one tenant (spec `2026-10-20--2045UTC-shipments-goods-issues`). Any token may write them. Both have eight-digit IDs numbered per tenant.
  - A shipment plans a dispatch against one Open customer order and never moves stock. It is `open` until nothing is left to issue on it, then `completed`.
  - A goods issue is posted against one Open shipment and never changes. Posting it, in one transaction or not at all:
    - lowers stock at the order's location, dated the server's UTC day;
    - adds to each order line's `fulfilled` and to each shipment line's `issued`;
    - completes the lines, the order and the shipments that have nothing left.
  - `GET /api/tenants/{tenant}/shipments` returns the shipments newest first, in pages of 100 (`?page=2`; a page past the last is empty); `?customerOrder=00000001` keeps one order's (404 `CUSTOMER_ORDER_NOT_FOUND`). Each is `{ id, customerOrder, customer, location, plannedDate, status, createdAt, lines: [{ line, orderLine, material, quantity, enteredQuantity, enteredUnit, numerator, denominator, issued, toIssue }] }`. `line` numbers the shipment's lines from 1, `orderLine` is the order line's stable ID, and `toIssue` is the smaller of the plan's remainder and the order line's outstanding.
  - `POST /api/tenants/{tenant}/shipments` takes `{ customerOrder, plannedDate, lines: [{ orderLine, quantity, unit, customerOrder? }] }`, with 1 to 100 lines, each for a different order line. Refusals:
    - 400 on a line field: `lines.N.customerOrder` for a line naming another order; `lines.N.orderLine` for an ID that isn't a visible line of the order; `lines.N.quantity` for more than the line's outstanding;
    - 404 `CUSTOMER_ORDER_NOT_FOUND`;
    - 409 `CUSTOMER_ORDER_NOT_OPEN`, `SHIPMENT_ID_RACE` or `SHIPMENT_IDS_EXHAUSTED`.
  - `GET /api/tenants/{tenant}/shipments/{id}` returns one shipment (404 `SHIPMENT_NOT_FOUND`).
  - `GET /api/tenants/{tenant}/goods-issues` returns the goods issues newest first, in pages of 100 (`?page=2`); `?shipment=00000001` keeps one shipment's (404 `SHIPMENT_NOT_FOUND`). Each is `{ id, shipment, customerOrder, location, businessDate, createdAt, lines: [{ line, orderLine, material, quantity, enteredQuantity, enteredUnit, numerator, denominator }] }`.
  - `POST /api/tenants/{tenant}/goods-issues` takes `{ shipment, lines: [{ line, quantity, unit, shipment? }] }`, with 1 to 100 lines, each for a different shipment line. It takes no date: a sent date is dropped. Refusals:
    - 400 on a line field: `lines.N.shipment` for a line naming another shipment; `lines.N.line` for a line number the shipment doesn't have; `lines.N.quantity` for more than the line's `toIssue`, whatever the stock;
    - 404 `SHIPMENT_NOT_FOUND`;
    - 409 `SHIPMENT_NOT_OPEN`, `CUSTOMER_ORDER_NOT_OPEN`, `ISSUE_ID_RACE`, `ISSUE_IDS_EXHAUSTED` or `VERSION_CONFLICT`;
    - 409 `INSUFFICIENT_STOCK`, with `params` `{ material, location, available, requested, unit }`.
  - `GET /api/tenants/{tenant}/goods-issues/{id}` returns one goods issue (404 `GOODS_ISSUE_NOT_FOUND`).
  - Each goods-issue line's stock movement has `type` `goods-issue`, a negative quantity, and the issue's internal UUID as its `postingId`.
- the current stock report of one tenant (spec `2026-10-20--2221UTC-stock-report`, E13-S01). Any signed-in account reads it, a read-only tenant included; it writes nothing. `GET /api/tenants/{tenant}/reports/stock?material={id}&location={id}&includeZero=true|false&page={n}` (every parameter optional; another parameter is 400) returns `{ asOf, page, pageSize, total, rows }`, `asOf` the server's UTC date and 100 rows per page by material, then location ID. A row is `{ material, materialDescription, materialActive, baseUnit, location, locationName, locationActive, quantity, inTransitFrom, inTransitTo }`, six-decimal base-unit strings: physical on-hand, and what Open transfers have in transit from and to the location, never added to `quantity`. A pair is a row once anything was posted there or it has stock in transit; rows that are all zero only with `includeZero=true`. 404 `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for a filter the tenant doesn't have.
- the production variance report of one tenant (spec `2026-10-21--0947UTC-production-variance-report`, E13-S02). Any signed-in account reads it, a read-only tenant included; it writes nothing. `GET /api/tenants/{tenant}/reports/variance?material={id}&location={id}&status=open|completed|closed-early|cancelled&from={YYYY-MM-DD}&to={YYYY-MM-DD}&page={n}` (every parameter optional; another parameter, an impossible date or `from` after `to` is 400) returns `{ asOf, page, pageSize, total, rows }`, 50 production orders per page by order ID, each with a completion posted in the range. A row is `{ id, output, outputDescription, baseUnit, location, locationName, status, bom, revision, target, produced, outputVariance, completions, wasteCompletions, reversed, components }`: `produced` sums the counted completions, `outputVariance` is produced − target (signed) and null under a date range, `reversed` lists the business IDs of reversed completions (a movement of the completion is the original of a stock reversal link), counted nowhere. A component is `{ material, description, baseUnit, extra, expected, actual, variance, waste }`, six-decimal base-unit strings summed from the stored completion lines, `variance` signed, `waste` the part of `actual` posted by zero-output completions; pinned components first in recipe order, then extra inputs by material ID. `material` keeps an order that makes the material or whose counted completions expected or used it. 404 `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for a filter the tenant doesn't have.

**Versions.** An edit of a versioned record (today: a user, a material, a material's conversion, a location, a customer, a supplier, a planning parameter set, a safety-stock target, a forecast, a BOM, a purchase requisition, a purchase order and a transfer) carries the `version` it loaded. A stale one is 409 `VERSION_CONFLICT`, and the newer change is kept. The user routes answer 404 `NOT_FOUND` for the built-in admin, an unknown id or a malformed one.

Every tenant-scoped endpoint lives under `/api/tenants/{tenant}/`.

**Authentication** is part of the contract:
- `Authorization: Bearer <token>` works on every route. A bad token is 401 "Invalid or revoked token.", never a fallback to the cookie.
- The `cpg_session` cookie works on `GET`/`HEAD` only.
- Tokens are `cpg_`-prefixed and never expire.
- No route creates a token (R07). Adding one is a product change, not an API addition.

**Writes are keyed** (R07, spec `2026-10-19--1548UTC-api-idempotency`). Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Idempotency-Key` header: 1–255 visible ASCII characters, compared case-sensitively.
- **Missing or malformed key:** 400 `IDEMPOTENCY_KEY_REQUIRED`.
- **Scope:** a key belongs to the account (all its tokens) and to the global scope or one tenant.
- **Repeats within 24 hours:**
  - the same method, path and body replays the first successful response, with the header `Idempotent-Replayed: true`, and changes nothing;
  - anything else is 409 `IDEMPOTENCY_KEY_REUSED`.
- **Failed requests** store nothing, so their key stays unused.
- **Tenant writes** under `/api/tenants/{tenant}/` also take a `Dataset-Generation` header carrying the tenant's current generation, from tenant metadata:
  - required for Test: missing is 428 `GENERATION_REQUIRED`;
  - optional for Prod;
  - a malformed value is 428 `GENERATION_REQUIRED` in either tenant;
  - a stale value is 409 `GENERATION_STALE`.
- **Read-only tenants** (R05): every tenant write to a read-only tenant is 409 `TENANT_READ_ONLY`, whoever the caller is. It is checked after the generation and after the key lookup, so a repeat of a write stored before the flag was set still replays. Nothing is written, and the key stays unused.

These header names, codes and statuses are part of the contract. `tests/api-writes.test.ts` keeps every write route on the keyed wrapper.

Stock conflict envelopes may include additive `error.params` (string-valued public context for translations). `INSUFFICIENT_STOCK` supplies material, location, available, requested and unit; `STOCK_NOT_EMPTY` supplies material, location, quantity and unit. The existing English `message`, status and code remain stable.

Customer-order collection reads use optional `?page=1` (integer 1–1000000), fixed pages of 100 orders in ascending ID order. The data remains an array; request successive pages until fewer than 100 records are returned. Unknown query keys and invalid page values are validation errors.

#### Production orders (E10-S01, #88)

Tenant routes `/api/tenants/{tenant}/production-orders`, `/{id}` and `/options` use business IDs, shared envelopes and decimal-string quantities. Collection pages contain at most 100 summaries (`page` defaults to 1). Options is an authenticated read; create/update use the shared bearer, key, generation and read-only gates. Creation accepts output/location/target/unit/finish and optional paired BOM/revision; explicit selection never silently repins a superseded revision. PATCH changes target/unit/finish at the submitted version only. Detail and options components carry `material`, `baseUnit`, `active` (the component material's current state), `quantity`, `required`, `available` and `shortage`. Stored revision, lead time and unchanged conversion remain historical facts; creating or editing a production order changes no stock (completions, below, are the one production write that does). Summaries and detail carry `outstanding` (target − produced, never below zero). An edit that lowers the target to exactly the produced quantity makes the order `completed`. New refusal codes use the `PRODUCTION_` prefix plus master usage codes `MATERIAL_HAS_PRODUCTION_ORDERS` and `LOCATION_HAS_PRODUCTION_ORDERS` with public `order` parameters. The additive production_order table is tenant-owned.

#### Production completions (E10-S02, #89)

Tenant routes under `/api/tenants/{tenant}/production-orders/{id}/completions`, `{id}` the order's business ID:

- `GET …/completions/preview?quantity=&unit=` is an authenticated read (it works in read-only tenants). It returns `{ order, location, quantity, baseQuantity, baseUnit, produced, target, producedAfter, exceedsTarget, components: [{ material, description, baseUnit, units, active, perOutput, expected, available }] }`, where `expected` is the pinned revision's per-output quantity × output, rounded up to six decimals. A non-Open order is `PRODUCTION_ORDER_LOCKED`.
- `GET …/completions?page=1` returns the order's completions newest first, 20 to a page: `{ id, order, businessDate, quantity, enteredQuantity, enteredUnit, baseUnit, waste, createdAt, lines: [{ material, baseUnit, expected, actual, variance, enteredQuantity, enteredUnit, extra }] }`. `variance` is signed (actual − expected); `waste` means a zero output.
- `POST …/completions` uses the shared bearer, key, generation and read-only gates. It takes the strict body `{ quantity, unit, components: [{ material, quantity, unit }] (1–100), acceptOverproduction? }`. Every pinned component must be listed once (0 allowed). Extra inputs must be active raw/intermediate materials with a positive quantity. It returns `{ completion, order }`. Refusals:
  - line problems: `VALIDATION_FAILED` keyed `components.N.<field>`, or `components` for a missing pinned component or more than 100 movements;
  - a completion that produces and uses nothing: `PRODUCTION_COMPLETION_EMPTY`;
  - a total past the target without `acceptOverproduction: true`: `PRODUCTION_OVERPRODUCTION` (409, params `produced`, `target`, `output`, `unit`);
  - an overdraw: `INSUFFICIENT_STOCK` (409, params `material`, `location`, `available`, `requested`, `unit`);
  - `PRODUCTION_ORDER_LOCKED`, `PRODUCTION_ORDER_CHANGED`, `PRODUCTION_COMPLETION_ID_RACE`, `PRODUCTION_COMPLETION_IDS_EXHAUSTED` and `QUANTITY_OUT_OF_RANGE`.

  Any refusal writes nothing.
- A completion's stock movements have `type` `production-completion` and the completion's internal UUID as their `postingId`. They are posted at the order's location, dated today: the output first (when positive), then each material used, negative.
- The order's `produced` rises by the output, and its status becomes `completed` once produced ≥ target.
- Audit actions: `production-orders.production-completion.posted` (flat per-line keys `line{n}Material/Expected/Actual/Variance/Extra`) and `production-orders.production-order.progressed`.
- The additive `production_completion` and `production_completion_line` tables are tenant-owned and immutable. The completion's nullable `submission` is the UI's duplicate-submit token, unique per tenant and never exposed.

#### Document cancellation and early closure (E11-S01, #90)

Each tenant document path `/{customer-orders,purchase-requisitions,purchase-orders,production-orders,transfers}/{id}` adds keyed `POST /cancel` and `POST /close-early`. Both roles may call them, with the existing bearer, tenant-generation and read-only guards. The strict body is `{ version }`; customer orders additionally accept `lines: UUID[]`, purchase orders `lines: number[]` using their existing 1-based positions. An omitted selection resolves the whole document; a selection must contain 1–100 unique lines belonging to it. No endpoint accepts arbitrary status or reopens a terminal document.

- Cancellation requires an Open target without processing. Early closure requires processing and abandons only its remainder. Recorded quantities, conversions, source links, stock and postings remain unchanged. Production waste with zero output counts as processing. Transfer early closure requires zero transit; loss remains loss and is included in abandoned destination quantity.
- Line/header states are `open`, `completed`, `cancelled`, `closed-early`. Headers are Open if any retained line is Open, Completed if all are Completed, Cancelled if all are Cancelled, and otherwise Closed Early. Removed historical customer-order lines are excluded. A cancelled or closed-early line rejects further fulfillment; Completed PO lines still permit overreceipt while their header is Open.
- Requisition and transfer views add `abandoned`; transfer views also add `outstanding`. PO lines add `abandoned` and persist all four states. Production detail adds `hasProcessing`. Outstanding across these documents is `max(quantity − processed − abandoned, 0)`; a terminal transfer's `undispatched` is zero. Existing fields remain present.
- New 409 codes are `DOCUMENT_NOT_OPEN`, `DOCUMENT_PROCESSED` (use Close Early), `DOCUMENT_UNPROCESSED` (use Cancel), and `TRANSFER_IN_TRANSIT` with public `quantity`/`unit` parameters. Existing document-specific terminal, not-found and version codes remain. Invalid selections return `VALIDATION_FAILED`; a refusal changes nothing.
- Audit adds `.cancelled` / `.closed-early` under each existing document prefix, preserving before/after quantities and state. Same-key retries replay the original result without new audit. Customer-order closure completes affected shipment contexts in the same transaction.

#### Stock reversals (#91)

- `GET /api/tenants/{tenant}/stock/movements/{id}` reads one tenant-local movement with source and reversal links; invalid UUID is `400 VALIDATION_FAILED`, missing/foreign ID is `404 STOCK_MOVEMENT_NOT_FOUND`.
- `POST /api/tenants/{tenant}/stock/movements/{id}/reverse` accepts only `{ reason }` (trimmed, 1–500 characters), under the existing bearer, idempotency, generation and read-only contract. Both roles may reverse. Success returns `{ original, movement }` in the shared envelope. Quantity is the full exact inverse and business date is today UTC.
- `409 STOCK_ALREADY_REVERSED` includes `error.params.reversal`, the existing inverse UUID. Unsupported source or inconsistent history returns `409 STOCK_REVERSAL_UNSUPPORTED` / `STOCK_REVERSAL_INCONSISTENT`. Existing insufficient-stock and 400 overflow refusals remain unchanged. A failure writes no stock, document progress, audit or idempotency receipt.
- Ledger movements add `reverses`, `reversedBy` (nullable UUIDs) and `canReverse` (source eligibility). GR/GI lines add `movementId` and `reversedBy` (nullable UUIDs). Customer-order lines add `posted`, which remains true after full reversal. Ledger/GI pagination is unchanged; receipt lists are paged since #115.
- Reversal links and original movements are immutable. Receipt/issue originals retain their quantities and dates. Reversals may reopen automatically completed orders/shipments; explicit closure and abandonment stay authoritative. Historical customer/location/material/unit/date locks survive net fulfilment returning to zero.
- The additive link migration needs no ledger backfill. Its down migration only removes links: it does not undo inverses or document progress. After reversals are used, rolling back the application requires backup recovery or forward repair; down alone is not a business rollback.

#### Lifecycle and reversal integration (#90 / #91)

- Immutable receipt/issue history counts as processing even when its net quantity returns to zero: Cancel refuses and Close Early remains available for the restored remainder.
- Reversals preserve each Cancelled/Closed Early line and its recorded abandonment; these lines expose zero outstanding and cannot receive or issue more. Headers are recomputed from retained line states, so reversing an automatically Completed sibling may reopen a mixed header without reopening explicitly closed lines.
- PO progress readers and material-use checks tolerate an older writer changing received quantities without knowing the added status column during deployment overlap.

#### Production completion and transfer posting reversals (E11-S03, #92)

- `POST /api/tenants/{tenant}/production-orders/{id}/completions/{completionId}/reverse` accepts only `{ reason }` (trimmed, 1–500 characters). It uses the existing bearer, idempotency, generation and read-only contract, and both roles may call it. It reverses the whole completion once, today: every movement of the completion is inverted as one `reversal` posting group, and each original is linked through `StockReversal`. Success returns `{ completion, order, movements }`. An invalid completion ID is `400 VALIDATION_FAILED`; a missing, foreign or other-order ID is `404 PRODUCTION_COMPLETION_NOT_FOUND`.
- `409 PRODUCTION_COMPLETION_ALREADY_REVERSED` carries `error.params.reversal` (the reversal's posting ID) when it is known. Short finished output is the existing `409 INSUFFICIENT_STOCK`, and an overflowing returned input is `400 QUANTITY_OUT_OF_RANGE`. Inconsistent history is `409 STOCK_REVERSAL_INCONSISTENT`, and a concurrent order change is `409 PRODUCTION_ORDER_CHANGED`. A failure writes no stock, link, progress, audit or idempotency receipt.
- Completion views add `reversal: { id, businessDate, occurredAt, reason, actorUsername, channel } | null`. Their quantities and lines stay as posted. The movement endpoint keeps refusing production movements (`STOCK_REVERSAL_UNSUPPORTED`).
- A reversal lowers `produced` by the completion's output. A Completed order reopens when it falls below its target; an Open order stays Open, and a Closed Early order stays Closed Early with its abandonment. Production `outstanding` now honours terminal status, so a Closed Early order keeps exposing zero, as the lifecycle bullets above already promise. Completion existence still counts as processing.
- `POST /api/tenants/{tenant}/transfers/{id}/postings/{postingId}/reverse` accepts only `{ reason }`, under the same keyed write contract, and both roles may call it. `postingId` is the posting UUID the transfer detail already exposes. It reverses one dispatch, receipt or write-off in full, once, today. The physical leg, when there is one, is a `reversal` movement linked through `StockReversal`; the transit leg is an append-only `TransferReversal`. Success returns `{ transfer, reversal }`. An invalid posting ID is `400 VALIDATION_FAILED`; a missing, foreign or other-transfer posting is `404 TRANSFER_POSTING_NOT_FOUND`.
- Refusals:
  - `409 TRANSFER_POSTING_ALREADY_REVERSED` (`error.params.reversal` when known);
  - `409 TRANSFER_REVERSAL_ORDER` (`{ transfer, received, writtenOff, unit }`): a dispatch waits until the transfer's net received and written-off are both zero;
  - `409 TRANSFER_MASTER_INACTIVE` (`{ transfer, material?, source?, destination? }`);
  - the existing `409 INSUFFICIENT_STOCK` (destination no longer holds a receipt), `400 QUANTITY_OUT_OF_RANGE`, `409 STOCK_REVERSAL_INCONSISTENT` and `409 VERSION_CONFLICT`.
- Transfer detail adds `reversals: [{ id, original, kind, businessDate, occurredAt, quantity, reason, actorUsername, channel, legs }]`: the reversals of the postings it returns, so each original is shown too. Each posting adds `reversedBy` (nullable UUID) and `canReverse` (source eligibility; the writable-tenant gate stays separate). `TransferPosting.kind` and existing posting fields are unchanged. The movement endpoint keeps refusing transfer movements.
- **Amendment to the lifecycle bullets above, transfers only:** every transfer reversal leaves the transfer Open and resets its `abandoned` to zero. A Completed or Closed Early transfer therefore reopens, because a transfer cannot stay closed with stock in transit (TRF-027). A transfer's processing is now the existence of any posting, not `dispatched > 0`, so a fully reversed transfer still refuses Cancel.
- The additive `transfer_reversal` migration needs no backfill. Its down migration only drops the table: it does not undo posted inverses or recalculated progress, so a rollback after use needs backup recovery or forward repair. During deploy overlap the previous release ignores the table.

### 5. Commands used by CI, deploy and the docs

Source: root `package.json` scripts, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.ai/agentic.config.json`, `AGENTS.md`, `SDLC.md`.

**Breaking:** renaming or removing `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:coverage`, `test:integration`, `db:migrate` or `db:migration:create`. **Required path:** update every workflow, the config's `validation.commands`, `AGENTS.md` and `SDLC.md` in the same PR.

## Not protected

- **`@cpg/*` package exports.** The workspace packages are private, unpublished and consumed only inside this monorepo. Change them freely, but update every caller in the same PR (typecheck enforces it).
- **Domain event IDs** (`concept.entity.action`). They are in-process only, with no external subscribers. Revisit this if events ever leave the process (webhooks, a queue).
- **Internal file layout**, as long as `AGENTS.md` and the engineering standards stay accurate.

## Changing this document

Add a surface here in the same PR that creates it, for example the first `/api` route, the first webhook or the first exported file format.
