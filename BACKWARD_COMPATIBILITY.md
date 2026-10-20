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
- physical stock (spec `2026-10-20--1634UTC-stock-ledger-corrections`, D07): both roles can read and correct one tenant; decimal quantities are strings. UI `/admin/{tenant}/stock` accepts `?material={id}&location={id}`, help topic `stock`:
  - `GET /api/tenants/{tenant}/stock?material={id}&location={id}` returns a physical quantity in BUoM (zero for a missing pair) and up to 100 recent movements, with source, entered unit/factor, date and actor;
  - `POST /api/tenants/{tenant}/stock/corrections` takes `{ material, location, quantity, unit, reason }`, where `quantity` is a nonzero signed **change**, never a target balance; the date/source/actor/factor are server-owned. Returns the immutable movement with its before/after balance. Shared bearer/key/generation/read-only requirements apply;
  - 409 `INSUFFICIENT_STOCK` includes available/required quantities; 400 `QUANTITY_OUT_OF_RANGE` or `QUANTITY_ROUNDS_TO_ZERO`; 409 `MATERIAL_INACTIVE` / `LOCATION_INACTIVE`, 404 missing references;
  - any movement permanently locks both material type and BUoM (`MATERIAL_HAS_MOVEMENTS`, 409), even at zero stock. Nonzero stock blocks material/location deactivation (`STOCK_NOT_EMPTY`, 409 with the affected pair and quantity). Movements remain immutable; future reversals append history.

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
- `POST /api/tenants/test/reset` (`{}` only, bearer admin only): atomically replaces Test business data/audit with demonstration data, increments its generation and restores its original read-only flag. Prod and global identities/audit survive. Requires both `Idempotency-Key` and current `Dataset-Generation` even when Test is read-only. Response: the new `{ code, name, generation, readOnly }`. No Prod reset route exists. Missing generation is 428 `GENERATION_REQUIRED`, stale is 409 `GENERATION_STALE` **before key lookup**; 409 `GENERATION_EXHAUSTED` at 999999999. The reset deletes old Test keys and stores its own receipt in the new generation. After a lost response, fetch current metadata and retry the **same** key with the current generation to replay; do not automatically use a new key, which requests another reset. A later reset removes that receipt too. This is the sole tenant-data operation allowed while Test is read-only; ordinary writes retain the existing refusal. A failed reset stores no key and rolls back data, generation, flags and audit. A successful reset cannot be undone by rolling back application code.
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
  - `PATCH /api/tenants/{tenant}/materials/{id}` (`{ version, description?, type?, baseUnit?, active? }`; an `id` in the body is 400; 409 `BASE_UNIT_HAS_CONVERSIONS`, `BASE_UNIT_IN_USE` once a BOM references the material or while planning parameters or safety targets hold quantities in it, `MATERIAL_TYPE_IN_USE` for a type change once a BOM references it, and `MATERIAL_MADE_AT_LOCATIONS` for a change to raw while it is Make somewhere);
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
  - `GET /api/tenants/{tenant}/forecasts` (by material, location, then date; the optional `material` and `location` query parameters narrow it, and anything that is not an eight-digit ID is 400);
  - `POST /api/tenants/{tenant}/forecasts` (`{ material, location, date, quantity, unit? }`; 409 `FORECAST_EXISTS` for a second forecast on one day, 400 with a `unit` or `quantity` field error for a unit the material doesn't convert or a quantity that rounds to nothing or overflows);
  - `PATCH /api/tenants/{tenant}/forecasts/{material}/{location}/{date}` (`{ quantity, unit?, version }`; 404 `FORECAST_NOT_FOUND`, or `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` for an unknown or malformed ID in the path);
  - `DELETE /api/tenants/{tenant}/forecasts/{material}/{location}/{date}` (`{ version }`; the same 404 codes as `PATCH`).
- the BOMs of one tenant (spec `2026-10-20--0757UTC-boms`), with the same read and write rules. A BOM is addressed by its eight-digit ID, numbered per tenant; `priority` is a JSON integer (1 is the highest, up to 999); dates are `YYYY-MM-DD`, both included, and `validThrough` null means no end; each component line is `{ material, quantity, unit }` on input, its quantity a JSON **string** per one base unit of the output, and is returned as `{ material, quantity, enteredQuantity, enteredUnit, numerator, denominator }`, `quantity` in the component's base unit with six decimals. Field errors of a line are keyed by its path, `components.N.<field>`. A new BOM or line is 409 `MATERIAL_INACTIVE` for an inactive material and 404 `MATERIAL_NOT_FOUND` for an unknown one:
  - `GET /api/tenants/{tenant}/boms` (each with its current recipe; by output, priority, then ID);
  - `POST /api/tenants/{tenant}/boms` (`{ output, priority, validFrom, validThrough?, components }`; 400 with field errors for a raw output, a finished component, a repeated material or a line its conversion refuses; 409 `BOM_PRIORITY_CONFLICT`, `BOM_CYCLE`, `BOM_ID_RACE` or `BOM_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/boms/{id}` (with its `revisions`, newest first; 404 `BOM_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/boms/{id}` (`{ version, priority?, validFrom?, validThrough?, components?, active? }`, at least one besides `version`; `components` is the complete list; a real recipe change adds a revision, an identical one or a toggle doesn't; an `id` or `output` in the body is 400; 409 `BOM_PRIORITY_CONFLICT` or `BOM_CYCLE` as for `POST`, and `VERSION_CONFLICT` for a stale version or a revision saved at the same moment);
  - `GET /api/tenants/{tenant}/boms/{id}/revisions/{revision}` (404 `BOM_REVISION_NOT_FOUND`). Revisions never change.
- physical stock (spec `2026-10-20--1634UTC-stock-ledger-corrections`, D07): both roles can read and correct one tenant; decimal quantities are strings. UI `/admin/{tenant}/stock` accepts `?material={id}&location={id}`, help topic `stock`:
  - `GET /api/tenants/{tenant}/stock?material={id}&location={id}` returns a physical quantity in BUoM (zero for a missing pair) and up to 100 recent movements, with source, entered unit/factor, date and actor;
  - `POST /api/tenants/{tenant}/stock/corrections` takes `{ material, location, quantity, unit, reason }`, where `quantity` is a nonzero signed **change**, never a target balance; the date/source/actor/factor are server-owned. Returns the immutable movement with its before/after balance. Shared bearer/key/generation/read-only requirements apply;
  - 409 `INSUFFICIENT_STOCK` includes available/required quantities; 400 `QUANTITY_OUT_OF_RANGE` or `QUANTITY_ROUNDS_TO_ZERO`; 409 `MATERIAL_INACTIVE` / `LOCATION_INACTIVE`, 404 missing references;
  - any movement permanently locks both material type and BUoM (`MATERIAL_HAS_MOVEMENTS`, 409), even at zero stock. Nonzero stock blocks material/location deactivation (`STOCK_NOT_EMPTY`, 409 with the affected pair and quantity). Movements remain immutable; future reversals append history.
- the purchase requisitions and purchase orders of one tenant (spec `2026-10-20--1636UTC-purchase-requisitions-orders`). Unlike master data, **any** token may write them (not only the admin's); the other read and write rules are the same. Both are addressed by an eight-digit ID, numbered per tenant and per kind; both start `open`; neither changes stock. Quantities are JSON **strings**: on input in any unit the material converts (`{ quantity, unit }`), on output `quantity` in the material's base unit with six decimals plus `enteredQuantity`, `enteredUnit`, `numerator`, `denominator`; dates are `YYYY-MM-DD`. A new document is 409 `MATERIAL_INACTIVE`, `LOCATION_INACTIVE` or `SUPPLIER_INACTIVE` for an inactive master, and 404 `MATERIAL_NOT_FOUND`, `LOCATION_NOT_FOUND` or `SUPPLIER_NOT_FOUND` for an unknown one, the other tenant's included:
  - `GET /api/tenants/{tenant}/purchase-requisitions` (by ID; each with `converted`, `outstanding` and `status` `open` or `completed`);
  - `POST /api/tenants/{tenant}/purchase-requisitions` (`{ material, location, quantity, unit, requiredDate }`; 400 with field errors for a quantity or unit its conversion refuses; 409 `REQUISITION_ID_RACE` or `REQUISITION_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/purchase-requisitions/{id}` (404 `REQUISITION_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/purchase-requisitions/{id}` (`{ version, requiredDate }`; a `material`, `location`, `quantity` or `unit` in the body is 400; `VERSION_CONFLICT` for a stale version);
  - `GET /api/tenants/{tenant}/purchase-orders` (by ID; each with its `lines`, numbered from 1, each with `received`, `outstanding` (never negative) and `status` `open` or `completed`; an order is `open` or `completed`);
  - `POST /api/tenants/{tenant}/purchase-orders` (`{ supplier, location, lines: [{ material, quantity, unit, plannedDate, requisition?, location? }] }`, 1 to 100 lines. A line may name an Open `requisition` of its material and the order's location, which converts that much of it; a line `location` other than the order's is 400 on `lines.N.location`, a requisition of another material or location 400 on `lines.N.requisition`; field errors of a line are keyed by its path, `lines.N.<field>`. 404 `REQUISITION_NOT_FOUND`; 409 `REQUISITION_NOT_OPEN`, `REQUISITION_OVER_CONVERTED`, `ORDER_ID_RACE` or `ORDER_IDS_EXHAUSTED`);
  - `GET /api/tenants/{tenant}/purchase-orders/{id}` (404 `PURCHASE_ORDER_NOT_FOUND`);
  - `PATCH /api/tenants/{tenant}/purchase-orders/{id}` (`{ version, lines: [{ line, plannedDate }] }`, the planned dates of lines by their number, a number the order doesn't have is 400 on `lines.N.line`; a `supplier` or `location` in the body, or a line's `material`, `unit` or `quantity`, is 400 (until E09-S02 a line's extra fields were dropped); `VERSION_CONFLICT` for a stale version; 409 `PURCHASE_ORDER_NOT_OPEN` once the order is `completed`).
  - A material with an open order line can't be deactivated: `PATCH /api/tenants/{tenant}/materials/{id}` answers 409 `MATERIAL_IN_OPEN_ORDER`, naming the order, and a base-unit change once any requisition or order line holds a quantity of it is 409 `BASE_UNIT_IN_USE`.
- the goods receipts of one tenant (spec `2026-10-20--1933UTC-goods-receipts`). Any token may post them. A receipt is against one Open purchase order, has an eight-digit ID numbered per tenant, and never changes; posting it raises stock at the order's location, dated the server's UTC day, adds to each order line's `received` and completes the order once every line is received in full, all in one transaction or not at all:
  - `GET /api/tenants/{tenant}/goods-receipts` (newest first; `?purchaseOrder=00000001` keeps one order's, 404 `PURCHASE_ORDER_NOT_FOUND` for an order the tenant doesn't have). Each is `{ id, purchaseOrder, location, businessDate, createdAt, lines: [{ line, material, quantity, enteredQuantity, enteredUnit, numerator, denominator }] }`, `line` being the order line's number;
  - `POST /api/tenants/{tenant}/goods-receipts` (`{ purchaseOrder, lines: [{ line, quantity, unit, purchaseOrder? }] }`, 1 to 100 lines, each for a different order line; no date is taken). The posted receipt adds `warnings`, `[{ code: "OVER_RECEIPT", line, excess }]` for each line that received more than was outstanding: an excess is accepted. A line `purchaseOrder` other than the receipt's is 400 on `lines.N.purchaseOrder`, a line number the order doesn't have 400 on `lines.N.line`, a repeated one 400 on the repeat; 404 `PURCHASE_ORDER_NOT_FOUND`; 409 `PURCHASE_ORDER_NOT_OPEN`, `MATERIAL_INACTIVE`, `LOCATION_INACTIVE`, `RECEIPT_ID_RACE` or `RECEIPT_IDS_EXHAUSTED`; 400 on `lines.N.quantity` when the line's received total would not fit, and `QUANTITY_OUT_OF_RANGE` when the stock balance would not;
  - `GET /api/tenants/{tenant}/goods-receipts/{id}` (404 `GOODS_RECEIPT_NOT_FOUND`).
  - Each receipt line's stock movement has `type` `goods-receipt` and the receipt's internal UUID as its `postingId`.
- the master-data and BOM import (spec `2026-10-20--0908UTC-master-data-bom-import`). The workbook travels as **base64** in a JSON body, at most 512 KB once decoded:
  - `GET /api/import/template` (any signed-in account, bearer or session cookie): the `.xlsx` template, as an attachment;
  - `POST /api/tenants/{tenant}/import/dry-run` (`{ workbook }`, admin only): the `ImportReport` (`{ committed: false, previewToken, summary, rows, errors }`). Errors in the workbook are in `errors`, each `{ sheet, row, column, code, message, params? }`, not an error status; `previewToken` is set only when there are none. 400 `VALIDATION_FAILED` on `workbook` for a file that isn't base64, is over 512 KB, isn't a readable `.xlsx`, has more than 2,000 rows, unpacks past 20 MB or has sheets spanning more than 200,000 cells;
  - `POST /api/tenants/{tenant}/import/commit` (`{ workbook, previewToken }`, admin only): the same report with `committed: true`, every row applied, or nothing; 400 on a missing `previewToken`, 409 `IMPORT_STALE` when the re-run differs from the dry run (a record the rows name or write was edited, or the workbook differs).
  - The report's own codes are `IMPORT_EMPTY`, `IMPORT_UNKNOWN_SHEET`, `IMPORT_DUPLICATE_SHEET`, `IMPORT_MISSING_COLUMN`, `IMPORT_UNKNOWN_COLUMN`, `IMPORT_UNKNOWN_ID`, `IMPORT_DUPLICATE_KEY`, `IMPORT_MISSING_REFERENCE`, `IMPORT_NEW_RECORD_INACTIVE`, `IMPORT_REFERENCE_REQUIRED`, `IMPORT_BOM_WITHOUT_LINES` and `IMPORT_LINE_WITHOUT_HEADER`, beside the services' own codes.
  - **The workbook layout is protected too** (`core/src/domain/imports/workbook-layout.ts`): admins keep filled templates, so the sheet names, column headers and what each column means change only by adding (a new optional sheet or column). Renaming one needs the old name accepted for one release.

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
  - `GET /api/tenants/{tenant}/shipments` returns the shipments newest first; `?customerOrder=00000001` keeps one order's (404 `CUSTOMER_ORDER_NOT_FOUND`). Each is `{ id, customerOrder, customer, location, plannedDate, status, createdAt, lines: [{ line, orderLine, material, quantity, enteredQuantity, enteredUnit, numerator, denominator, issued, toIssue }] }`. `line` numbers the shipment's lines from 1, `orderLine` is the order line's stable ID, and `toIssue` is the smaller of the plan's remainder and the order line's outstanding.
  - `POST /api/tenants/{tenant}/shipments` takes `{ customerOrder, plannedDate, lines: [{ orderLine, quantity, unit, customerOrder? }] }`, with 1 to 100 lines, each for a different order line. Refusals:
    - 400 on a line field: `lines.N.customerOrder` for a line naming another order; `lines.N.orderLine` for an ID that isn't a visible line of the order; `lines.N.quantity` for more than the line's outstanding;
    - 404 `CUSTOMER_ORDER_NOT_FOUND`;
    - 409 `CUSTOMER_ORDER_NOT_OPEN`, `SHIPMENT_ID_RACE` or `SHIPMENT_IDS_EXHAUSTED`.
  - `GET /api/tenants/{tenant}/shipments/{id}` returns one shipment (404 `SHIPMENT_NOT_FOUND`).
  - `GET /api/tenants/{tenant}/goods-issues` returns the goods issues newest first; `?shipment=00000001` keeps one shipment's (404 `SHIPMENT_NOT_FOUND`). Each is `{ id, shipment, customerOrder, location, businessDate, createdAt, lines: [{ line, orderLine, material, quantity, enteredQuantity, enteredUnit, numerator, denominator }] }`.
  - `POST /api/tenants/{tenant}/goods-issues` takes `{ shipment, lines: [{ line, quantity, unit, shipment? }] }`, with 1 to 100 lines, each for a different shipment line. It takes no date: a sent date is dropped. Refusals:
    - 400 on a line field: `lines.N.shipment` for a line naming another shipment; `lines.N.line` for a line number the shipment doesn't have; `lines.N.quantity` for more than the line's `toIssue`, whatever the stock;
    - 404 `SHIPMENT_NOT_FOUND`;
    - 409 `SHIPMENT_NOT_OPEN`, `CUSTOMER_ORDER_NOT_OPEN`, `ISSUE_ID_RACE`, `ISSUE_IDS_EXHAUSTED` or `VERSION_CONFLICT`;
    - 409 `INSUFFICIENT_STOCK`, with `params` `{ material, location, available, requested, unit }`.
  - `GET /api/tenants/{tenant}/goods-issues/{id}` returns one goods issue (404 `GOODS_ISSUE_NOT_FOUND`).

**Versions.** An edit of a versioned record (today: a user, a material, a material's conversion, a location, a customer, a supplier, a planning parameter set, a safety-stock target, a forecast, a BOM, a purchase requisition and a purchase order) carries the `version` it loaded. A stale one is 409 `VERSION_CONFLICT`, and the newer change is kept. The user routes answer 404 `NOT_FOUND` for the built-in admin, an unknown id or a malformed one.

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

### 5. Commands used by CI, deploy and the docs

Source: root `package.json` scripts, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.ai/agentic.config.json`, `AGENTS.md`, `SDLC.md`.

**Breaking:** renaming or removing `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:coverage`, `test:integration`, `db:migrate` or `db:migration:create`. **Required path:** update every workflow, the config's `validation.commands`, `AGENTS.md` and `SDLC.md` in the same PR.

## Not protected

- **`@cpg/*` package exports.** The workspace packages are private, unpublished and consumed only inside this monorepo. Change them freely, but update every caller in the same PR (typecheck enforces it).
- **Domain event IDs** (`concept.entity.action`). They are in-process only, with no external subscribers. Revisit this if events ever leave the process (webhooks, a queue).
- **Internal file layout**, as long as `AGENTS.md` and the engineering standards stay accurate.

## Changing this document

Add a surface here in the same PR that creates it, for example the first `/api` route, the first webhook or the first exported file format.

Customer-order collection reads use optional `?page=1` (integer 1–1000000), fixed pages of 100 orders in ascending ID order. The data remains an array; request successive pages until fewer than 100 records are returned. Unknown query keys and invalid page values are validation errors.
