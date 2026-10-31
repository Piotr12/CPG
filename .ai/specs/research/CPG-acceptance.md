# CPG — Acceptance Test Catalogue

**Source:** AgntPad Notes / CPG  
**Original:** https://s-d3aa472a035945a58dddbd80d87d9328.agntpad.page/CPG/acceptance.html  
**Exported:** 2026-10-19  
**Status:** Partially executed (see Execution status)

## Execution status

The original export marked every scenario `Not executed`. Scenarios are updated as the stories that implement them ship:

- **Passed (automated)**: unit and/or integration tests assert the scenario, and they passed in CI on `main`. The **Evidence** line names them.
- **Partially verified**: only part of the scenario can be or is asserted today; the **Evidence** line says which part is missing and why.
- **Not executed**: not yet built or not yet checked.

Last updated 2026-10-31 for #284 (E18-S01): its tests move MRP-005, MRP-008, RUN-002, TEN-018, API-014, UX-010 and UX-021 to Passed (automated). Before that, 2026-10-27 for #274 (E14-S02): its tests move MRP-001, MRP-002, MRP-003, INV-008 and RUN-001 to Passed (automated), and MRP-008, RUN-002, RUN-021 and TEN-019 to Partially verified (the daily report screen is E18-S01, automatic runs E19-S03). Before that, the same day for #290 (E20-S01): its tests move UX-014 to Passed (automated). Before that, 2026-10-25 for #192: its tests move UX-009, API-031, AUD-022, E2E-006, E2E-013 and E2E-014 to Passed (automated), and UX-023 and UX-026 from Not executed to Partially verified (their MRP halves are #14). Before that, the same day for #191 (E10-S05): BOM-009, BOM-027, E2E-004 and LFC-015 move to Passed (automated), LFC-025 and LFC-027 to Partially verified (their non-MRP halves), and E2E-015 now waits only on MRP (#14). Before that, the same day for #190: TRF-012, E2E-009 and MAT-024 move from Partially verified to Passed (automated), with a 60/50/10 Close Early refusal in the service and on screen, a 60-planned transfer received 55 and written off 5 through the API and closed early on screen, and 0.123456 posted through the ledger; LFC-012 gains the 409 with its material, location and quantity, through the API and the Deactivate dialog, and STX-011 the Stock import screen's dry run. Before that, the same day for #240: the D08 netting tests move DEM-002…013 from Not executed to Partially verified; each still needs MRP's run (#14). Before that, 2026-10-24 for #200: E2E-020's test now owns both Test generations within one UTC day, and the tiny dataset's unissued shipment is checked on every day of 2025–2027; its status is unchanged. Before that, the same day for E09-S05 (#186): its tests move E2E-017 to Passed (automated) and add evidence to LFC-013. Before that, 2026-10-23 for the second slice 2 closing pass, against `main` at `db50cf07`: the slice 2 rows were rechecked against the tests that PRs #156 (#140), #159 (#142), #161 (#141), #170 (#168), #174 (#153), #177 (#152), #178 (#144), #179 (#138), #181 (#145) and #182 (#147) added. TEN-009, MAT-009, MAT-029, INV-023, LFC-019, API-034, AUD-001 and UX-025 move to Passed (automated), their whole Then now asserted; TRF-012 and BUY-017 go back to Partially verified (no test closes a transfer with 10 of 60 in transit after 50 received; BUY-017's scheduled supply is MRP, #14); SAL-015, E2E-004, E2E-006, E2E-009, E2E-013, E2E-017, E2E-018 and E2E-020 move from Not executed to Partially verified; REV-001, REV-010, SAL-008, SAL-018, AUD-002 and AUD-025 gain the #144 and #147 evidence, and the stale notes of TEN-001, TEN-025, TEN-029, MAT-006, MAT-024, INV-007, DEM-016 and E2E-015 are corrected. The gaps found are filed as #185–#192 and named in each row. Before that, the same day for E11-S04 (#144), against `main` at `8195a0b`: its tests moved LFC-004 and BUY-017 to Passed (automated) (their MRP halves are slice 3, #14) and added evidence to PRD-029. Before that, the same day for E13-S05 (#152), against `main` at `8adea42`: more evidence for AUD-004 and UX-010, whose status is unchanged. Before that, 2026-10-21 for E10-S03 (#143), against `main` at `1882d6a`, whose tests moved LFC-022, BOM-026, BOM-028, BOM-029, UX-013 and E2E-011 to Passed (automated). Before that, the same day: epics E07 (#73), E08 (#74), E09 (#75), E10 (#76), E11 (#77) and E13 (#79), against `main` at `d2300ef` (PRs #102, #104, #107, #108, #109, #111, #112, #114, #118, #119, #120, #123, #125, #130, #133, #135); the gaps found are filed as #139–#145, and #139 (PR #151) closes LFC-018, STX-006 and STX-018. Earlier: epic E05 (#13) against `2a2976a` (PR #99 for E05-S01), plus the tests and the workbook cell limit added with that update; epic E04 (#12) against `082f2d5`; epic E03 (#11) against `3f553a5`, and the E02 end-to-end follow-up (#67); epic E02 (#10) against `3e46bf8`, with its AUD-008 end-to-end test; epic E01 (#9) against `9ea5973`, and its end-to-end follow-up (#52).

This document contains the complete acceptance catalogue for the CPG MVP. Each test preserves its ID, title, priority, execution channel, and Given / When / Then criteria.

## Tenant isolation, users & read-only operation

### TEN-001 — Two tenants at initialization

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenants.test.ts` (the chooser offers Test and Prod), `tests/integration/materials.test.ts`, `named-records.test.ts`, `materials-api.test.ts` and `named-records-api.test.ts`, `planning-parameters.test.ts` and `planning-parameters-api.test.ts`, `boms.test.ts` and `boms-api.test.ts` (Test starts with the generated dataset's records, its 16 BOMs included), `packages/core/src/demo-data.test.ts` (the startup seed fills Test with the generated tiny dataset, BOMs, customer orders and stock movements included, and Prod with nothing), `packages/core/src/services/demo/seed-demo-data.test.ts` (every kind's count). Prod being empty on a fresh install is asserted by that unit test only: the integration files share one app. E02-S01, #19, with #26.
- **Given:** Fresh CPG runtime with valid administrator password
- **When:** Inspect tenant selection and data
- **Then:** Test contains demonstration business records; Prod contains none; both tenants selectable.

### TEN-002 — No administrator password prevents startup

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/startup-guard.test.ts` (the production image exits non-zero without `CPG_ADMIN_PASSWORD`); `packages/core/src/config.test.ts`, `packages/app/src/instrumentation.test.ts`, `packages/core/src/services/auth/auth.service.test.ts` (no session without a configured password). E01-S01, PR #29.
- **Given:** Admin password runtime value absent
- **When:** Start application
- **Then:** App refuses to start; no usable authentication session is established.

### TEN-003 — Single administrator exists

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/auth/auth.service.test.ts` (one admin row, even when two first sign-ins race) and `packages/core/src/services/users/user.service.test.ts` (`admin` is reserved; only `role: user` accounts are created); `tests/integration/auth.test.ts`, `tests/integration/users.test.ts`. No end-to-end test tries to create a second admin. E01-S01, PR #29.
- **Given:** Running app with built-in admin
- **When:** Inspect/manage account roles
- **Then:** Exactly one administrator account exists; no action creates another admin.

### TEN-004 — Normal user creation

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** Creation and sign-in: `tests/integration/users.test.ts`, `packages/core/src/services/users/user.service.test.ts`. The normal user is refused every admin-only operation (`tests/integration/api-tokens.test.ts`, `packages/core/src/http/auth.test.ts`) and every master-data write: through the UI (`tests/integration/materials.test.ts`, `named-records.test.ts`, `planning-parameters.test.ts` and `boms.test.ts` show no controls; every master's `actions.test.ts`, BOMs included, refuses all its writes), and through the API, end to end for a write of each master (`tests/integration/materials-api.test.ts`, `named-records-api.test.ts`, `planning-parameters-api.test.ts`, `boms-api.test.ts`) and for every write in the routes' `route.test.ts` files, while still reading. The import too: `tests/integration/import.test.ts` (no Import entry; the screen sends a normal user away) and `tests/integration/import-api.test.ts` (their token's dry run is 403). Forecasts: `tests/integration/forecasts-api.test.ts` (a normal user's token reads forecasts but can't change them), `tests/integration/forecasts.test.ts` (no controls). E01-S02, PR #34, with #22, #23, #24, #26 and #27; E08-S03, #85.
- **Given:** Administrator logged in
- **When:** Create normal user with initial password
- **Then:** New active normal user can sign in with specified password and has no master-data edit permission.

### TEN-005 — Users cannot change passwords

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** UI: `tests/integration/users.test.ts` (a normal user has no password control). API: the only password route is admin-only: `tests/integration/api-users.test.ts` (a normal user's token gets 403, for their own id too), `packages/app/src/app/api/users/[id]/password/route.test.ts`. E01-S02, PR #34; #52.
- **Given:** Normal user signed in
- **When:** Inspect profile and try an equivalent API mutation
- **Then:** No self-service password-change action is available through UI or API.

### TEN-006 — Admin resets user password

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/users.test.ts` (both sessions end; old password refused, new one works), `tests/integration/api-tokens.test.ts` (tokens end), `tests/integration/api-users.test.ts` (the same reset through `PUT /api/users/{id}/password`: session and token end, only the new password works), `packages/core/src/services/users/user.service.test.ts`, `packages/core/src/services/auth/auth.service.test.ts` (a sign-in racing the reset keeps no session). E01-S02/S03, PRs #34, #41; #52.
- **Given:** Normal user has active sessions and API tokens
- **When:** Admin resets that user's password
- **Then:** Previous sessions and tokens are invalid immediately; new password permits fresh login.

### TEN-007 — Admin deactivates user

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/users.test.ts` (two sessions end, sign-in refused), `tests/integration/api-tokens.test.ts` (tokens end), `tests/integration/api-idempotency.test.ts` (deactivation through the API), `packages/core/src/services/users/user.service.test.ts`. E01-S02/S03, PRs #34, #41.
- **Given:** Normal user has two active sessions and three tokens
- **When:** Admin marks account inactive
- **Then:** Every session and token loses access immediately; new login is rejected.

### TEN-008 — Users never hard-deleted

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/users.test.ts` (no Delete; the screen says accounts are never deleted), `tests/integration/api-users.test.ts` (`DELETE /api/users/{id}` answers 405, even to the admin's token), `packages/app/src/app/api/users/[id]/route.test.ts` (no DELETE handler), `tests/integration/audit.test.ts` (the audit keeps naming the account). E01-S02, PR #34; #52.
- **Given:** Existing normal account with history
- **When:** Admin requests account removal
- **Then:** Account is not hard-deleted; deactivation remains available and historical attribution persists.

### TEN-009 — Shared sessions permitted

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/users.test.ts` (:96: alice signs in from two browsers, and the first stays signed in and working after the second), `packages/core/src/services/auth/auth.service.test.ts` (:166: two sign-ins give two different session tokens, both stored, until a password reset ends both). E01-S02, PR #34.
- **Given:** One active normal account
- **When:** Log in simultaneously from two different clients with same credentials
- **Then:** Both sessions remain valid and functional, with independent session identifiers.

### TEN-010 — All active users access both tenants

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenants.test.ts` (Test to Prod and back, no other step), `tests/integration/navigation.test.ts` (the switch on the same screen and back, and a normal user switching Prod to Test and back in the sidebar at 1280 px and from the mobile top bar), `tests/integration/users.test.ts` (a normal user opens both tenants), `packages/app/src/app/admin/[tenant]/page.test.tsx` (`requireUser`, not `requireAdmin`). E02-S01, #19.
- **Given:** Normal user signed in
- **When:** Switch from Test to Prod and back
- **Then:** Each tenant can be selected; no extra role assignment is required.

### TEN-011 — Tenant clearly identified

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/navigation.test.ts` (the header row names TEST or PROD on tenant pages and GLOBAL elsewhere), `tests/integration/tenants.test.ts` (Test's header, title and generation), `packages/app/src/components/tenants/tenant-header.test.tsx`. E02-S01, #19; the indicator is the #58 header row and switch.
- **Given:** Normal user viewing any business-data screen
- **When:** Inspect selected tenant indicator
- **Then:** Test/Prod indicator makes current data scope unambiguous before entry or posting.

### TEN-012 — Same material ID across tenants

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenant-isolation-api.test.ts` (00000001 in both tenants with different descriptions, each read as its own record through the API and on its material page; a material and a location created in Test are absent from Prod), `tests/integration/materials.test.ts` (a material created in Test is absent from Prod on the screens, and one created in Prod from Test), `packages/core/src/services/materials/material.service.test.ts` and `packages/core/src/services/named-records/named-records.test.ts` (the same ID in both tenants, each read and changed in its own), `tests/integration/navigation.test.ts` (a record's page switches to the other tenant's list, never to a record of the same ID). E02-S01, #19, with #22 and #23.
- **Given:** Material 00000001 exists in both tenants with different descriptions
- **When:** Read material in each tenant
- **Then:** Correct tenant-local record is returned in each; no cross-tenant matching or update.

### TEN-013 — Tenant-specific stock isolation

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (with equal IDs, +7 in Test reads 7.000000 there and 0.000000 in Prod, with no Prod audit), `tests/tenant-ownership.test.ts`. E07-S01, #80.
- **Given:** Material and location IDs coincide across two tenants
- **When:** Post +7 in Test
- **Then:** Prod stock balance remains unchanged; Test increases by 7.

### TEN-014 — Cross-tenant reference rejected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** Data layer: `packages/db/src/tenants/tenant-isolation.test.ts` (a reference to another tenant's record is rejected and nothing is written). Services: the material and named-record service tests, `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts` and `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts` (a set or target naming a material or location that exists only in the other tenant is refused, writing nothing in either), and `packages/core/src/services/boms/bom.service.test.ts` (a Test BOM naming a Prod-only material as output or component is `MATERIAL_NOT_FOUND` while Test has materials of its own, writing nothing in either tenant; a Prod BOM is `BOM_NOT_FOUND` from Test). End to end: `tests/integration/named-records-api.test.ts` (a Prod-only location, customer or supplier is not found from Test, to read or change), `tests/integration/planning-parameters-api.test.ts` (a Test set or target naming a Prod-only material or location is 404 and stores nothing) and `tests/integration/boms-api.test.ts` (a Test BOM naming a Prod-only material is 404 and Test's BOMs are unchanged; a Prod-only BOM is not found from Test, to read or change). Business documents: `packages/core/src/services/customer-orders/customer-order.service.test.ts` (a Test order naming a Prod-only customer, location or material is not found and writes nothing), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` and `packages/core/src/services/purchase-requisitions/purchase-requisition.service.test.ts` (another tenant's supplier, requisition, material or location is not found), `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (another tenant's PO or receipt is not found), `packages/core/src/services/production-orders/production-completion.service.test.ts` (another tenant's production order is not found; numbering is per tenant), `packages/core/src/services/stock/stock.service.test.ts`, `packages/core/src/services/transfers/transfer.service.test.ts`; end to end, `tests/integration/customer-orders.test.ts` (a Prod order is 404 from Test), `tests/integration/purchasing-api.test.ts` (another tenant's requisition or order is not found), `tests/integration/goods-receipts-api.test.ts` (404 `GOODS_RECEIPT_NOT_FOUND`), `tests/integration/production-orders.test.ts` (a Test order naming a Prod-only material is 404), `tests/integration/forecasts-api.test.ts` (a Prod-only material is not found from Test), `tests/integration/stock.test.ts` (a Test correction or read naming Prod-only references is 404; Prod unchanged) and `tests/integration/transfers-api.test.ts` (a Test transfer naming a Prod-only location is not found; nothing written). The import: `packages/core/src/services/imports/import.service.test.ts` (a Test planning row naming a location or material that exists only in Prod is `IMPORT_MISSING_REFERENCE`, and neither tenant's audit changes). E02-S01, #19, with #23, #24, #26 and #27; E07-S01, #80; E07-S03, #82; E08-S01, #83; E08-S03, #85; E09-S01/S02, #86, #87; E10-S01/S02, #88, #89.
- **Given:** A Test document tries to reference a Prod material ID with no Test equivalent
- **When:** Validate/create record
- **Then:** Reference is not resolved across tenants and the operation fails without writes.

### TEN-015 — Tenant read-only blocks normal writes

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** The gate doesn't look at the role: `packages/core/src/http/tenant-server-action.test.ts` refuses a normal user's write to a read-only tenant with `TENANT_READ_ONLY` and runs nothing, and `tests/integration/read-only.test.ts` shows the read-only explanation on a refused screen write (the admin's). A normal user's business writes are refused end to end: `tests/integration/customer-orders.test.ts` (an order create in read-only Prod shows the read-only alert; both roles' tokens get `TENANT_READ_ONLY`; orders and audit unchanged), `tests/integration/stock.test.ts` (a correction from a form opened before read-only is refused with the explanation; nothing stored), `tests/integration/goods-receipts-api.test.ts` (a receipt is 409 `TENANT_READ_ONLY`; no receipt, no movement), `tests/integration/production-orders.test.ts` and `tests/integration/production-completions.test.ts` (create, edit and completion are 409; no write buttons). E02-S04, #25; E07-S01, #80; E08-S01, #83; E09-S02, #87; E10-S01/S02, #88, #89.
- **Given:** Prod set read-only by admin
- **When:** Normal user attempts order creation
- **Then:** No document or audit business mutation posts; clear read-only explanation.

### TEN-016 — Read-only also blocks administrator

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (the admin token's update of a Test material while Test is read-only is 409 `TENANT_READ_ONLY`, and the stored description and version remain; in read-only Prod, a location rename and deactivation, a material deactivation, a conversion change, and a BOM create, recipe change and deactivation are refused too, and the stored values remain), `tests/integration/read-only.test.ts` (on the screens, the admin's Create material from a page loaded before the flag is refused with the explanation, and nothing is stored), `packages/core/src/http/tenant-server-action.test.ts`. E02-S04, #25, with #26.
- **Given:** Test set read-only
- **When:** Admin attempts master-data update
- **Then:** Update is blocked despite admin role; previously stored values remain.

### TEN-017 — Read-only covers API writes

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (an admin token's material create, edit and deactivation in read-only Prod, a location create, rename and deactivation, a customer and a supplier create, a conversion add, change and remove, and a BOM create, recipe change and deactivation all answer 409 `TENANT_READ_ONLY` with nothing changed), `packages/core/src/services/idempotency/idempotency.service.test.ts` (no key is stored). The gate covers every tenant write route (`tests/api-writes.test.ts`), and the scenario's goods issue is refused end to end: `tests/integration/shipments-api.test.ts` (a keyed goods issue in read-only Prod is 409 `TENANT_READ_ONLY`; no issue, stock 100, fulfilled 0). `tests/integration/import-api.test.ts` (an import dry run and commit in read-only Prod are 409 `TENANT_READ_ONLY`, creating nothing). `tests/integration/stock.test.ts` (admin and normal-user token corrections in read-only Prod are `TENANT_READ_ONLY`; no movement), `tests/integration/stock-import-api.test.ts` (a stock-import dry run and commit are refused). E02-S04, #25, with #26 and #27; E07-S01/S02, #80, #81; E08-S02, #84.
- **Given:** Prod read-only
- **When:** API attempts goods issue with otherwise valid token and idempotency key
- **Then:** Request is rejected; no inventory movement or order change is created.

### TEN-018 — Read-only allows reads

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (materials and the tenant audit read through the API for the admin and a normal user), `tests/integration/read-only.test.ts` (the screens). `tests/integration/stock.test.ts` (the stock page and API read work while Prod is read-only), `tests/integration/stock-report.test.ts`, `tests/integration/stock-report-api.test.ts`, `tests/integration/variance-report.test.ts` and `tests/integration/variance-report-api.test.ts` (a normal user opens the stock and variance reports in the UI and the API while Prod is read-only). `tests/integration/mrp-report.test.ts` and `tests/integration/mrp-report-api.test.ts` (a normal user reads the last MRP run's report in the UI and the API while Prod is read-only and has a run). E02-S04, #25; E07-S01, #80; E13-S01/S02, #94, #95; E18-S01, #284.
- **Given:** Test read-only with records and last MRP run
- **When:** Normal user opens inventory, MRP report and audit
- **Then:** All read-only views still work.

### TEN-019 — Read-only blocks new MRP

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The manual half, as RUN-021: `tests/integration/mrp-run-api.test.ts`, `tests/integration/mrp-run.test.ts` and `packages/core/src/services/mrp/mrp-run-gate.test.ts` refuse a run in a read-only tenant, store no run or result, and keep the earlier run readable. Automatic runs and proposed documents are E19-S03. E14-S02, #274.

- **Given:** Test set read-only with existing results
- **When:** Request a new manual or automatic MRP run
- **Then:** No new MRP results or proposed documents persist; old report remains available.

### TEN-020 — Global account operations during tenant read-only

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts`: with both tenants read-only, the admin creates a user, a normal user changes their theme, creates an API token on the tokens screen and revokes it. E02-S04, #25.
- **Given:** Both business tenants read-only
- **When:** Admin creates user; user changes theme and creates own API token
- **Then:** Global allowed operations succeed without writing tenant business records.

### TEN-021 — Read-only flags independent

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (Test writes while Prod is read-only), `tests/integration/read-only.test.ts` (Test keeps Create material), `packages/core/src/services/tenants/tenant.service.test.ts`. E02-S04, #25.
- **Given:** Test and Prod both available
- **When:** Set Test read-only, inspect Prod and try Prod transaction
- **Then:** Prod remains in its previous write state and can be modified if previously writable.

### TEN-022 — Test reset when previously writable

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset.test.ts` and `test-reset-api.test.ts` reset writable Test; `packages/core/src/services/tenants/test-reset.service.test.ts` verifies every current demo kind, an empty Test audit, the new generation and preservation of global/Prod values. #93.
- **Given:** Admin with Test writable and populated
- **When:** Reset Test dataset
- **Then:** Old Test business records and Test audit vanish; freshly seeded Test has a new dataset generation, all Test-local business ID sequences restart at 00000001, prior read-only state restored and Prod unchanged.

### TEN-023 — Test reset when previously read-only

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** The Polish/dark narrow-screen UI reset in `tests/integration/test-reset.test.ts`, the read-only case in `test-reset-api.test.ts`, and the real SQLite service tests restore the original read-only flag. #93.
- **Given:** Test was manually marked read-only
- **When:** Admin resets Test
- **Then:** Test regenerated with fresh dataset generation and restarted ID sequences; prior read-only remains enabled and Prod untouched.

### TEN-024 — Test reset preserves global identities

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts` retains two accounts, live browser sessions, usable tokens and preferences. `packages/core/src/services/tenants/test-reset.service.test.ts` compares every stored column of those global rows before/after. #93.
- **Given:** Two user accounts and API tokens with sessions exist
- **When:** Admin resets Test
- **Then:** Users, active sessions, tokens, preferences and Global audit survive unchanged.

### TEN-025 — Test reset excludes Prod

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/tenants/test-reset.service.test.ts` gives Prod a customer order, a stock correction, a transfer dispatched into transit and a purchase order received in part, then compares every stored Prod row of every table before and after a reset (balances, ledger, transfer postings and audit included; each is checked to be non-empty), with Test and Prod both writable and both read-only; Prod's tenant row, read-only flag included, is unchanged. `tests/integration/test-reset-api.test.ts` gives Prod stock, a dispatched transfer and an open purchase order, then compares the first page of every Prod list, that transfer and order, the stock ledger at both locations, the latest Prod audit page and Prod's metadata (its read-only flag included, with Prod writable and read-only) before and after each reset. The deletion footprint is generic and excludes global/Prod data (`tests/test-reset-coverage.test.ts`). #93, #189.
- **Given:** Prod contains customer orders, stock and immutable audit
- **When:** Admin resets Test
- **Then:** All Prod records, balances, audit and read-only state remain identical.

### TEN-026 — Reset concurrent write safety

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/tenants/test-reset.service.test.ts` runs the reset and a write on two real SQLite connections. A write that commits after the reset's transaction has read the generation makes the reset retry once and remove it. This holds both for a direct (UI) reset, through the service's own retry, and for an API reset, through `IdempotencyService.run`'s retry. A write from a snapshot older than a committed reset is refused, and its retry is stale. With Test really read-only, a write made through the API's own gate (`IdempotencyService.run`) while the reset's transaction is still uncommitted is refused `TENANT_READ_ONLY`, and after the commit `GENERATION_STALE`. Nothing it sent is in the new generation, and Test stays read-only. #93, #189.
- **Given:** One session preparing Test update and admin resets Test
- **When:** Attempt write during reset while read-only gate active
- **Then:** Update is blocked or safely completed before reset; no partial demo data leaks into regenerated dataset.

### TEN-027 — Reset failure atomicity

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/tenants/test-reset.service.test.ts` injects middle-seed failures, a partial seed and a receipt-insert failure, then compares the complete database snapshot, including both tenant flags and audits. #93.
- **Given:** Test has valid pre-reset data; reset fails mid-work
- **When:** Trigger Test regeneration fault
- **Then:** Old consistent dataset remains, original read-only setting restored and Prod not affected.

### TEN-028 — Global audit reset survival

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** Repeated API resets in `tests/integration/test-reset-api.test.ts` retain prior Global events and add the admin reset event. Real SQLite service tests preserve every prior Global event and check the new actor/session event. #93.
- **Given:** Global admin actions already audited
- **When:** Reset Test repeatedly
- **Then:** Global audit retains old admin events and contains a new reset event.

### TEN-029 — Test reset restarts all business ID counters

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/tenants/test-reset.service.test.ts` resets two years of realistic data, plus one more material, location, customer, supplier, BOM and requisition and two transfers, to the tiny dataset. Every tenant-owned table with a business ID (all 14 sequenced kinds, found from the metadata) then holds exactly 00000001…N for the dataset's N, below what the old generation reached, and the first new transfer is 00000001. Prod's next material and purchase order continue at 00000002. `tests/integration/test-reset-api.test.ts` checks after each real reset that a customer order added before it is 404, and that the IDs of every listed kind, and the completions of every production order, run 00000001…N without a gap. The next material after the demo rows is 00000027 and the first transfer is 00000001. #93, #189.
- **Given:** Test had material 00000047 and several documents before reset
- **When:** Administrator performs full Test reset
- **Then:** New Test generation starts all auto-generated business sequences afresh. Seeded demonstration materials receive initial IDs beginning 00000001, followed by subsequent IDs; Prod and global identities do not restart.

### TEN-030 — Old Test generation mutation is rejected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts` retries an old-generation edit with its used key and a new key after a real reset; `test-reset.test.ts` refuses a stale UI form against a reused ID. The reset/idempotency unit tests also cover an expired key and missing/stale generation precedence. #93, with the foundation tests of #21.
- **Given:** Client prepared an API write with dataset-generation G1 and material 00000001; reset created G2 with same ID assigned to another material
- **When:** Client retries stale G1 API mutation
- **Then:** HTTP 409/428 precondition failure, no G2 record touched, even with previously used or expired idempotency key.

## Material master data, unit conversions & planning parameters

### MAT-001 — Sequential first material ID

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (the first create in an empty tenant is 00000001), `packages/core/src/domain/materials/material-code.test.ts`, `tests/integration/materials.test.ts`, `tests/integration/materials-api.test.ts`. E03-S01, #22.
- **Given:** Empty Prod tenant
- **When:** Admin creates first material
- **Then:** Material ID is 00000001.

### MAT-002 — Sequential next IDs

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (00000001, 00000002, … and never reused), `material-code.test.ts`, `tests/integration/materials.test.ts` and `materials-api.test.ts` (consecutive IDs). E03-S01, #22.
- **Given:** Two materials already created
- **When:** Admin creates third material
- **Then:** New ID has eight digits and follows prior sequence without reuse.

### MAT-003 — Tenant-local sequence

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (Prod numbers independently of Test), `tests/integration/materials.test.ts`. E03-S01, #22.
- **Given:** Prod has assigned 00000001; Test contains independent materials
- **When:** Create next material in Prod
- **Then:** Numbering follows Prod only, independent of Test numbering.

### MAT-004 — ID cannot be edited

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/materials/material-update.schema.test.ts` (an `id` in the changes is refused), `packages/core/src/services/materials/material.service.test.ts` (the ID never changes), the materials `[id]/route.test.ts` and `actions.test.ts`, `tests/integration/materials-api.test.ts` (a `PATCH` with an `id` is 400 and the ID stays). E03-S01, #22.
- **Given:** Existing material has stock or no stock
- **When:** Attempt change material ID
- **Then:** Edit not allowed; original immutable ID remains.

### MAT-005 — Type required

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/materials/material-fields.schema.test.ts` and `material-create.schema.test.ts`, the materials `route.test.ts`, `create-material-dialog.test.tsx` (a material without a type is refused). E03-S01, #22.
- **Given:** Create material without type
- **When:** Submit through UI or API
- **Then:** Validation identifies material type as mandatory; no material created.

### MAT-006 — Three allowed types

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `material-fields.schema.test.ts` (raw, intermediate and finished are accepted), `packages/core/src/domain/demo/test-tenant-config.schema.test.ts` (the demo catalogue holds 12 raw, 4 intermediate and 10 finished materials, and the schema checks its count per type), `packages/core/src/services/materials/material.service.test.ts`. E03-S01, #22.
- **Given:** Create raw, intermediate and finished materials
- **When:** Save and inspect
- **Then:** All three documented types accepted and retained accurately.

### MAT-007 — Invalid material type

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `material-fields.schema.test.ts` (any other type is refused with one fixed message; the route answers `VALIDATION_FAILED`), the create route and dialog tests, `tests/integration/materials-api.test.ts` (an unknown type is refused through the API). E03-S01, #22.
- **Given:** New material with unrecognized type
- **When:** Validate creation
- **Then:** Rejected with descriptive type validation; no record created.

### MAT-008 — Description and BUoM mandatory

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `material-fields.schema.test.ts`, `material-create.schema.test.ts`, the materials `route.test.ts`, `create-material-dialog.test.tsx`, `tests/integration/materials.test.ts` (the field error) and `materials-api.test.ts` (every missing field named). E03-S01, #22.
- **Given:** New material missing description or BUoM
- **When:** Attempt save
- **Then:** Missing required fields are identified; no partial record inserted.

### MAT-009 — BUoM can change before transactional use

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts`: the base unit changes on an unreferenced material, also while a BOM exists in the tenant. It is refused while the material has conversions (`BASE_UNIT_HAS_CONVERSIONS`), planning parameters or safety-stock targets (`BASE_UNIT_IN_USE`, #24), or once a BOM uses it (`BASE_UNIT_IN_USE` naming the BOM, ahead of the conversions check, #26). Documents (`BASE_UNIT_IN_USE`): `packages/core/src/services/purchase-orders/purchase-order.service.test.ts`, `goods-receipt.service.test.ts`, `customer-order.service.test.ts`, `production-order.service.test.ts`, `transfer.service.test.ts`, `tests/integration/goods-receipts-api.test.ts`, `tests/integration/forecasts-api.test.ts`. Stock movements (`MATERIAL_HAS_MOVEMENTS`, also once the balance is back at zero): `packages/core/src/services/stock/stock.service.test.ts` (:128), `tests/integration/stock.test.ts` (:150). E03-S01, #22; E04-S01, #26; E07-S01/S03, #80, #82; E08-S01/S03, #83, #85; E09-S01/S02, #86, #87; E10-S01, #88.
- **Given:** Material has no BOM revision reference, operational document reference or inventory movement
- **When:** Admin changes base UoM
- **Then:** BUoM can change, with conversion consistency verified; after any listed reference the same change is rejected.

### MAT-010 — BUoM locked after posted stock movement

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (after any movement a base-unit change is `MATERIAL_HAS_MOVEMENTS`, even at zero stock), `packages/core/src/services/materials/material.service.test.ts`. E04-S01, #26; E07-S01, #80.
- **Given:** Material appears in a posted inventory movement
- **When:** Admin attempts base UoM change
- **Then:** BUoM change rejected and past quantities unaffected; same lock already applies at BOM or operational document reference.

### MAT-011 — Type locked when BOM references

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (a type change of a BOM's output or component is `MATERIAL_TYPE_IN_USE` naming the BOM, also when the only reference is an old revision of an inactive BOM, and ahead of `MATERIAL_MADE_AT_LOCATIONS`), `packages/core/src/services/boms/bom-usage.test.ts`, `tests/integration/boms-api.test.ts` (a used output's type change is 409 `MATERIAL_TYPE_IN_USE`), `tests/integration/boms.test.ts` (after its BOM is deactivated, the output's Edit refuses a type change with the lock message). E04-S01, #26.
- **Given:** Material referenced by an active or historic BOM
- **When:** Attempt material type change
- **Then:** Reject edit, preserving historical component/output semantics.

### MAT-012 — Type locked after transaction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (a type change after a movement is `MATERIAL_HAS_MOVEMENTS`), `packages/core/src/services/customer-orders/customer-order.service.test.ts` (`MATERIAL_TYPE_IN_USE` for an ordered material), `packages/core/src/services/production-orders/production-order.service.test.ts` ("locks the type of a material a completion consumed": `MATERIAL_HAS_MOVEMENTS`, the type stays raw; an order's output is `MATERIAL_TYPE_IN_USE`). E07-S01, #80; E08-S01, #83; E10-S01/S02, #88, #89.
- **Given:** Material referenced by an order or posting
- **When:** Attempt change raw to intermediate
- **Then:** Change blocked; existing type retained.

### MAT-013 — Type editable while unused

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (type and base-unit edits on an unused material, audited with before and after, also while a BOM exists in the tenant). A material that a BOM or a Make planning-parameter set uses is locked instead (MAT-011, MAT-014). E03-S01, #22; E04-S01, #26.
- **Given:** Material has no BOM references or transactions
- **When:** Admin changes type within supported set
- **Then:** Updated type stored and audited.

### MAT-014 — Raw material Buy-only

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/planning-parameters/procurement.test.ts`, `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts` (Make refused for raw at any location), `packages/core/src/services/materials/material.service.test.ts` (a material made somewhere can't become raw, `MATERIAL_MADE_AT_LOCATIONS`), `add-planning-parameters-dialog.test.tsx`, `tests/integration/planning-parameters.test.ts` and `planning-parameters-api.test.ts`. E03-S03, #24.
- **Given:** Raw material assigned at one location
- **When:** Admin tries to set procurement mode Make
- **Then:** Rule rejects Make for raw material.

### MAT-015 — Intermediate Make or Buy

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `procurement.test.ts`, `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts` (Make at one location and Buy at another), the planning-parameters `page.test.tsx`, `tests/integration/planning-parameters.test.ts` and `planning-parameters-api.test.ts`. E03-S03, #24.
- **Given:** Intermediate material defined at two locations
- **When:** Set one Make and another Buy
- **Then:** Both site-specific modes saved independently.

### MAT-016 — Site planning parameters present

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** Stored and read back per material and location: `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts`, the planning-parameters route, schema and page tests, `tests/integration/planning-parameters.test.ts` and `planning-parameters-api.test.ts`. MRP reading them is slice 3. E03-S03, #24.
- **Given:** Material-location pair with valid Make/Buy, days, minimum, lot multiple
- **When:** Save and use in MRP
- **Then:** MRP reads the parameters for that exact site/material combination.

### MAT-017 — Missing parameters explicit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material demand at a site with absent Make/Buy
- **When:** Run MRP
- **Then:** Missing Planning Parameters exception; no guessed supply document for affected material.

### MAT-018 — Calendar-day lead time

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The lead time is stored in whole calendar days, 0–999 (`planning-parameter-fields.schema.test.ts`, the planning-parameters `route.test.ts`). An order's planned start is its finish minus those calendar days: `packages/core/src/domain/production-orders/production-planning.test.ts`, `packages/core/src/services/production-orders/production-order.service.test.ts`. Back-scheduling in MRP is slice 3. E03-S03, #24; E10-S01, #88.
- **Given:** Planning lead time 7 whole days
- **When:** MRP computes need on October 15
- **Then:** Back-scheduled start uses October 8, not seven business days earlier.

### MAT-019 — Convert case to each at input

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/quantities/decimal.test.ts` (2 × 12/1 = 24), `packages/core/src/services/materials/base-quantity.test.ts` and `packages/core/src/services/materials/material.service.test.ts` (24 each with the entered 2 case and its factor), the materials `conversions-table`, `add-conversion-dialog` and `labels` tests, `tests/integration/materials.test.ts` (1 case = 12 each shown). Stored on a BOM line: `packages/core/src/services/boms/bom.service.test.ts` (2 case is stored as 24.000000 each with entered quantity 2, unit case and factor 12/1, and the audit entry reads "24.000000 each (2 case)"), `tests/integration/boms-api.test.ts` (the same through `POST /boms`), `tests/integration/boms.test.ts` (demo BOM 00000003 shows 24 each, entered as "2 case at 1 case = 12 each"), `packages/app/src/app/admin/[tenant]/boms/[id]/page.test.tsx` and `packages/app/src/components/boms/labels.test.ts` (the Entered as text). On a stock movement: `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (2 case is +24.000000 each, with the entered 2 case and factor 12/1 kept after a later conversion edit). E03-S01, #22; E04-S01, #26; E07-S01, #80.
- **Given:** BUoM each, factor 1 case = 12 each
- **When:** Enter 2 cases in transaction or BOM
- **Then:** Stored authority is 24 each; original 2 cases and factor retained for display/audit.

### MAT-020 — Convert tonne to kg

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/quantities/decimal.test.ts` and `packages/core/src/services/materials/material.service.test.ts` (0.25 t = 250 kg through `toBaseQuantity`), `conversions-table.test.tsx`, `packages/core/src/services/boms/bom.service.test.ts` (a BOM line entered as 0.25 t is stored as 250.000000 kg). E03-S01, #22; E04-S01, #26.
- **Given:** Material BUoM kg and a tonne conversion defined
- **When:** Enter 0.25 tonne
- **Then:** Stored amount is 250 kg, not 0.25 kg.

### MAT-021 — Numerator/denominator inverse

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/quantities/decimal.test.ts` (4 × 3/2 = 6, inverse 0.666667), `packages/core/src/services/materials/material.service.test.ts`, `conversions-table.test.tsx` and `labels.test.ts` (the inverse shown), `tests/integration/materials.test.ts`. E03-S01, #22.
- **Given:** Conversion factor 3/2 relative to BUoM
- **When:** Convert 4 alternative units and display inverse
- **Then:** BUoM calculation equals 6 and reverse representation is consistent at allowed precision.

### MAT-022 — Invalid zero denominator

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/materials/conversion.schema.test.ts` (a zero denominator refused on add and on a factor change), `packages/core/src/services/materials/material.service.test.ts` (a refused change keeps the old factor and writes no audit), the conversions route and action tests, `tests/integration/materials.test.ts` and `materials-api.test.ts`. E03-S01, #22.
- **Given:** New conversion has denominator 0
- **When:** Submit master change
- **Then:** Validation rejects conversion; prior factor, if any, stays unchanged.

### MAT-023 — Missing alternative conversion

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/materials/base-quantity.test.ts` and `packages/core/src/services/materials/material.service.test.ts` (a unit with no conversion is `UNIT_NOT_CONVERTIBLE`, never assumed 1:1). Saving: `packages/core/src/services/boms/bom.service.test.ts` (a BOM line in a unit its material doesn't convert is refused with a field error on that line's unit, `components.N.unit`, next to other lines' errors), `tests/integration/boms-api.test.ts` (a `POST` with a `pallet` line is 400 with that field error), `packages/app/src/components/boms/recipe-form.test.tsx` (the server's line error shown, translated, on its line). MRP's exception waits for slice 3. E03-S01, #22; E04-S01, #26.
- **Given:** Quantity entered in UoM not convertible for material
- **When:** Attempt save or run dependent MRP
- **Then:** Transaction cannot silently assume 1:1; actionable invalid conversion error/exception.

### MAT-024 — Exact six-decimal quantity

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/quantities/decimal.test.ts`, `packages/core/src/services/materials/base-quantity.test.ts` and `packages/core/src/services/materials/material.service.test.ts` (0.123456 kept exactly, every quantity a six-decimal string, never a binary float). Stored: `packages/core/src/services/boms/bom.service.test.ts` (a BOM line of 0.123456 is stored as 0.123456), `packages/db/src/orm.test.ts` (a BOM line's quantity is stored as text), and planning parameters and safety-stock targets (`packages/core/src/validators/quantities/quantity.schema.test.ts`, JSON numbers refused), `packages/db/src/entities/stock/stock-migration.test.ts` (a stock balance of 0.123456 is stored as text). Posted through the ledger: `packages/core/src/services/stock/stock.service.test.ts` (three corrections of 0.123456 then −0.2 give 0.170368, where binary floating point gives 0.17036799999999996: every movement, the balance and the audit read back exactly, and the movements and balance are stored as SQLite text), `tests/integration/stock.test.ts` (a correction of 0.123456 through the API reads back as 0.123456 in the movement, the balance and the audit). E03-S01, #22; E04-S01, #26; #190.
- **Given:** BUoM quantity entered as 0.123456
- **When:** Post valid quantity
- **Then:** Exact six-place value preserved in calculations and ledger.

### MAT-025 — Supply rounding upward

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Calculation requires 1.000001 BUoM with compatible lot parameters
- **When:** MRP proposes procurement/production
- **Then:** Proposal is never below 1.000001; no rounding down causing shortage.

### MAT-026 — Minimum and lot multiple

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Site min 10, multiple 6 and raw need 11
- **When:** Calculate proposal
- **Then:** Proposed supply satisfies both constraints and is no less than 11 (e.g. 12).

### MAT-027 — Conversion update future only

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts`: after the bolt's case conversion changes from 12 to 10 each, the saved BOM still reads 24 each at revision 1. An edit resending the unchanged 2 case line (also sent as 2.0) keeps 24 each and adds no revision, and a newly entered 3 case is stored as 30 each. Transactions: `packages/core/src/services/production-orders/production-order.service.test.ts` ("retains unchanged conversion history": after case 10 → 20 each, an existing order keeps 20 each with factor 10, and a newly entered 3 case is 60 each). E04-S01, #26; E10-S01, #88.
- **Given:** Previously saved BOM uses 1 case = 12 each
- **When:** Admin changes conversion to 1 case = 10 each
- **Then:** Existing BOM/transactions remain 12 BUoM; new 1-case entries use 10 BUoM.

### MAT-028 — No retroactive BOM revision from conversion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (after the component's own case conversion changes from 12 to 10 each, the BOM stays at revision 1 with its stored 24.000000 each line, a stronger case than an unrelated material's), `packages/core/src/domain/boms/recipe-equality.test.ts` (a line with the same base quantity is no change). E04-S01, #26.
- **Given:** One BOM revision with stored component 12 each
- **When:** Update unrelated material case conversion
- **Then:** BOM revision number unchanged; stored BOM component quantity stays 12.

### MAT-029 — Inactive material excluded from new entries

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/find-material.test.ts`, `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts` and `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts` (a new set or target refuses an inactive material, `MATERIAL_INACTIVE`; an existing target stays readable and editable), `packages/app/src/components/master-data/references.test.tsx` and `tests/integration/planning-parameters.test.ts` (a deactivated material isn't offered and its target stays), `tests/integration/planning-parameters-api.test.ts` (409 and nothing stored). BOMs: `packages/core/src/services/boms/bom.service.test.ts` (a new BOM for an inactive output, or adding an inactive component, is `MATERIAL_INACTIVE`, while an edit keeps an inactive component already on the recipe), `packages/app/src/components/boms/choices.test.ts` (only active materials are offered, plus inactive ones the recipe already has). Purchasing: `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` and `packages/core/src/services/purchase-requisitions/purchase-requisition.service.test.ts` (a new line refuses an inactive material, `MATERIAL_INACTIVE`), `packages/app/src/components/purchase-requisitions/choices.test.ts`. A PO stays readable, in the API and on its page, after the material of its cancelled line is deactivated, and its other line is still received, completing the order (`purchase-order.service.test.ts` :545, `tests/integration/purchasing-api.test.ts` :242); a material can't go inactive while a PO line for it is open (LFC-013), so that is how a historical PO completes. E03-S03, #24; E04-S01, #26; E09-S01, #86; E09-S03, #141.
- **Given:** Material inactive, historical PO remains
- **When:** Create new PO line using inactive material
- **Then:** New selection rejected; historical PO remains readable and eligible for completion.

### MAT-030 — BUoM locked by any historic BOM reference

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` (a base-unit change of a BOM's output, of a component, and of a material used only in an old revision of an inactive BOM is `BASE_UNIT_IN_USE` naming the BOM, ahead of the conversions check), `packages/core/src/services/boms/bom-usage.test.ts` (the lookup finds outputs, current components and old-revision components), `packages/db/src/orm.test.ts` (revisions and lines can't be updated). E04-S01, #26.
- **Given:** Material has never been posted or ordered but appears as output/input in an immutable BOM revision, active or archived
- **When:** Admin attempts BUoM edit
- **Then:** Reject change with BOM reference; preserve recipe interpretation across all historical versions.

### MAT-031 — BUoM locked by operational document without posting

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (a material on a customer-order line keeps its base unit, `BASE_UNIT_IN_USE`), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("locks the base unit once a requisition or an order line holds a quantity"), `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("refuses a base-unit change of a material on an order line before any posting"), `packages/core/src/services/production-orders/production-order.service.test.ts` (an unposted order's output is `BASE_UNIT_IN_USE`), `tests/integration/goods-receipts-api.test.ts` (409 `BASE_UNIT_IN_USE`). E08-S01, #83; E09-S01/S02, #86, #87; E10-S01, #88.
- **Given:** Material has no physical stock movements but is referenced by an unposted customer order, PR, PO or production order
- **When:** Admin changes material BUoM
- **Then:** Reject change before first physical transaction; no existing document quantity silently reinterpreted.

### MAT-032 — Non-terminating UoM conversion rounds once

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/quantities/decimal.test.ts`, `packages/core/src/services/materials/base-quantity.test.ts` and `packages/core/src/services/materials/material.service.test.ts` (1 × 1/3 = 0.333333, 2 × 1/3 = 0.666667, rounded half-up once). Stored: `packages/core/src/services/boms/bom.service.test.ts` (a BOM line of 2 at 1/3 is stored as 0.666667 with entered quantity 2 and factor 1/3; 0.000001 at 1/3 is refused on that line's quantity, `QUANTITY_ROUNDS_TO_ZERO`). E03-S01, #22; E04-S01, #26.
- **Given:** Material BUoM each, alternate UoM conversion factor 1/3, user enters 1 alternate unit
- **When:** Save valid business quantity
- **Then:** Store authoritative 0.333333 each by decimal half-up rounding; preserve entered value and exact factor; reject positive input that rounds to zero.

## BOM alternatives, immutable revisions & recipe validity

### BOM-001 — Finished material may have BOM

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a finished BOM is created at revision 1 with its priority, validity and each line's base quantity, entered quantity, unit and factor, and its create is audited with the recipe), `tests/integration/boms-api.test.ts` (created through `POST /boms`, once per idempotency key, with no end when valid-through is left out), `tests/integration/boms.test.ts` (the admin creates a BOM for a finished output on the screen, and its page lists both lines with their quantities). E04-S01, #26.
- **Given:** Finished material with raw component
- **When:** Create recipe
- **Then:** BOM created with required component quantities and validity.

### BOM-002 — Intermediate material may have BOM

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (an intermediate BOM is created from raw inputs; in the BOM-025 test, intermediates with BOMs of their own are components of other BOMs), `packages/core/src/domain/boms/recipe-rules.test.ts` (an intermediate may be an output), `tests/integration/boms.test.ts` (intermediate BOMs chained on the screen, sub A using sub B using sub C). E04-S01, #26.
- **Given:** Intermediate output with raw input
- **When:** Create recipe
- **Then:** Intermediate BOM accepted and can feed parent recipe.

### BOM-003 — Raw material cannot be BOM output

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a raw output is `VALIDATION_FAILED` on `output`, and no BOM or revision is stored), `packages/core/src/domain/boms/recipe-rules.test.ts`, `packages/app/src/components/boms/choices.test.ts` (the form offers only active intermediate and finished outputs), `tests/integration/boms.test.ts` (a raw material isn't offered as the output). E04-S01, #26.
- **Given:** Raw material selected as recipe output
- **When:** Save BOM
- **Then:** Validation rejects recipe; no BOM revision added.

### BOM-004 — Finished material not permitted as component

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a finished component is refused on its line, `components.N.material`, on create and on edit, and nothing is stored), `packages/core/src/domain/boms/recipe-rules.test.ts`, `packages/app/src/components/boms/choices.test.ts`, `tests/integration/boms.test.ts` (a finished material isn't offered as a component). E04-S01, #26.
- **Given:** Recipe for finished output references finished component
- **When:** Save revision
- **Then:** Invalid component type error, no revision created.

### BOM-005 — Raw and intermediate components allowed

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a finished recipe with raw and intermediate components, each stored in its own base unit), `packages/core/src/domain/boms/recipe-rules.test.ts`, `tests/integration/boms.test.ts` (a raw and an intermediate component, shown as 4.5 kg and 2 each). E04-S01, #26.
- **Given:** Finished recipe refers to one raw and one intermediate
- **When:** Validate and save
- **Then:** Recipe accepted, with each component material and required BUoM.

### BOM-006 — Recipe per one output BUoM

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** A recipe is stored per one base unit of the output, with each component in its own base unit: `packages/core/src/services/boms/bom.service.test.ts` (0.25 t stored as 250 kg, 250 ml as 0.25 l), `packages/app/src/components/boms/recipe-form.test.tsx` (the lines are headed "Per 1 each of Cabinet, red"). Scaled to a production order: `packages/core/src/services/production-orders/production-order.service.test.ts` (30 × 2 kg = 60 kg required), `packages/core/src/domain/production-orders/production-planning.test.ts`. Scaling in MRP is slice 3. E04-S01, #26; E10-S01, #88.
- **Given:** Recipe needs 0.5 kg A and 0.2 litre B per finished each
- **When:** Plan 10 finished units
- **Then:** Expected component quantities are 5 kg A and 2 litres B (normalized in each material's BUoM).

### BOM-007 — Partial finished quantity scales recipe

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/production-orders/production-completion.test.ts` (0.125 × 4 = 0.500000 exactly, the rounding order requirements share), `packages/core/src/domain/production-orders/production-planning.test.ts`. E10-S01/S02, #88, #89.
- **Given:** One output BUoM uses 0.125 kg ingredient
- **When:** Plan 4 output BUoM
- **Then:** Computed requirement is exactly 0.5 kg.

### BOM-008 — BOM alternative count

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (two alternatives for one output are listed with their own IDs, priorities and revision 1), `packages/app/src/app/admin/[tenant]/boms/page.test.tsx` (the list shows each BOM with its output, priority and current revision), `tests/integration/boms.test.ts` (Test's demo cabinet has BOMs 00000002 and 00000003, at priorities 1 and 2). E04-S01, #26.
- **Given:** One finished material has two valid alternatives with different priorities
- **When:** Read BOM master
- **Then:** Both independent logical BOM IDs and their versions remain available.

### BOM-009 — Highest priority selected when feasible

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (with stock for both alternatives neither shows a shortage, and the priority 1 BOM, created after and numbered above the priority 2 one, is listed first, preselected and pinned by an order created without a choice; with priority 1 short, priority 2 is preselected). MRP's own selection is slice 3 (#14). E10-S05, #191.
- **Given:** Two valid alternatives, higher priority stock sufficient
- **When:** Run MRP or create manual order with default selection
- **Then:** Higher-priority currently valid BOM revision selected.

### BOM-010 — Fallback to lower-priority feasible BOM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** High-priority BOM missing component, lower-priority fully available
- **When:** Select via MRP
- **Then:** Lower BOM selected, higher rejected with itemized missing components and shortages.

### BOM-011 — No feasible BOM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Both active valid BOMs lack inputs
- **When:** Run MRP
- **Then:** No infeasible parent auto-order created; BOM exception lists missing inputs and plans subcomponents by selected default recipe.

### BOM-012 — Validity before starting date

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (a recipe valid from 2026-01-01 isn't offered for a finish on 2025-12-31), `tests/integration/production-orders.test.ts`. E10-S01, #88.
- **Given:** BOM validity starts tomorrow
- **When:** Select BOM for production completion date today
- **Then:** BOM is excluded from eligible choices.

### BOM-013 — Validity end inclusive

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** The valid-through day is part of the period: `packages/core/src/domain/boms/priority-conflict.test.ts` (a period ending on the day another starts shares that day), `packages/core/src/services/boms/bom.service.test.ts` (an equal-priority BOM starting on another's valid-through day is refused, naming that single day). `packages/core/src/services/production-orders/production-order.service.test.ts` ("includes the inclusive valid-through endpoint": the recipe is offered for an order finishing on its valid-through day). E04-S01, #26; E10-S01, #88.
- **Given:** BOM valid through October 31
- **When:** Create order with planned completion October 31
- **Then:** BOM eligible on through date.

### BOM-014 — Validity end exceeded

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (the day after valid-through only the other alternative is offered; with none left, `PRODUCTION_NO_USABLE_BOM`). E10-S01, #88.
- **Given:** BOM valid through October 31
- **When:** Attempt new production order dated November 1
- **Then:** BOM not eligible; fail or use another date-valid option.

### BOM-015 — Partially overlapping equal priority

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (Jan–Mar against Mar–May at the same priority is `BOM_PRIORITY_CONFLICT`, naming BOM 00000001 and the shared days, 2027-03-01 – 2027-03-31), `packages/core/src/domain/boms/priority-conflict.test.ts`, `tests/integration/boms-api.test.ts` (409 naming the other BOM and the days), `tests/integration/boms.test.ts` (the dialog shows the clash with the other BOM). E04-S01, #26.
- **Given:** Two alternatives for same output priority 1, periods Jan–Mar and Mar–May
- **When:** Admin creates/edits second BOM
- **Then:** Rejected due to overlapping March; identifies conflicting alternative.

### BOM-016 — Fully overlapping equal priority

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a second alternative with the same priority and identical dates is `BOM_PRIORITY_CONFLICT`), `packages/core/src/domain/boms/priority-conflict.test.ts` (identical periods name the other BOM). E04-S01, #26.
- **Given:** Two alternatives same output priority with identical validity dates
- **When:** Save second alternative
- **Then:** Validation rejects duplicate priority/overlap.

### BOM-017 — Different periods same priority

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (January and February at the same priority, and a third at another priority, are all stored), `packages/core/src/domain/boms/priority-conflict.test.ts` (adjacent periods share no day; other priorities are ignored). E04-S01, #26.
- **Given:** Alternative A active Jan and B active Feb with no overlap
- **When:** Save both at same priority
- **Then:** Accepted because validity never overlaps.

### BOM-018 — Priority checks on validity edit

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a valid-from edit that creates an equal-priority overlap, with the priority unchanged, is `BOM_PRIORITY_CONFLICT`, and the BOM keeps its single revision). E04-S01, #26.
- **Given:** Two different-priority or non-overlapping alternatives
- **When:** Edit date interval to create equal-priority overlap
- **Then:** Edit rejected even though priority field was not changed.

### BOM-019 — Priority checks on any BOM update

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** The check runs on the end state of every save: `packages/core/src/services/boms/bom.service.test.ts` refuses a priority edit onto an overlapping active alternative's priority, a validity edit (BOM-018) and a reactivation (BOM-030) that would create an equal-priority overlap, writing nothing, and accepts a reactivation whose priority change in the same request avoids the clash. E04-S01, #26.
- **Given:** Equal-priority overlap would result from a change to BOM definition
- **When:** Change relevant BOM fields
- **Then:** Same active-alternative uniqueness validation runs; inconsistent current selection cannot be saved.

### BOM-020 — First revision immutable after change

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a changed amount adds revision 2, revision 1 reads back with its old quantities, and the revision is audited with the old and new recipe), `tests/integration/boms-api.test.ts` (a `PATCH` returns revision 2 and `GET …/revisions/1` still shows 24.000000), `tests/integration/boms.test.ts` (the page shows 5 kg at revision 2 and 4.5 kg at `?revision=1`, under the history notice), `packages/db/src/orm.test.ts` (triggers abort any update of a revision or a line). `packages/core/src/services/production-orders/production-order.service.test.ts` and `tests/integration/production-orders.test.ts` (an order pinning revision 1 still shows revision 1 at 2.000000 after the BOM is revised). E04-S01, #26; E10-S01, #88.
- **Given:** BOM revision 1 in use
- **When:** Change a component amount
- **Then:** Revision 2 created with new amount; revision 1 and referencing production orders unchanged.

### BOM-021 — Validity edit creates revision

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (a valid-through change adds revision 2, and removing the end adds revision 3, while revision 1 still reads back with its old dates; adding a revision issues no update to the existing revisions or lines), `packages/core/src/domain/boms/recipe-equality.test.ts` (either date counts as a change), `packages/db/src/orm.test.ts` (triggers abort an update of a revision or a line). E04-S01, #26.
- **Given:** Current BOM revision has from/to dates
- **When:** Admin changes valid-through
- **Then:** New immutable revision created, old revision remains intact.

### BOM-022 — Logical BOM deactivation does not create recipe revision

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (deactivation and reactivation are audited as `active` yes → no and no → yes, and the revisions stay 2 and 1), `tests/integration/boms.test.ts` (after Deactivate, the list shows the BOM Inactive at the revision it had). `packages/core/src/services/production-orders/production-order.service.test.ts` and `tests/integration/production-orders.test.ts` (a pinned order keeps its revision after deactivation; new orders get `PRODUCTION_NO_USABLE_BOM`). E04-S01, #26; E10-S01, #88.
- **Given:** Active BOM revision used by completed order
- **When:** Deactivate logical BOM via its audited active flag
- **Then:** Historical production order retains pinned original recipe, new orders cannot select inactive BOM, and status toggle creates no new immutable recipe revision.

### BOM-023 — Unchanged content no new revision

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** Saving through the screens or the API: `packages/core/src/services/boms/bom.service.test.ts` (an identical save, a reordered save and a save with the same base quantity keep revision 1 and version 1, and record no revision entry), `packages/core/src/domain/boms/recipe-equality.test.ts`, `tests/integration/boms-api.test.ts` (a `PATCH` resending the same recipe returns the same revision and version), `packages/app/src/components/boms/bom-controls.test.tsx` (the screen says "No change: revision 2 is still current."). The import: `packages/core/src/services/imports/import-boms.test.ts` (an identical recipe in another line order and unit previews Unchanged; after the commit the BOM is still revision 1 and no audit entry was added). E04-S01, #26, with #27.
- **Given:** Existing logical BOM revision; uploaded complete recipe identical
- **When:** Perform BOM import
- **Then:** No new revision, result marked Unchanged.

### BOM-024 — Cyclic direct ingredient blocked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (an output listed as its own component is `BOM_CYCLE` with the path "00000008 Sub A → 00000008 Sub A"), `packages/core/src/domain/boms/find-cycle.test.ts`. E04-S01, #26.
- **Given:** BOM for intermediate A contains A
- **When:** Validate recipe
- **Then:** BOM rejected and offending self-cycle shown.

### BOM-025 — Cyclic indirect dependency blocked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (editing C to use A, where A uses B and B uses C, is `BOM_CYCLE` with the full path naming each step's BOM, and C keeps revision 1 and its old component), `packages/core/src/domain/boms/find-cycle.test.ts`, `tests/integration/boms-api.test.ts` (the same edit through `PATCH` is 409 `BOM_CYCLE` with the full path, and C's revision and version stay), `tests/integration/boms.test.ts` (the same edit on the screen shows the full path from C, and the BOM keeps its revision). E04-S01, #26.
- **Given:** Recipes A needs B; B needs C
- **When:** Edit C recipe to use A
- **Then:** Entire change rejected and path A → B → C → A reported.

### BOM-026 — Change can't modify existing order recipe

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (after revision 2 at 9 kg, the completion preview expects revision 1's 2 kg and 8 each; after revision 2 and deactivation through `BomService`, a posted completion of 40 stores revision 1's expected 20 kg and 80 each, with zero variance). E10-S02, #89; E10-S03, #143.
- **Given:** Production order pins recipe revision 1
- **When:** Admin changes BOM to revision 2 then completes old order
- **Then:** Completion expects revision 1 quantities, not revision 2.

### BOM-027 — No mandatory auto-BOM on new Make master

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts` (a new intermediate, its Make set at a location and a later edit of the material are all saved and audited while the tenant has no BOM, and none is created). MRP's Missing BOM is slice 3 (#14). E10-S05, #191.
- **Given:** Intermediate Make material exists without any BOM
- **When:** Save master and run MRP
- **Then:** Master allowed; MRP identifies Missing BOM for affected demand.

### BOM-028 — Manual BOM override restricted by dates

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (only date-valid alternatives are offered; an explicit superseded pair is `PRODUCTION_BOM_CHANGED`; an explicit pair whose current revision expired before the planned finish is `PRODUCTION_BOM_CHANGED` with no order, audit entry or movement written, while the date-valid alternative is offered and the same pair is accepted for a finish inside its dates), `packages/app/src/components/production-orders/production-dialog.test.tsx`. E10-S01, #88; E10-S03, #143.
- **Given:** Several revisions/alternatives, one expired
- **When:** User chooses an expired revision for new production order
- **Then:** New order cannot reference expired BOM; date-valid alternatives offered.

### BOM-029 — Logical status toggle preserves revision count

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (deactivating and reactivating a BOM with revisions 1 and 2 records both entries, and its revisions stay 2 and 1, with no revision 3), `packages/db/src/orm.test.ts` (revisions and lines can't be updated). `packages/core/src/services/production-orders/production-order.service.test.ts` (an order still pins revision 1 after the BOM is deactivated), `packages/core/src/services/production-orders/production-completion.service.test.ts` (after the BOM is revised, deactivated and reactivated, its revisions are 2 and 1 and the order still pins revision 1 for its history and preview). E04-S01, #26; E10-S01, #88; E10-S03, #143.
- **Given:** Logical BOM has immutable revisions 1 and 2 and an existing production order pins revision 1
- **When:** Admin deactivates and later reactivates logical BOM
- **Then:** Active flag/audit changes, revision 1 and 2 snapshots unchanged, no artificial revision 3; pinned order still references revision 1.

### BOM-030 — Reactivation validates competing BOM priorities

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/boms/bom.service.test.ts` (reactivating B while the active A has the same priority over overlapping days is `BOM_PRIORITY_CONFLICT`, naming A; B stays inactive at revision 1, and A stays at revision 1), `packages/app/src/components/boms/bom-controls.test.tsx` (Reactivate shows the clash with its details). E04-S01, #26.
- **Given:** Logical BOM alternative A active with priority 1 and overlapping validity; alternative B inactive at priority 1
- **When:** Administrator reactivates B without changing recipe
- **Then:** Activation rejected due to overlapping equal-priority selectable alternatives; B remains inactive and neither alternative gets a new immutable recipe revision.

## Master-data & BOM spreadsheet imports

### XLS-001 — Documented material template

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/imports/workbook-file.test.ts` (the downloaded template has every data sheet with only its header row, then the Instructions and Instrukcja sheets: blank creates, an existing ID updates, an unknown ID is an error, which columns are required, and an Example column), `packages/core/src/domain/imports/workbook-layout.test.ts` (every column explained in both languages), `tests/integration/import-api.test.ts` (the template is served as `.xlsx` to a token and to the signed-in browser), `tests/integration/import.test.ts` (the Import screen links it). E05-S01, #27.
- **Given:** Admin viewing material imports
- **When:** Download XLS template
- **Then:** Template documents ID blank=create, existing=update, unknown explicit ID=error, required fields and examples.

### XLS-002 — Material import auto-generates ID

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (with 00000001 and 00000002 in the tenant, a blank-ID row previews 00000003 and nothing is written until the commit, which creates it and reports it), `tests/integration/import-api.test.ts` (the committed IDs are the ones the dry run showed), `tests/integration/import.test.ts` (the screen previews each new eight-digit ID, and the records show on their pages after the commit). E05-S01, #27.
- **Given:** Tenant has material IDs 00000001 and 00000002
- **When:** Dry run then import valid row with blank ID
- **Then:** Third material created with generated ID 00000003; import result shows assignment.

### XLS-003 — Known material ID updates record

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (ID 00000001 previews Description before → after; the commit updates that record, creates no second one and adds its audit entry; an identical row is Unchanged and records nothing). The audit entry is counted, not read. E05-S01, #27.
- **Given:** Existing material 00000001
- **When:** Import changed description with ID 00000001
- **Then:** Same record updated, no second material created; edit audited.

### XLS-004 — Unknown explicit material ID errors

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (`IMPORT_UNKNOWN_ID` on Materials, row 2, column ID: "Material 00009876 doesn't exist in Prod. Leave the ID blank to create a new material.", and no preview token), `packages/core/src/services/imports/import-boms.test.ts` (the same for a BOM ID), `tests/integration/import.test.ts` (the screen lists the sheet, row, column and advice, and the commit stays closed). E05-S01, #27.
- **Given:** Import material row with ID 00009876 absent from tenant
- **When:** Run dry run
- **Then:** Error includes worksheet, row, ID and advice to leave ID blank to create.

### XLS-005 — Duplicate material IDs in workbook

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/prepare-import.test.ts` (every row sharing an ID gets `IMPORT_DUPLICATE_KEY` naming the others, and none is applied), `packages/core/src/services/imports/import.service.test.ts` (rows 2 and 4 both flagged, no preview token), `tests/integration/import.test.ts` (both rows listed on the screen, "Commit 0 changes" disabled). E05-S01, #27.
- **Given:** Workbook has two material rows for 00000001
- **When:** Run dry run
- **Then:** Both relevant rows identified as conflicting; import cannot commit.

### XLS-006 — Missing required material type

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/prepare-import.test.ts` (a row without a type is `VALIDATION_FAILED` on Type, once, and the row is dropped), `packages/core/src/services/imports/import.service.test.ts` (the error sits on its row's Type cell with the screens' message, and no material is created). E05-S01, #27.
- **Given:** Import row without type
- **When:** Run dry run
- **Then:** Reports row/field validation failure; no partially created material.

### XLS-007 — Missing referenced location

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a planning row for location 00000099 is `IMPORT_MISSING_REFERENCE` on Location ID with "Create or import it first: …"; there is no preview token and the materials are unchanged). E05-S01, #27.
- **Given:** Planning-parameter import refers to nonexisting site
- **When:** Run dry run
- **Then:** Reference rejected with import dependency guidance; no write.

### XLS-008 — Wrong template order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (each BOM line whose material doesn't exist is `IMPORT_MISSING_REFERENCE` on its own row, naming the material, and so is an unknown output; a BOM may use a material the Materials sheet creates, whatever the tab order), `packages/core/src/services/imports/import.service.test.ts` (the dependency guidance: "Create or import it first: a row can only use records that exist, or that an earlier sheet of this workbook creates.", asserted for a location). E05-S01, #27.
- **Given:** BOM workbook references material not imported yet
- **When:** Run dry run
- **Then:** Import fails with missing-material and master dependency explanation.

### XLS-009 — Dry run reports multiple errors

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a duplicate ID, an invalid type, an unknown location and an unknown sheet, all reported in sheet and row order), `packages/core/src/services/imports/import-boms.test.ts` (a BOM header's own error is reported together with its lines'), `tests/integration/import.test.ts` (a workbook's unknown ID and duplicate pair all listed on the screen). E05-S01, #27.
- **Given:** One workbook has duplicate ID, invalid type and unknown reference
- **When:** Run dry run
- **Then:** All detectable errors listed, not just first error.

### XLS-010 — Dry run does not modify data

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (after a clean dry run the materials and the audit entry count are unchanged), `packages/core/src/services/imports/import-boms.test.ts` (a dry run that would revise a BOM leaves it at its revision and adds no audit entry), `packages/core/src/http/request-savepoint.test.ts` (the dry run's savepoint rolls back every row's write and audit entry, a refused row's too), `tests/integration/import-api.test.ts` (none of a dry run's new materials and location exist before the commit; a failing dry run writes none of its rows). E05-S01, #27.
- **Given:** Workbook contains valid create/update rows
- **When:** Run dry run only
- **Then:** All masters, BOM revisions and audit business records unchanged.

### XLS-011 — Dry run summarizes effect

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a create, an update and an unchanged row labelled so, each with its record ID, the update's changes and the sheet's counts), `tests/integration/import.test.ts` (the screen previews Create rows with their new IDs), `packages/app/src/components/imports/import-screen.test.tsx` (unchanged rows behind "Show 1 unchanged row"). E05-S01, #27.
- **Given:** Workbook has one new, one modified, one unchanged record
- **When:** Run dry run
- **Then:** Preview labels create/update/unchanged and shows affected identifiers.

### XLS-012 — Commit requires successful dry run

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a commit for a workbook with errors, which got no token, or with a token that isn't its dry run's, is `IMPORT_STALE` and writes nothing), `packages/core/src/validators/imports/import-request.schema.test.ts` and the Import `actions.test.ts` (a commit without a token is `VALIDATION_FAILED` on `previewToken` and runs nothing), `tests/integration/import.test.ts` (with problems, "Commit 0 changes" is disabled). E05-S01, #27.
- **Given:** Workbook never validated or validation failed
- **When:** Try commit
- **Then:** Commit is rejected; no rows written.

### XLS-013 — Import is atomic across valid rows

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (committing a workbook with one valid row and one unknown ID is refused, and the valid row isn't created), `packages/core/src/http/request-savepoint.test.ts` (rows written through the real services all roll back when the commit throws). E05-S01, #27.
- **Given:** Workbook includes several valid data rows and one invalid
- **When:** Attempt import
- **Then:** Entire workbook rejected; valid rows not applied either.

### XLS-014 — Conflict after dry run

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a material edited after the dry run makes the commit `IMPORT_STALE`: the edit stays and the workbook's new row isn't created; a renamed referenced location, or a record created elsewhere, does the same), `tests/integration/import-api.test.ts` (409 `IMPORT_STALE` through the API, and the other edit stays), `packages/core/src/domain/imports/preview-token.test.ts` (the token changes with a version or a created ID), `packages/app/src/components/imports/import-screen.test.tsx` (a stale commit goes back to the dry run with its explanation). E05-S01, #27.
- **Given:** Dry run valid for updating material 00000001
- **When:** Another session edits that material then commit import
- **Then:** Commit fails with concurrency explanation; other session's changes preserved.

### XLS-015 — Tenant read-only forbids import

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/import-api.test.ts` (in read-only Prod, a dry run and a commit with a clean dry run's token are both 409 `TENANT_READ_ONLY`, and the location isn't created), `tests/integration/import.test.ts` (Prod turned read-only while a clean dry run is on screen: the commit is refused with the read-only message and writes nothing, and the reopened screen says imports are blocked and disables the upload), `packages/app/src/components/imports/import-screen.test.tsx` (the template stays offered). No inspection-only dry run is offered: the scenario allows one, and the spec (Q11) leaves it out. E05-S01, #27.
- **Given:** Test tenant read-only
- **When:** Admin tries master import
- **Then:** Neither dry-run commit nor master changes posted; inspection-only validation may be offered without committing.

### XLS-016 — Tenant isolation during import

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (with 00000001 in both tenants, an update imported in Test changes only Test's record; a Test row naming a location or material that exists only in Prod is `IMPORT_MISSING_REFERENCE` "… doesn't exist in Test"; TEN-014). E05-S01, #27.
- **Given:** Test and Prod have same master business ID but different contents
- **When:** Import update in Test
- **Then:** Only Test's matching business record updated.

### XLS-017 — BOM workbook structure

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/imports/workbook-file.test.ts` (separate BOM headers and BOM lines sheets with their header rows; Instructions say Import reference is required for a new record and the lines are the complete recipe, and Instrukcja that a blank BOM ID creates a new BOM with the next ID), `packages/core/src/domain/imports/workbook-layout.test.ts` (the BOM ID, Import reference and line columns). E05-S01, #27.
- **Given:** Admin downloads BOM template
- **When:** Open workbook
- **Then:** Separate header and component-line sheets with permanent BOM ID and Import Reference guidance.

### XLS-018 — New BOM temp reference

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (a blank-ID header RECIPE-X and three lines naming it preview and create one BOM 00000001 with all three lines), `packages/core/src/domain/imports/prepare-import.test.ts` (a line naming no header is `IMPORT_LINE_WITHOUT_HEADER`, a header without lines `IMPORT_BOM_WITHOUT_LINES`), `tests/integration/import-api.test.ts` (created through the API at revision 1, with its reference in the report), `tests/integration/import.test.ts` (the screen previews it with its reference, and the BOM's page shows its line). E05-S01, #27.
- **Given:** BOM header has blank ID and Import Reference RECIPE-X; component lines use RECIPE-X
- **When:** Dry run and import
- **Then:** Header and lines bind one new generated logical BOM ID; no orphan components.

### XLS-019 — Two new BOMs same upload

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (RECIPE-A and RECIPE-B at different priorities become BOMs 00000001 and 00000002, each with its own lines at revision 1). E05-S01, #27.
- **Given:** Workbook creates RECIPE-A and RECIPE-B for different alternatives
- **When:** Import
- **Then:** Each component set linked to its own newly generated logical BOM; independent revisions.

### XLS-020 — Update existing logical BOM by ID

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (a changed recipe for a BOM at revision 2 previews Revision 2 → 3; after the commit the BOM keeps its ID at revision 3, revision 2 keeps its lines and revision 1 its priority), `tests/integration/import-api.test.ts` (revision 1 → 2 through the API, and revision 1 keeps both lines). E05-S01, #27.
- **Given:** Existing BOM ID with revision 2
- **When:** Import changed complete recipe for same BOM ID
- **Then:** New immutable revision 3 created and older versions retained.

### XLS-021 — Omitted component removed in new revision

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/recipe-diff.test.ts` (a component left out is reported removed), `packages/core/src/services/imports/import-boms.test.ts` (the preview lists the left-out components as removed; the new revision lacks them and the previous one still has them), `tests/integration/import-api.test.ts` (the preview lists the left-out line as removed; afterwards revision 2 has one component and revision 1 still has two). E05-S01, #27.
- **Given:** BOM revision lists components A/B/C; incoming recipe lists A/B
- **When:** Dry run and commit
- **Then:** Preview reports C removed; new revision contains A/B while old revision still contains A/B/C.

### XLS-022 — Identical BOM is no-op

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (the same recipe in another line order and unit previews Unchanged with no changes; after the commit the BOM is still revision 1 and no audit entry was added), `packages/core/src/domain/imports/recipe-diff.test.ts` (order alone is no change), `packages/app/src/components/imports/import-screen.test.tsx` ("Nothing to change.", the commit closed). E05-S01, #27.
- **Given:** Imported header, dates, priority and all component data identical to current version
- **When:** Dry run and commit
- **Then:** Result marked Unchanged; no new revision or history rewrite.

### XLS-023 — BOM import priority conflict

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (a new alternative at the priority an existing BOM holds over the same dates is `BOM_PRIORITY_CONFLICT` on its Priority cell, the commit is refused and the tenant keeps its one BOM; the same for two new alternatives in one workbook, after which a clean import gets IDs 00000001 and 00000002). E05-S01, #27.
- **Given:** Uploaded BOM overlaps active same-priority alternative
- **When:** Dry run
- **Then:** BOM import rejected with conflict; no new versions created.

### XLS-024 — BOM import cycle

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (lines that make Panel use Frame, whose BOM uses Panel, are `BOM_CYCLE` on the header row with the full path "00000004 Panel →(BOM 00000001) 00000006 Frame →(BOM 00000002) 00000004 Panel"; the commit is refused, the workbook's new material isn't created and the BOM stays at revision 1). E05-S01, #27.
- **Given:** Imported components form indirect cycle
- **When:** Dry run
- **Then:** Import rejected with full dependency path; none of workbook applied.

### XLS-025 — BOM import identifies specific changes

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/recipe-diff.test.ts` (the scenario's own example: A 1 → 1.5 kg changed, B removed, C added), `packages/core/src/services/imports/import-boms.test.ts` (a real BOM's preview lists changed, added and removed components with quantity and unit), `packages/app/src/components/imports/report-text.test.ts` (the screen writes them as added and removed). E05-S01, #27.
- **Given:** Existing A 1 kg/B 2 kg, imported A 1.5 kg/C 1 kg
- **When:** Dry run
- **Then:** Preview identifies A changed, B removed and C added.

### XLS-026 — Atomic multi-sheet BOM import

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (a Materials row, a valid new header and a line naming an unknown material: the dry run reports the line and gives no token; the commit is refused, no material and no BOM are created; a workbook refused for a cycle applies no sheet either), `packages/core/src/services/imports/import.service.test.ts` (a refused commit leaves a valid row unapplied). E05-S01, #27.
- **Given:** Header valid but one component row refers to invalid material
- **When:** Commit after dry run
- **Then:** Entire workbook remains unapplied; no partial header or revision.

### XLS-027 — Stable BOM ID never overwritten

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (a changed recipe keeps BOM ID 00000001 at revision 3; an identical recipe and an Active-only change keep revision 1), `tests/integration/import-api.test.ts` (a BOM revised through the API keeps its ID). E05-S01, #27.
- **Given:** Import existing BOM ID to update content
- **When:** Commit
- **Then:** Logical BOM ID unchanged; revision changes only when content changes.

### XLS-028 — BOM import status-only change does not version recipe

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import-boms.test.ts` (an unchanged recipe with Active "no" previews only Active yes → no; after the commit the BOM is inactive at revision 1, with one `boms.bom.deactivated` audit entry; reactivating it while an active alternative holds its priority is `BOM_PRIORITY_CONFLICT` on its Priority cell, and it stays inactive at the same revision). E05-S01, #27.
- **Given:** Existing BOM workbook supplies complete unchanged header recipe and component lines but toggles logical BOM active status
- **When:** Dry run then commit
- **Then:** Update audited logical active flag (subject to priority-overlap validation), report status-only change, create no new immutable recipe revision.

## Customer orders, forecasts, shipments & goods issues

### SAL-001 — Customer master required for order

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (an unknown or Prod-only customer, location or material is `CUSTOMER_NOT_FOUND`, `LOCATION_NOT_FOUND` or `MATERIAL_NOT_FOUND`, with no header, line or audit entry), `tests/integration/customer-orders.test.ts` (an unknown customer or material is 404 and the order count is unchanged). E08-S01, #83.
- **Given:** Create customer order with unknown customer ID
- **When:** Save
- **Then:** Operation fails with missing-customer reference; no order created.

### SAL-002 — Order header one location

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (one header location, both lines stored), `tests/integration/customer-orders.test.ts` (a normal user's UI order stores one header location and two material lines). E08-S01, #83.
- **Given:** Customer order for location A
- **When:** Add two lines for different materials at location A
- **Then:** Order stores one header location and both lines.

### SAL-003 — Multiple dates per customer order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (each line keeps its required date; repeated materials on different dates), `tests/integration/customer-orders.test.ts` (lines dated 2027-01-04 and 2027-01-08 under one header location). E08-S01, #83.
- **Given:** Order has two lines required Monday and Friday
- **When:** Save and inspect
- **Then:** Each line keeps its own required date; header location remains shared.

### SAL-004 — No cross-location line override

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/customer-orders/customer-order.schema.test.ts` (a line location is refused), `tests/integration/customer-orders.test.ts` (a line with its own location is 400). E08-S01, #83.
- **Given:** Order for location A
- **When:** Try to add a line delivered from location B
- **Then:** Line rejected or user must create separate order for location B.

### SAL-005 — Customer order lifecycle begins Open

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` and `tests/integration/customer-orders.test.ts` (header and lines start Open with fulfilled 0.000000). E08-S01, #83.
- **Given:** Valid new customer order
- **When:** Create order
- **Then:** Header and active lines begin Open with fulfilled quantity zero.

### SAL-006 — Create shipment against order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/shipments/shipment.service.test.ts` (a shipment references one order and its matching lines), `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (created from the API and from the order's page, each line naming its order line). E08-S02, #84.
- **Given:** Open order with two line items
- **When:** Create outbound shipment referencing it
- **Then:** Shipment references exactly one customer order; lines reference matching order lines.

### SAL-007 — Shipment can contain several lines of one order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/shipments/shipment.service.test.ts`, `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (one shipment with both lines of one order). E08-S02, #84.
- **Given:** Customer order has A and B lines
- **When:** Make one shipment with both lines
- **Then:** Both lines accepted under same parent order.

### SAL-008 — Shipment cannot combine customer orders

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/shipments/shipment.service.test.ts` (a line of another order, stated or by its ID, is a field error and nothing is written), `tests/integration/shipments-api.test.ts` (400 on `lines.1.customerOrder`; the order still has only its own shipment). An edit can't add another order's line either: `shipment.service.test.ts` :348 (a field error on `lines.1.customerOrder`). E08-S02, #84; E08-S05, #147.
- **Given:** Open orders O1 and O2
- **When:** Try shipment with a line from each
- **Then:** Rejected; separate shipment required.

### SAL-009 — Shipment creation does not decrement inventory

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/shipments/shipment.service.test.ts` (stock 100 and no movement after a shipment), `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (stock unchanged, fulfilled 0.000000 on every line). E08-S02, #84.
- **Given:** Stock 100, open customer order 60
- **When:** Create outgoing shipment for 60 without GI
- **Then:** Physical inventory remains 100, fulfilled quantity unchanged.

### SAL-010 — Partial GI fulfills only its line

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (A fulfilled 20, B 0; only A's stock at the order's location drops 20), `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (the same through the API and the shipment page). E08-S02, #84.
- **Given:** Order line A=50 and B=30, stock sufficient
- **When:** Goods issue 20 of A
- **Then:** A fulfilled 20; B fulfilled 0; respective material inventory decreases 20 only.

### SAL-011 — Multiple GI posts accumulate

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (issues of 20 then 25: fulfilled 45, 15 to issue, order Open). E08-S02, #84.
- **Given:** Order line 60, stock sufficient
- **When:** Post GI 20 then GI 25
- **Then:** Line fulfilled quantity 45, outstanding 15, header still Open.

### SAL-012 — Over-issue blocked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (11 against 10 outstanding is a field error; stock, order and audit unchanged), `tests/integration/shipments-api.test.ts` (400; fulfilled stays 50, stock 50), `tests/integration/shipments.test.ts` (the error beside the line). E08-S02, #84.
- **Given:** Order line 60 with 50 already fulfilled
- **When:** Post GI for 11
- **Then:** Rejected (only 10 outstanding), with no stock or demand changes.

### SAL-013 — Exact final GI marks fulfilled

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (the final 10 completes the line; the last line completes the order and its shipments), `tests/integration/shipments.test.ts`. E08-S02, #84.
- **Given:** Order line 60 with 50 fulfilled
- **When:** Post GI 10
- **Then:** Line fully fulfilled; if all lines complete, order status becomes Completed.

### SAL-014 — Fully delivered order consumes forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, order 60 and GI 60 same original date
- **When:** Run MRP
- **Then:** Demand from those records is remaining forecast 40; no firm outstanding 60.

### SAL-015 — Early close releases abandoned forecast consumption

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The order half: `packages/core/src/services/customer-orders/customer-order.service.test.ts` (:73: a line of 10 with 4 issued, Closed Early → 4 fulfilled and kept, 6 abandoned, stock and postings unchanged). The residual forecast is MRP, slice 3 (#14). E11-S01, #90.
- **Given:** Forecast 100, order 60 and GI 30
- **When:** Close remaining order line Early
- **Then:** MRP residual forecast 70; outstanding firm demand 0; 30 deliveries remain historical.

### SAL-016 — Cancellation restores forecast

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (Cancel of a whole order before any issue: lines Cancelled, everything abandoned, the shipment context completed, audited), `tests/integration/document-lifecycle.test.ts` (API Cancel). Forecast consumption and the residual need MRP (slice 3, #14; DEM-011). E11-S01, #90.
- **Given:** Forecast 100, new unfulfilled order 60
- **When:** Cancel order before any GI
- **Then:** Customer order no longer consumes 60; forecast residual 100.

### SAL-017 — Open overdue order due today for MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Unfulfilled customer order due yesterday
- **When:** Run MRP today
- **Then:** Outstanding amount planned as immediately due today; original required date kept for forecast consumption.

### SAL-018 — No customer over-delivery by shipment line

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (16 on a 15-unit shipment is refused with 100 in stock; across shipments only the order line's outstanding may be issued), `tests/integration/shipments-api.test.ts` (16 is 400). An edit can't plan past it either: `packages/core/src/services/shipments/shipment.service.test.ts` :348 (a line raised beyond the order line's outstanding, or a new line beyond its own, is a field error on its quantity). E08-S02, #84; E08-S05, #147.
- **Given:** Shipment for 15 outstanding units of order line
- **When:** Try to issue 16
- **Then:** Blocked even if physical stock 100.

### SAL-019 — Change ordered quantity with no delivery

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/customer-orders.test.ts` (the admin changes 60 to 80 in the UI: stored 80.000000, version +1, audit before/after with UI channel and session), `packages/core/src/services/customer-orders/customer-order.service.test.ts` (the same on the API channel). Use by the next MRP and the forecast update wait for slice 3 (#14). E08-S01, #83.
- **Given:** Order line 60, no goods issue
- **When:** Admin/normal user changes quantity 80
- **Then:** New amount stored, audited and used by next MRP; customer forecasts update accordingly.

### SAL-020 — Quantity cannot drop below delivered

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (after an issue of 40, a quantity of 39 is a 400 field error and the order is unchanged). E08-S02, #84.
- **Given:** Order line 60, GI 40 posted
- **When:** Edit ordered quantity to 39
- **Then:** Rejected; previous 60 retained.

### SAL-021 — Partially delivered line immutable identity

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (a delivered line's material or required-date change is 409 `CUSTOMER_ORDER_LOCKED`, order unchanged), `tests/integration/stock-reversals.test.ts` (the locks hold after a full reversal). E08-S02, #84, with #91.
- **Given:** Order line partially fulfilled
- **When:** Try changing material or original due date
- **Then:** Change rejected for processed line, preserving fulfillment and forecast history.

### SAL-022 — Partially delivered location immutable

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (a header location change after an issue is 409 `CUSTOMER_ORDER_LOCKED`). E08-S02, #84.
- **Given:** Order header has posted GI on a line
- **When:** Change order fulfillment location
- **Then:** Blocked; prior GI attribution remains at original site.

### SAL-023 — Status across multi-line order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/document-lifecycle/lifecycle.test.ts` (Open while any line is Open; Completed only if all are; otherwise Closed Early), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (Open while a line is open, Completed when all are), `packages/core/src/services/customer-orders/customer-order.service.test.ts` (closes partial demand and derives mixed header states), `tests/integration/document-lifecycle.test.ts` (Close Early gives Closed Early with the abandoned remainder). E08-S02, #84; E11-S01, #90.
- **Given:** Order has line A fully fulfilled and B partially fulfilled
- **When:** Recalculate header status
- **Then:** Open while B active; Completed only when all lines fulfilled; Closed Early once unresolved parts are expressly abandoned.

### SAL-024 — No customer-return workflow

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (after a completed order, a reasoned +5 "Physical customer return" correction raises stock; the order stays Completed and equal to before, with its fulfilled quantities, and no further goods issue exists); `tests/integration/stock.test.ts` (a normal user's +0.5 return correction raises stock); no return or credit entity exists (N02). E07-S01, #80; E08-S04, #140.
- **Given:** Completed customer order and goods physically returned
- **When:** Record positive inventory correction with reason
- **Then:** Physical stock rises but original customer order stays fulfilled; no return/credit document created.

### SAL-025 — Inactive customer existing order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (after the customer's deactivation, a shipment and a goods issue post on the Open order, its fulfilled quantity rises and stock falls; a new order for that customer is `CUSTOMER_INACTIVE`), `packages/core/src/services/customer-orders/customer-order.service.test.ts` and `tests/integration/customer-orders.test.ts` (the order stays editable). E08-S01, #83; E08-S04, #140.
- **Given:** Customer was active at order creation, later deactivated
- **When:** Fulfill existing order with valid GI
- **Then:** Existing order remains processable; creating new order for inactive customer is forbidden.

## Procurement: requisitions, POs & actual receipts

### BUY-001 — MRP Buy recommendation creates PR

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Buy material has net requirement 100
- **When:** Accept manual MRP recommendation
- **Then:** Purchase requisition for required amount created, not purchase order.

### BUY-002 — Direct manual PO allowed

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (an Open order with the next ID and no requisition reference), `tests/integration/purchasing-api.test.ts` (a normal user's direct PO saved Open, `requisition: null`, once per key). Counting it as planned supply is MRP, slice 3 (#14). E09-S01, #86.
- **Given:** Active supplier and material but no requisition
- **When:** User creates PO
- **Then:** Valid PO saved without PR reference and counted as planned supply.

### BUY-003 — PO from requisition creates link

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("converting a requisition": the line links it and converted becomes 60), `packages/app/src/components/purchase-orders/choices.test.ts`, `tests/integration/purchasing-api.test.ts` (converted 60, outstanding 40, the line names the requisition). E09-S01, #86.
- **Given:** Open requisition for 100
- **When:** Create PO for 60 referencing requisition
- **Then:** Requisition converted amount becomes 60; PO line references originating requisition.

### BUY-004 — Requisition may split across POs

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (a second order to another supplier completes the requisition), `tests/integration/purchasing-api.test.ts` (60 then 40 to another supplier: converted 100, Completed). E09-S01, #86.
- **Given:** Open PR for 100
- **When:** Create PO 40 to supplier A and PO 60 to supplier B
- **Then:** Both POs retained; PR converted quantity 100; its status Completed.

### BUY-005 — Suppliers unrestricted per material

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts`, `tests/integration/purchasing-api.test.ts` (a PO to a fresh supplier with no supplier-material mapping is saved; no such mapping exists, N06). E09-S01, #86.
- **Given:** Material has no supplier-material mapping
- **When:** Create PO using any active supplier
- **Then:** PO accepted; no sourcing master required.

### BUY-006 — Supplier site single header

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("accepts lines that state the order's own location"), `tests/integration/purchasing-api.test.ts` (two material lines, one header location). E09-S01, #86.
- **Given:** PO for location A
- **When:** Add two distinct material lines
- **Then:** Both lines belong to same location A.

### BUY-007 — PO cannot mix locations

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("one location": a line for another location is refused on `lines.N.location`, nothing saved), `tests/integration/purchasing-api.test.ts` (400, order count unchanged). E09-S01, #86.
- **Given:** PO header for location A
- **When:** Try line at location B
- **Then:** Reject or require separate PO; no mixed-site header.

### BUY-008 — Different delivery dates per PO line

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (per-line planned dates; two lines of one material on different dates), `packages/app/src/components/purchase-orders/order-form.test.tsx`, `tests/integration/purchasing-api.test.ts`, `tests/integration/purchasing.test.ts` (the demo PO shows both dates). E09-S01, #86.
- **Given:** PO has material A due Wednesday and B due Friday
- **When:** Save
- **Then:** Individual planned dates stored per line.

### BUY-009 — PR and PO do not create incoming stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("leaves stock untouched until a receipt posts": a PO creates no balance; "leaves stock at zero when a requisition is converted into an order": stock reads 0 with no movement until the receipt posts), `tests/integration/goods-receipts-api.test.ts` (stock 0 after an order and a refused receipt). E09-S01/S02/S03, #86, #87, #141.
- **Given:** Raw material has physical stock 0 and an open purchase requisition
- **When:** Convert PR to linked purchase order with planned delivery date, without posting GR
- **Then:** Physical on-hand remains zero; only purchase requisition, purchase order and actual goods receipt are procurement entities. The PO is planned supply; no separate incoming-shipment object exists.

### BUY-010 — Partial goods receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (raises stock and received; the order stays Open), `tests/integration/goods-receipts-api.test.ts` (30 → stock 30, received 30, outstanding 70, Open), `tests/integration/goods-receipts.test.ts`. E09-S02, #87.
- **Given:** PO line ordered 100
- **When:** Post GR line for 30
- **Then:** Physical stock +30, PO received 30, outstanding 70, PO remains Open.

### BUY-011 — Multiple receipts against same PO line

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (repeated receipts), `tests/integration/goods-receipts-api.test.ts` (a second 50 → received 80, outstanding 20, stock 80; racing receipts both add, once each). E09-S02, #87.
- **Given:** PO line 100; first receipt 30 posted
- **When:** Post second receipt 50
- **Then:** Total received 80, outstanding 20; no duplicate posted amount.

### BUY-012 — Multi-line GR from one PO

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (several lines in one posting), `tests/integration/goods-receipts-api.test.ts` (20 of A and 5 of B: both balances and both lines), `tests/integration/goods-receipts.test.ts`. E09-S02, #87.
- **Given:** PO with material A=50 B=10
- **When:** Post GR for 20 A and 5 B in one receipt
- **Then:** Both balances update and corresponding PO lines reflect received quantities atomically.

### BUY-013 — Multi-PO GR forbidden

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("refuses a line from another order"), `tests/integration/goods-receipts-api.test.ts` (400 on `lines.1.purchaseOrder`, stock unchanged). E09-S02, #87.
- **Given:** Two POs from same supplier
- **When:** Try receipt with a line from each PO
- **Then:** Rejected; one GR can only reference one PO.

### BUY-014 — Supplier short delivery remains open

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (95 of 100: Open, 5 outstanding), `tests/integration/goods-receipts-api.test.ts`. Close Early came with E11-S01, #90. E09-S02, #87.
- **Given:** PO 100, total GR 95
- **When:** Read status and outstanding
- **Then:** PO Open with 5 remaining unless explicitly Closed Early.

### BUY-015 — PO over-delivery permitted

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (110: `OVER_RECEIPT` with excess 10, Completed, outstanding 0, stock 110), `packages/app/src/components/goods-receipts/receipt-dialog.test.tsx`, `tests/integration/goods-receipts-api.test.ts`, `tests/integration/goods-receipts.test.ts` (warning shown, 0 outstanding). E09-S02, #87.
- **Given:** PO ordered 100, supplier delivers 110
- **When:** Post GR of 110
- **Then:** Warning surfaced, 110 physically accepted, PO completed and no negative outstanding.

### BUY-016 — Exact receipt completes PO

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (an exact receipt completes line and header), `tests/integration/goods-receipts-api.test.ts`, `tests/integration/goods-receipts.test.ts` (the last quantity completes it; no further receipt offered). E09-S02, #87.
- **Given:** PO ordered 100
- **When:** GR 100
- **Then:** PO line completed; header Completed when all lines complete.

### BUY-017 — PO closure after partial receipt

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The inventory half: `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (:244, "keeps what was received in stock…": a PO line of 100 kg with 60 received, Closed Early → received 60, abandoned 40, outstanding 0, no new movement and stock still 60; :227/:236: a later receipt on a Closed Early line is refused, `DOCUMENT_NOT_OPEN`), `tests/integration/document-lifecycle.test.ts` (:160: a PO of 10 with 3 received, Closed Early in the UI → received 3, abandoned 7, outstanding 0, stock unchanged). The remaining 40 dropping out of scheduled supply is MRP, slice 3 (#14). E11-S01, #90; E11-S04, #144.
- **Given:** PO line ordered 100, received 60
- **When:** Close Early
- **Then:** Remaining 40 no longer counted as scheduled supply; actual 60 remains in inventory.

### BUY-018 — Cancelled PR no planned supply

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/purchase-requisitions/purchase-requisition.service.test.ts` (an unconverted requisition is Cancelled, 100 abandoned, 0 outstanding, audited), `tests/integration/document-lifecycle.test.ts`. "Next MRP" is slice 3 (#14). E11-S01, #90.
- **Given:** PR 100 unconverted
- **When:** Cancel PR
- **Then:** No outstanding tentative supply counted in next MRP.

### BUY-019 — Overdue PO considered today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO due yesterday with 40 outstanding
- **When:** Run MRP today
- **Then:** Expected supply 40 allocated today with Overdue Supply warning, no actual GR posted.

### BUY-020 — Partially received PO supplier locked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/goods-receipts-api.test.ts` (a `supplier` PATCH on a received PO is 400 and the supplier stays), `packages/core/src/validators/purchasing/purchase-order.schema.test.ts`. E09-S02, #87.
- **Given:** PO with first receipt posted
- **When:** Attempt supplier edit
- **Then:** Edit rejected, previous supplier retained.

### BUY-021 — Partially received PO location locked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/goods-receipts-api.test.ts` (a `location` PATCH after a receipt is 400 and the location stays), `packages/db/src/entities/goods-receipts/goods-receipt.entity.test.ts` (receipt movements are immutable). E09-S02, #87.
- **Given:** PO at site A with first GR
- **When:** Attempt header location B
- **Then:** Rejected, prior stock movements stay associated with A.

### BUY-022 — Received PO line material/UoM locked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/goods-receipts-api.test.ts` (a received line's `material` or `unit` is 400, the line unchanged), `packages/core/src/validators/purchasing/purchase-order.schema.test.ts`. E09-S02, #87.
- **Given:** PO line A with GR posted
- **When:** Try change line to material B or different stored UoM
- **Then:** Reject line identity change; existing receipt cannot be reinterpreted.

### BUY-023 — PO quantity not below received

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/goods-receipts-api.test.ts` (quantity 79 on a line received 80 is 400; it stays 100). E09-S02, #87.
- **Given:** PO 100 already received 80
- **When:** Reduce ordered quantity to 79
- **Then:** Rejected, retains at least 80.

### BUY-024 — PO date editable after receipt

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** the non-MRP half is automated on both channels. API: `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (the planned date of a received Open order is editable and audited), `tests/integration/goods-receipts-api.test.ts` (PATCH 200 and the `purchase-orders.purchase-order.updated` entry). UI: `tests/integration/goods-receipts.test.ts` (Change date on a partly received line: the new date, received 4 and outstanding 6 unchanged, version +1, and an audit entry on the UI channel with the line's before and after), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (the version always advances). "Next MRP uses it" is slice 3 (#14). E09-S02, #87; E09-S04, #142.
- **Given:** PO partially received, remaining supply open
- **When:** Change planned delivery date of open amount
- **Then:** Allowed and audited; next MRP uses revised planned date.

### BUY-025 — Inactive supplier blocks new PO

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (`SUPPLIER_INACTIVE`; an earlier order stays readable and editable), `packages/core/src/services/suppliers/find-supplier.test.ts`, `tests/integration/purchasing-api.test.ts`. E09-S01, #86.
- **Given:** Supplier inactive
- **When:** Try create new PO with that supplier
- **Then:** Rejected; existing PO from earlier remains executable.

### BUY-026 — PR to PO supply not double counted

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PR 100 entirely converted to PO 100
- **When:** Run MRP with zero receipts
- **Then:** Incoming pipeline contribution is 100 planned, not 200.

## Production planning, execution & variance tracking

### PRD-001 — New production order pins exact BOM version

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (the order stores output, location, target and finish and pins the explicit BOM/revision pair), `tests/integration/production-orders.test.ts` (a normal user's token creates it; the answer carries `bom`/`revision` 1). E10-S01, #88.
- **Given:** Finished Make product has valid recipe revision 3
- **When:** Create manual production order
- **Then:** Order references BOM revision 3 explicitly; product, location, planned quantity and finish date saved.

### PRD-002 — Automatic BOM selection feasible

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (with 30 kg on hand, the priority-1 recipe needing 60 kg is passed over for the feasible priority-2 one; with no stock, priority 1 is preselected), `packages/app/src/components/production-orders/production-dialog.test.tsx`, `tests/integration/production-orders.test.ts` (the options select the feasible alternative). Feasibility is current physical stock at the location (spec Q1); projected supply is MRP, slice 3 (#14). E10-S01, #88.
- **Given:** Two valid alternatives, top one has projected components
- **When:** Create production order with default BOM selection
- **Then:** Highest-priority feasible revision preselected.

### PRD-003 — Manual BOM override allowed

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (the explicit priority-2 pair is kept), `packages/app/src/components/production-orders/production-dialog.test.tsx` ("keeps a manual lower-priority choice on creation"), `tests/integration/production-orders.test.ts` (a normal user picks the lower-priority recipe in the dialog and the order keeps it). E10-S01, #88.
- **Given:** Two date-valid BOMs with different priorities
- **When:** User chooses lower-priority BOM when creating order
- **Then:** Order uses selected active date-valid revision, not automatically overwritten.

### PRD-004 — Manual order allows component shortage

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (shortage 30 of 60 kg; the balance stays 30; no movement), `tests/integration/production-orders.test.ts` (the shortage is returned, stock unchanged, and the page shows "Component shortage"). E10-S01, #88.
- **Given:** Selected BOM requires 60 kg and physical stock 30 kg
- **When:** User creates manual production order
- **Then:** Order creation allowed with explicit shortage warning; no component consumption yet.

### PRD-005 — BOM validity checked on new order

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` ("refuses inactive, expired, future and superseded new recipes": `PRODUCTION_NO_USABLE_BOM` / `PRODUCTION_BOM_CHANGED`, nothing audited), `tests/integration/production-orders.test.ts` (a finish before every recipe and a superseded pair are refused). E10-S01, #88.
- **Given:** Active recipe not valid on planned completion date
- **When:** Attempt to create order referencing recipe
- **Then:** Creation rejected or valid alternative required.

### PRD-006 — Existing order survives BOM change

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (after revision 2 and deactivation the order keeps revision 1 and 2 kg), `packages/core/src/services/production-orders/production-completion.service.test.ts` (the completion preview still expects revision 1), `tests/integration/production-orders.test.ts` (the detail still shows revision 1 at 2.000000 after a BOM PATCH to 3 kg and deactivation). E10-S01/S02, #88, #89.
- **Given:** Order pins revision 1; admin creates revision 2 and deactivates old alternative
- **When:** Open original order
- **Then:** Pinned revision 1 still available for completion; recipe unchanged.

### PRD-007 — Planned start from lead time

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/production-orders/production-planning.test.ts` (calendar days across weekends, leap days and years), `packages/core/src/services/production-orders/production-order.service.test.ts` (5 days before 2026-10-15 is 2026-10-10), `tests/integration/production-orders.test.ts` (start 2026-10-10; a finish edit to the 16th moves it to the 11th). E10-S01, #88.
- **Given:** Make lead time 5 days, planned completion October 15
- **When:** Create order
- **Then:** Derived planned start October 10, respecting calendar days.

### PRD-008 — No capacity scheduling required

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` and `tests/integration/production-orders.test.ts` (two orders at one location on the same dates both save; there is no capacity check, N04). E10-S01, #88.
- **Given:** Two orders share same production dates at one location
- **When:** Save both
- **Then:** Orders can coexist; no machine/resource allocation required or enforced.

### PRD-009 — No stock at order creation

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (no stock movement or balance after creating orders), `tests/integration/production-orders.test.ts` (stock unchanged after creates and edits). MRP's projected requirements are slice 3 (#14). E10-S01, #88.
- **Given:** Material components currently unavailable
- **When:** Create future production order
- **Then:** No physical stock changes; planned projected requirements are reflected in MRP.

### PRD-010 — Production expected consumption prefill

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/production-orders/production-completion.test.ts` (0.5 × 4 = 2), `packages/core/src/services/production-orders/production-completion.service.test.ts` (the preview proposes 2 kg and 8 each), `packages/app/src/components/production-orders/completion-form.test.tsx` (each pinned component is pre-filled), `tests/integration/production-completions.test.ts` (the preview API; the dialog's rows start at 2 and 8). E10-S02, #89.
- **Given:** BOM per 1 each: 0.5 kg A, 2 each B
- **When:** Post completion for 4 finished each
- **Then:** Form proposes 2 kg A and 8 each B before edits.

### PRD-011 — Production partial completion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (bar +40, cocoa and wrapper fall by the actuals, three movements under one posting ID dated today), `tests/integration/production-completions.test.ts` (produced 40, outstanding 60, one posting group). E10-S02, #89.
- **Given:** Order planned 100, components available
- **When:** Post output 40 and actual components
- **Then:** 40 finished posted, component stock decreased by actual amounts, outstanding production 60.

### PRD-012 — Repeated partial completions

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (produced 65, both completions kept and listed newest first, `progressed` audit 0 → 40 → 65), `tests/integration/production-completions.test.ts` (outstanding 35). E10-S02, #89.
- **Given:** Order 100, first completion 40
- **When:** Post second completion 25
- **Then:** Actual produced 65, remaining target 35, prior postings preserved.

### PRD-013 — Actual consumption below BOM

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (18 kg consumed, variance −2.000000, audited), `packages/app/src/components/production-orders/completion-history.test.tsx`, `tests/integration/production-completions.test.ts` (variance −2.000000; cocoa down by 18); the variance report shows it: `packages/core/src/services/reports/variance-report.service.test.ts`, `tests/integration/variance-report.test.ts` (20 kg expected, 18 kg actual, −2 kg). E10-S02, #89; E13-S02, #95.
- **Given:** Expected ingredient 20 kg for 40 output
- **When:** Record 18 kg actual on completion
- **Then:** Only 18 kg consumed, variance −2 kg recorded and inventory decremented by 18.

### PRD-014 — Actual consumption above BOM

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (23 kg recorded as +3.000000 and consumed; the posted audit carries per-line expected, actual and variance), `packages/app/src/components/production-orders/completion-history.test.tsx` (signed variances shown); the variance report shows it: `packages/core/src/services/reports/variance-report.service.test.ts`, `tests/integration/variance-report.test.ts` (23 kg against 20 kg is +3 kg). E10-S02, #89; E13-S02, #95.
- **Given:** Expected ingredient 20 kg for 40 output; stock supports 23
- **When:** Record 23 kg actual
- **Then:** 23 kg consumed, variance +3 kg visible and audited.

### PRD-015 — Add extra raw input

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (an added raw input expects 0, is consumed and its variance recorded), `packages/app/src/components/production-orders/completion-form.test.tsx`, `tests/integration/production-completions.test.ts` (milk added in the dialog, stored `extra: true`); the variance report shows it: `packages/core/src/services/reports/variance-report.service.test.ts`, `tests/integration/variance-report.test.ts` (extra milk +2 kg). E10-S02, #89; E13-S02, #95.
- **Given:** Completion BOM lacks material X but raw X exists in stock
- **When:** Add 2 kg X to actual consumption
- **Then:** Extra material consumed and variance recorded, subject to stock validation.

### PRD-016 — Add extra intermediate input

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (an added intermediate input is consumed and tracked as extra), `packages/app/src/components/production-orders/completion-inputs.test.ts` (raw and intermediate materials are offered). E10-S02, #89.
- **Given:** Completion requires additional intermediate component not in BOM
- **When:** Post it as actual consumption
- **Then:** Additional intermediate consumption accepted and tracked.

### PRD-017 — Reject extra finished component

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a finished input is a field error on its row; nothing written), `tests/integration/production-completions.test.ts` (400 on `components.2.material`; stock and history unchanged). E10-S02, #89.
- **Given:** Completion attempt adds a finished good as component
- **When:** Submit
- **Then:** Rejected under component material type rules; no partial stock posting.

### PRD-018 — Zero-output waste

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (output 0: cocoa −10, produced unchanged, recorded as waste, order Open), `packages/app/src/components/production-orders/completion-history.test.tsx`, `tests/integration/production-completions.test.ts`; the variance report shows it: `packages/core/src/services/reports/variance-report.service.test.ts`, `tests/integration/variance-report.test.ts` (a zero-output posting counted as waste, 3 kg). E10-S02, #89; E13-S02, #95.
- **Given:** Open order and component A stock sufficient
- **When:** Post completion with output 0 and A consumed 10
- **Then:** A −10 physical, finished output unchanged, waste/variance recorded, order remains Open.

### PRD-019 — Overproduction warning but accept

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (95 + 10 is refused with `PRODUCTION_OVERPRODUCTION`, writing nothing; once accepted the order is 105 and Completed), `packages/app/src/components/production-orders/completion-form.test.tsx` ("warns past the target and posts only once the user accepts it"), `tests/integration/production-completions.test.ts`. E10-S02, #89.
- **Given:** Order planned 100 and produced 95
- **When:** Post completion output 10 with sufficient components
- **Then:** Warn output exceeds plan; if accepted, actual output 105 and order Completed.

### PRD-020 — Negative ingredient stock blocks completion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (stock 5, actual 6: `INSUFFICIENT_STOCK`, no output or input movement, produced unchanged), `tests/integration/production-completions.test.ts` (409; cocoa and history unchanged). E10-S02, #89.
- **Given:** Input A stock 5, actual consumption 6
- **When:** Post completion producing 10
- **Then:** Entire completion fails; neither finished goods nor input movements posted.

### PRD-021 — Atomic inputs plus output

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a short second input posts nothing for any material and leaves produced unchanged; a late audit failure rolls everything back). E10-S02, #89.
- **Given:** Completion uses input A and B and creates product C; B would go negative
- **When:** Try post all
- **Then:** No movement for A, B or C; order completion count unchanged.

### PRD-022 — Physical stock unchanged by planning

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (balances and movements unchanged by planning), `tests/integration/production-orders.test.ts`. E10-S01, #88.
- **Given:** Order created for 50 future finished units
- **When:** View inventory before any completion
- **Then:** Physical finished stock unchanged; MRP may account for planned output.

### PRD-023 — Post completion dated today

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (the completion and every movement are dated today against a later planned finish). E10-S02, #89.
- **Given:** Order planned finish next week
- **When:** Record actual completion today
- **Then:** Actual movement's business posting date is today, not future planned finish.

### PRD-024 — Production order partial edit locks recipe

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (output, location and recipe stay locked after a completion), `packages/core/src/validators/production-orders/production-order.schema.test.ts`, `tests/integration/production-orders.test.ts` (a PATCH naming output, location, BOM or revision is 400). E10-S01/S02, #88, #89.
- **Given:** Order has first completion posted
- **When:** Try change output material, site or BOM revision
- **Then:** All those identity changes rejected.

### PRD-025 — Production target may increase

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (with 10 produced, raising the target from 30 to 40 is audited before/after and leaves 30 outstanding). MRP's use of the outstanding quantity is slice 3 (#14). E10-S02, #89.
- **Given:** Order target 100, actual output 40
- **When:** Change target to 120
- **Then:** Change audited and MRP outstanding production becomes 80.

### PRD-026 — Production target cannot drop below actual

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (a target below produced is a `quantity` field error; target and produced unchanged). E10-S02, #89.
- **Given:** Order output 40 already posted
- **When:** Change planned target to 39
- **Then:** Rejected; target and actual posting unchanged.

### PRD-027 — Production planned finish editable

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (after a completion the finish moves and the start is recalculated from the captured lead time), `tests/integration/production-orders.test.ts` (the edit is audited). MRP is slice 3 (#14). E10-S02, #89.
- **Given:** Order partially completed
- **When:** Change remaining planned finish date
- **Then:** Edit allowed and audited; MRP uses updated date.

### PRD-028 — Past variance not extrapolated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order 100, produced 40 using twice normal BOM input
- **When:** Run MRP for remaining 60
- **Then:** Remaining component requirement based on recipe for 60, not inferred doubled consumption.

### PRD-029 — Close partial order early

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (100 with 40 produced → Closed Early: 40 kept, 60 abandoned, 0 outstanding), `packages/core/src/services/production-orders/production-order.service.test.ts` ("retains a 10-output completion and abandons only the remainder": produced kept, outstanding 0, no movement; "requires components for the outstanding quantity only…": 100 with 40 produced requires components for 60, then none once Closed Early), `tests/integration/document-lifecycle.test.ts` ("plans only the outstanding quantity…": the API detail and the page show the 160 still to make, then no requirement and no shortage warning after Close Early in the UI). The drop from MRP is slice 3 (#14). E11-S01, #90; E11-S04, #144.
- **Given:** Order 100 has 40 physically produced
- **When:** Close Early
- **Then:** 40 output remains; remaining planned output 60 and component need drop from MRP.

### PRD-030 — Completed order no unfinished requirement

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (exactly 100 → Completed), `packages/core/src/services/production-orders/production-order.service.test.ts` (target = produced → outstanding 0.000000, Completed), `packages/core/src/domain/production-orders/production-completion.test.ts`. The MRP run is slice 3 (#14). E10-S02, #89.
- **Given:** Order planned 100 and produced 100
- **When:** Run MRP
- **Then:** Order has zero outstanding finished output and component need.

## Physical inventory, postings & stock integrity

### INV-001 — Inventory balance starts zero

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (a pair with no movement reads exactly 0.000000 in its base unit; no balance row is created), `packages/app/src/app/admin/[tenant]/stock/page.test.tsx` (zero, empty ledger), `tests/integration/stock.test.ts` (the API reads 0.000000 each with an empty ledger). E07-S01, #80.
- **Given:** New material-location pair has no movement
- **When:** Query inventory
- **Then:** Physical on-hand is zero, not negative or undefined.

### INV-002 — Goods receipt increases only target material/site

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts`, `tests/integration/goods-receipts-api.test.ts` (steel at the plant rises; steel at the depot (7) and the bolt (0) are unchanged). E09-S02, #87.
- **Given:** Material A at location X on-hand 10
- **When:** Post GR +4 for A at X
- **Then:** A/X becomes 14; other material/site balances unchanged.

### INV-003 — Goods issue reduces only target stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (only the material at the order's location drops; the same material elsewhere is untouched; the movement is −20 with balance before/after), `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (stock and fulfilment move together). E08-S02, #84.
- **Given:** Material A at location X on-hand 10 and matching customer order
- **When:** Post GI for 3
- **Then:** A/X becomes 7; linked order fulfillment +3.

### INV-004 — Production posts both signs

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (inputs fall and output rises under one posting ID), `tests/integration/production-completions.test.ts` (one posting group). E10-S02, #89.
- **Given:** Raw input A 100, finished output F 0
- **When:** Complete production with actual A used 25 and F produced 10
- **Then:** A 75, F 10, same atomic posting group.

### INV-005 — No negative stock on GI

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (11 from 10 is `INSUFFICIENT_STOCK` with available 10 and requested 11; nothing written, no audit), `tests/integration/shipments-api.test.ts` (409; stock stays 10.000000, fulfilled 0). E08-S02, #84.
- **Given:** Goods issue requests 11 from 10 on-hand
- **When:** Attempt posting
- **Then:** Rejected with exact available/required context; on-hand stays 10.

### INV-006 — No negative stock on manual correction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (with 2 on hand, −3 is `INSUFFICIENT_STOCK` naming available 2; the balance stays 2 and no movement or audit is added; a group that dips below zero writes nothing), `packages/app/src/components/stock/correction-dialog.test.tsx`, `tests/integration/stock.test.ts` (API 409 with available/requested; the UI dialog shows the available quantity, also in Polish; stock and audit unchanged). E07-S01, #80.
- **Given:** Material on-hand 2
- **When:** Enter signed adjustment −3
- **Then:** Rejected; no inventory movement or business audit entry for committed stock change.

### INV-007 — Zero stock is permitted

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (an issue of 10 from 10 on hand leaves 0.000000, its movement −10.000000 from 10.000000 to 0.000000), `tests/integration/shipments-api.test.ts` (a goods issue of 10 from 10 is 200 and stock reads 0.000000), `packages/core/src/services/stock/stock.service.test.ts` (a group of +2, −1, −1 ends at exactly 0.000000), `tests/integration/stock.test.ts` (−24 from 24 reads 0.000000). E07-S01, #80; E08-S06, #188.
- **Given:** Material on-hand 10
- **When:** Post valid issue of exactly 10
- **Then:** Remaining stock exactly zero.

### INV-008 — Negative projected stock differs from actual

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/mrp/mrp-run.service.test.ts` (physical 5, firm demand 20: −15 projected before replenishment, the balance still 5, and no other tenant-owned row changed), `tests/integration/mrp-run-api.test.ts` (the same through the API: the latest run shows −15.000000, the stock report 5.000000). #273, E14-S02, #274.

- **Given:** Actual on-hand 5 and future firm demand 20
- **When:** Run MRP
- **Then:** MRP may show −15 projected before replenishment, while on-hand stays 5.

### INV-009 — Transfer in-transit not physical

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (after a dispatch, A is lower, B is 0 and the quantity is in transit on the transfer), `tests/integration/transfers-api.test.ts`, `tests/integration/transfers.test.ts` (the Stock page shows transit apart), `packages/core/src/services/reports/stock-report.service.test.ts`, `tests/integration/stock-report.test.ts` and `tests/integration/stock-report-api.test.ts` (100 kg at the plant, 30 kg dispatched and not received: plant 70 on hand, depot 0 on hand, 30 in transit). E07-S03, #82; E13-S01, #94.
- **Given:** Site A physical 100, site B 0
- **When:** Dispatch transfer 30 without receipt
- **Then:** A physical 70, B physical 0, transfer in-transit 30.

### INV-010 — Daily posting not backdated

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` and `tests/integration/goods-receipts-api.test.ts` (a PO planned 2026-10-13: the receipt and its movement are dated today, the planned date kept), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (the issue and its movement are dated today; the order's required date is kept), `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (a correction sent with a 1900 or 2099 date posts today, UTC), `packages/app/src/app/api/tenants/[tenant]/transfers/[id]/dispatches/route.test.ts` (a client date is ignored). E07-S01, #80; E07-S03, #82; E08-S02, #84; E09-S02, #87.
- **Given:** Today's business date set by runtime, planned document dated last week
- **When:** Post actual GR
- **Then:** Movement uses today's date; planned document date stays last week.

### INV-011 — Cannot future-date goods issue

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/goods-issues/goods-issue.schema.test.ts` (a client date is dropped), `packages/core/src/services/goods-issues/goods-issue.service.test.ts`, `tests/integration/shipments-api.test.ts` (a sent `businessDate` of 2099-01-01 is ignored; the issue and its movement are dated today), `tests/integration/stock.test.ts` (a 2099 date on a correction posts today). E07-S01, #80; E08-S02, #84.
- **Given:** User tries to enter future actual-posting date
- **When:** Submit actual GI
- **Then:** System posts only with today's business date; no future-dated ledger entry.

### INV-012 — All stock movements have source

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/movement-sources.test.ts` (a correction, goods receipt, goods issue, transfer dispatch and receipt, and production completion each name their source document), `packages/app/src/app/admin/[tenant]/stock/page.test.tsx` (the ledger shows date, signed quantity, type, linked source, actor and factor), `tests/integration/stock-report.test.ts` (the ledger drill-down: a −30 kg transfer dispatch linked to its transfer, the correction its own source), `tests/integration/stock-report-api.test.ts`, `tests/integration/goods-receipts-api.test.ts` (the movement is `type: goods-receipt`, with a reason naming the receipt and the PO). E07-S01, #80; E09-S02, #87; E13-S01, #94.
- **Given:** Post GR, GI, completion and manual correction
- **When:** Inspect stock ledger
- **Then:** Each movement shows material, site, date, signed BUoM quantity, type and source document.

### INV-013 — Stock ledger is separate from audit

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (the movement carries quantity and reason; a separate tenant-audit entry has actor, session and before/after), `tests/integration/stock.test.ts` (the API audit shows before 0 / after 24 with the token). E07-S01, #80.
- **Given:** Stock adjustment changes balance
- **When:** Read ledger and audit
- **Then:** Ledger shows quantity movement and reason; audit shows who changed which records with before/after.

### INV-014 — Manual correction requires reason

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/stock/stock-correction.schema.test.ts` (empty, blank or over 500 characters refused), `packages/core/src/services/stock/stock.service.test.ts` (a blank reason is `VALIDATION_FAILED`, nothing written), `packages/app/src/components/stock/correction-dialog.test.tsx`, `tests/integration/stock.test.ts` (400; stock and audit unchanged). E07-S01, #80.
- **Given:** Normal user opens adjustment on stocked material
- **When:** Submit adjustment without reason
- **Then:** Validation prevents posting until nonempty reason supplied.

### INV-015 — Both roles can adjust stock

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock.test.ts` (the admin's and a normal user's tokens each post; the audit names each account; a UI post records the UI channel and session), `packages/app/src/app/admin/[tenant]/stock/actions.test.ts`. E07-S01, #80.
- **Given:** Normal user and admin have valid logins
- **When:** Each posts a valid adjustment
- **Then:** Both succeed with proper attribution and correct balance.

### INV-016 — Opening balance uses ordinary posting

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (an "Opening balance" on a zero Prod pair is an ordinary `correction` with before 0 and an audit entry), `packages/core/src/services/imports/stock-import.service.test.ts` and `tests/integration/stock-import-api.test.ts` (an opening workbook posts an ordinary +100 correction with the reason and audit). E07-S01, #80; E07-S02, #81.
- **Given:** Prod empty; A/X on-hand 0
- **When:** User records +100 with reason Opening Balance
- **Then:** On-hand 100 with inventory movement +100 and audit, not silent balance injection.

### INV-017 — Customer physical return as adjustment

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock.test.ts` (a normal user's +0.5 "Physical customer return" correction raises 24 to 24.5), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (after a fulfilled order, the reasoned return correction raises stock and leaves the order's fulfilled quantities unchanged). E07-S01, #80; E08-S04, #140.
- **Given:** Fulfilled customer sale and product returned to warehouse
- **When:** Post positive inventory correction with reason
- **Then:** Physical stock increases, original customer order fulfilled amount unchanged.

### INV-018 — Physical balances tenant-local

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (with the same IDs in both tenants, +7 in Test leaves Prod at 0.000000 with no Prod audit), `tests/tenant-ownership.test.ts`. E07-S01, #80.
- **Given:** Test and Prod each have same material/location IDs
- **When:** Post movement in Prod only
- **Then:** Test balance unchanged; separate movement-ledger/audit event.

### INV-019 — Invalid material reference

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (`MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND`; no balance, movement or audit), `tests/integration/stock.test.ts` (a Test correction naming a Prod-only material is refused; Prod is unchanged). E07-S01, #80.
- **Given:** Material ID absent in selected tenant
- **When:** Submit inventory movement
- **Then:** Rejected by referential integrity; no ledger or on-hand changes.

### INV-020 — Inactive location blocks new business posting

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (an inactive location or material is refused, also when cached), `tests/integration/stock.test.ts` (`LOCATION_INACTIVE` after deactivation), `packages/app/src/app/admin/[tenant]/stock/page.test.tsx`, `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (a receipt at a location deactivated since the order is `LOCATION_INACTIVE` and writes nothing), `packages/core/src/services/customer-orders/customer-order.service.test.ts` (a new order at an inactive location is `LOCATION_INACTIVE`), `tests/integration/forecasts-api.test.ts` (an inactive location in a new forecast is 409 `LOCATION_INACTIVE`). E07-S01, #80; E08-S01, #83; E08-S03, #85; E09-S02, #87.
- **Given:** Site inactive, no active documents
- **When:** Try new inventory receipt or order at inactive site
- **Then:** New operation cannot select inactive site.

### INV-021 — Physical stock never below zero in race

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (two ORMs withdraw the same stock: one commits, the other is `INSUFFICIENT_STOCK`, balance 0), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (two connections race on the same stock: one commits), `tests/integration/shipments-api.test.ts` (two concurrent issues of 7 on 10: statuses 200 and 409, stock 3.000000, one goods issue). E07-S01, #80; E08-S02, #84.
- **Given:** Stock 10, two concurrent sessions each issue 7
- **When:** Post both near-simultaneously
- **Then:** At most one commits; no balance −4 or two successful GI movements.

### INV-022 — Read-only blocks physical stock changes

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock.test.ts` (both roles get `TENANT_READ_ONLY`; a form opened before the flag is refused; stock unchanged), `tests/integration/goods-receipts-api.test.ts`, `tests/integration/shipments-api.test.ts`, `tests/integration/production-completions.test.ts`. E07-S01, #80; E08-S02, #84; E09-S02, #87; E10-S02, #89.
- **Given:** Tenant flag read-only
- **When:** Post otherwise valid receipt, issue and adjustment
- **Then:** All rejected with no movements.

### INV-023 — Stock calculations BUoM only

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (2 case at 12 each posts +24.000000 each, keeping the entered quantity, unit and factor). A goods receipt in another unit: `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (:151: 0.025 t received posts a +25.000000 kg movement, keeping 0.025 t and the factor), `tests/integration/goods-receipts-api.test.ts` (:107–111: a receipt of 0.02 t raises the steel balance by 20.000000 kg), `packages/core/src/services/goods-receipts/receipt-reversal.test.ts` (a receipt's reversal takes back the base quantity it captured, even after the conversion is removed). E07-S01, #80; E09-S02, #87; E11-S02, #91.
- **Given:** Input quantity 2 cases, factor 12 each per case
- **When:** Post valid receipt
- **Then:** Movement amount is +24 each and query shows BUoM authority.

### INV-024 — Purchase order expected, goods receipt physical

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("leaves stock untouched until a receipt posts, then raises it exactly once": no balance, then 40 and one movement), `tests/integration/goods-receipts-api.test.ts`. E09-S02, #87.
- **Given:** PO 100 exists with delivery date and no goods receipt
- **When:** Inspect on-hand, then post valid GR for 40
- **Then:** Physical stock stays unchanged before GR then increases by 40 exactly once; PR/PO do not create an incoming-shipment document.

### INV-025 — Physical stock updated once per completion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (exactly the three movements; a repeated submission posts once), `tests/integration/production-completions.test.ts` (key replay; balances moved once). E10-S02, #89.
- **Given:** Same production completion posted successfully once
- **When:** Inspect all affected stock balances
- **Then:** Input and output movements equal exactly actual once, no duplicate from status update or reporting.

## Corrections and reversible physical postings

### REV-001 — Goods receipt single-line reversal

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (−100 dated today, the receipt line `reversedBy`, stock restored; :118: an operator reverses a 30-each receipt from its PO's page in the browser, stock back to its pre-receipt amount, the line `reversedBy`, the order Open again), `packages/core/src/services/goods-receipts/receipt-reversal.test.ts`. E11-S02, #91; E11-S04, #144 (PR #178).
- **Given:** GR line posted +100, at least 100 stock remains
- **When:** Reverse original GR line with reason
- **Then:** One −100 movement posted today, linked original marked reversed, stock restored to pre-GR amount.

### REV-002 — GR reversal blocked by insufficient stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (100 received, 20 left → 409 `INSUFFICIENT_STOCK`, stock unchanged), `packages/core/src/services/goods-receipts/receipt-reversal.test.ts`, `packages/core/src/services/stock/stock-posting.test.ts`. E11-S02, #91.
- **Given:** GR line +100, only 40 remains after other operations
- **When:** Try full reversal
- **Then:** Rejected; GR remains active, no partial −40 movement inserted.

### REV-003 — GI line reversal restores stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (a normal user reverses an 80 issue in the UI: stock +80, fulfilled 0, order and shipment Open), `packages/core/src/services/goods-issues/issue-reversal.test.ts`. E11-S02, #91.
- **Given:** GI line −20 already fulfilled customer order
- **When:** Reverse entire line with reason
- **Then:** Inventory +20 and fulfilled customer line −20; order lifecycle recalculated atomically.

### REV-004 — Other GR lines unaffected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/receipt-reversal.test.ts` (a two-line receipt; reversing line 1 leaves line 2's movement and received unchanged). E11-S02, #91.
- **Given:** Multi-line GR A/B/C, B wrong
- **When:** Reverse entire B posting
- **Then:** A/C movement and received quantities unchanged; B fully reversed.

### REV-005 — Other GI lines unaffected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/issue-reversal.test.ts` (two issued lines in one shipment: only line 1's stock and fulfilment change). E11-S02, #91.
- **Given:** Two issued lines in one shipment
- **When:** Reverse one issued line
- **Then:** Only that material/line stock and fulfillment change.

### REV-006 — Partial mistaken GR corrected via two postings

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (reverse a +100 receipt, post a corrected receipt of 90; the original keeps 100, linked to its −100). E11-S02, #91.
- **Given:** GR line originally +100 but should have been +80
- **When:** Reverse full 100 and post corrected +80
- **Then:** Final net movement +80, historical +100/−100/+80 independently visible.

### REV-007 — Double reversal rejected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` and `tests/integration/production-transfer-reversals.test.ts` (a second reversal under a new key is `…_ALREADY_REVERSED` naming the existing one), `packages/core/src/services/stock/stock-reversal.service.test.ts`, `packages/core/src/services/transfers/transfer.service.test.ts`, `packages/db/src/entities/stock/stock-reversal.entity.test.ts` and `packages/db/src/entities/transfers/transfer-reversal.entity.test.ts` (unique indexes). E11-S02/S03, #91, #92.
- **Given:** Posting already reversed once
- **When:** Attempt second reversal of original posting
- **Then:** Rejected; no second compensating movement created.

### REV-008 — Reversal requires reason

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock-reversal.service.test.ts` (a blank reason is `VALIDATION_FAILED`, nothing written), `packages/core/src/services/production-orders/production-completion.service.test.ts` and `packages/core/src/services/transfers/transfer.service.test.ts` (bad input refused). E11-S02/S03, #91, #92.
- **Given:** Valid unreversed GI/GR line
- **When:** Submit reversal with empty reason
- **Then:** Validation rejects; nothing changed.

### REV-009 — Reversal dated today only

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock-posting.test.ts` (an original dated 2026-01-01 reversed on 2026-02-02 gets that date; the original keeps its own), `tests/integration/stock-reversals.test.ts` (the inverse is dated today). E11-S02, #91.
- **Given:** Original receipt posted last month
- **When:** Reverse it today
- **Then:** Reversal movement date today, original unchanged; both dates visible.

### REV-010 — Manual adjustment reversal

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock-reversal.service.test.ts` (±5 corrections reversed once, linked, balance restored), `tests/integration/stock-reversals.test.ts` (UI reversal of a −2 correction at 360 px). One line of a multi-line posting reversed alone, once, the others untouched: an imported correction (`packages/core/src/services/imports/stock-import.service.test.ts` :243) and a seeded opening balance (`stock-reversal.service.test.ts` :50); a second attempt is `STOCK_ALREADY_REVERSED`. E11-S02, #91; E11-S04, #144 (PR #178).
- **Given:** Adjustment −5 or +5 previously posted
- **When:** Reverse with valid reason and sufficient stock
- **Then:** Inverse quantity posted once, linked to original, balance correctly restored.

### REV-011 — Production completion full reversal

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (+10 F / −25 A / −15 B → F −10, A +25, B +15 in one group, produced −10), `tests/integration/production-transfer-reversals.test.ts`. The variance report leaves a completion reversed through the product out of every figure and lists it as reversed: `packages/core/src/services/reports/variance-report.service.test.ts`, and end to end in `tests/integration/production-transfer-reversals.test.ts` (#145). E11-S03, #92.
- **Given:** Completion +10 finished F and −25 A/−15 B; F stock at least 10
- **When:** Reverse completion
- **Then:** F −10, A +25, B +15 atomically; completion/order produced amount decremented.

### REV-012 — Production reversal output check

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (9 of 10 available → `INSUFFICIENT_STOCK`, nothing changes), `tests/integration/production-transfer-reversals.test.ts` (24 of 25: stock and produced unchanged). E11-S03, #92.
- **Given:** Completion +10 F, only 9 F now physically available
- **When:** Request reversal
- **Then:** Rejected before any component is returned or order quantities changed.

### REV-013 — Production zero-output waste reversal

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a waste completion: only the inputs return; the output and the original posting unchanged). E11-S03, #92.
- **Given:** Waste-only posting F +0, A −10
- **When:** Reverse it
- **Then:** A restored +10; finished output remains unchanged; historic waste posting preserved.

### REV-014 — One partial completion reversal leaves others

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts`, `tests/integration/production-transfer-reversals.test.ts` (completions of 40 and 25 on a target of 50: reversing the 25 leaves 40, 10 outstanding, Completed → Open; the variance report then counts only the 40, its 20 kg and 80 wrappers, and lists the 25 under `reversed`). Also `packages/core/src/services/reports/variance-report.service.test.ts` (#145). E11-S03, #92.
- **Given:** Production order has completion 40 and completion 25
- **When:** Reverse completion 25 only
- **Then:** Only corresponding actual movements reversed; output 40 remains and planned outstanding recalculated.

### REV-015 — Reversal recomputes document state

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/stock-reversals.test.ts` and `packages/core/src/services/goods-issues/issue-reversal.test.ts` (a Completed order → Open with the quantity outstanding again). Availability to MRP is slice 3 (#14). E11-S02, #91.
- **Given:** Customer order Completed after full GI
- **When:** Reverse final issued line
- **Then:** Order reverts to Open if amount outstanding; new demand available to subsequent MRP.

### REV-016 — PO receipt reversal recomputes received amount

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/receipt-reversal.test.ts` (a Completed PO → Open with only the reversed line reduced; an over-receipt stays Completed; an explicitly Closed Early PO stays closed), `tests/integration/stock-reversals.test.ts`. E11-S02, #91.
- **Given:** PO Completed after receiving 100
- **When:** Reverse GR line for 30
- **Then:** PO received 70, outstanding 30 and status Open (unless explicitly closed).

### REV-017 — Reversal respects tenant read-only

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (read-only refusal in the open dialog and through the API), `tests/integration/production-transfer-reversals.test.ts`, `packages/core/src/services/stock/stock-reversal.service.test.ts` (rechecked inside the transaction), `packages/core/src/services/transfers/transfer.service.test.ts`. E11-S02/S03, #91, #92.
- **Given:** Tenant is read-only, physical posting exists
- **When:** Attempt reversal
- **Then:** Rejected like other business writes, original posting and balances unchanged.

### REV-018 — Production reversal is atomic across components

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a short output refuses before any leg; an audit failure after the flush rolls back every leg, link and the order), `tests/integration/production-transfer-reversals.test.ts`. E11-S03, #92.
- **Given:** Reversal would require finished stock not available
- **When:** Attempt reversal despite input balances being valid
- **Then:** No finished stock movement, input restoration or document update takes effect.

### REV-019 — API duplicate reversal prevented

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` and `tests/integration/production-transfer-reversals.test.ts` (the same key replays byte-identical; a new key is `…_ALREADY_REVERSED`), `packages/core/src/services/stock/stock-reversal.service.test.ts` (keyed commit and replay, stale-snapshot race), `packages/core/src/services/transfers/transfer.service.test.ts` (racing reversals). E11-S02/S03, #91, #92.
- **Given:** Reversal request successfully executed and client retries same key
- **When:** Retry identical payload
- **Then:** Original response returned, no duplicate inverse posting; a distinct key attempting second reversal is also rejected.

### REV-020 — Audit ties correction to original

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit-history.test.ts` (a UI correction and its reversal are linked both ways, "Reversed by" / "Reverses", each with the reason, before/after, channel and session, in EN and PL), `packages/core/src/services/audit/audit-history.test.ts`, `packages/app/src/components/audit/audit-table.test.tsx`, `packages/core/src/services/stock/stock-reversal.service.test.ts`. E11-S02, #91; E13-S03, #96.
- **Given:** Two linked original/reversal ledger postings exist
- **When:** View user audit trail
- **Then:** Both operations and original-reversal relationship visible, with reason and before/after.

### REV-021 — Rare full reversal with reversible temporary stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (+100, issue 80, a temporary +80, reverse the −100, post +90, reverse the temporary correction: exactly 10, no step negative). E11-S02, #91.
- **Given:** Original GR +100, downstream GI 80, stock 20; true GR should have been +90
- **When:** Adjust stock temporarily +80 with reason, reverse original GR −100, post corrected GR +90, reverse temporary adjustment −80
- **Then:** Final stock is 10, matching correct historical net. All ledger postings/reversals remain auditable, no step negative and no temporary +80 left unbalanced.

## Location transfers, in-transit balances & exceptions

### TRF-001 — Transfer requires two physical locations

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (saved Open with source, destination and planned dates, audited), `packages/app/src/components/transfers/transfer-form.test.tsx`, `tests/integration/transfers-api.test.ts`, `tests/integration/transfers.test.ts`. E07-S03, #82.
- **Given:** Two active locations A/B and material M
- **When:** Create transfer from A to B with planned dates and quantity
- **Then:** Single-material transfer saved with source/destination and expected dates.

### TRF-002 — Transfer single material

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/transfers/transfer.schema.test.ts` (a second material is refused), `packages/app/src/app/api/tenants/[tenant]/transfers/route.test.ts`, `tests/integration/transfers-api.test.ts` (400 on `materials`/`lines`; nothing created). E07-S03, #82.
- **Given:** Two materials M/N intended to move
- **When:** Attempt to put both in one transfer document
- **Then:** Must create separate transfer documents; no multi-material transfer.

### TRF-003 — Transfer creation no physical effect

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts`, `tests/integration/transfers-api.test.ts`, `tests/integration/transfers.test.ts` (A stays 100, B 0, no movement). The MRP clause is slice 3 (#14). E07-S03, #82.
- **Given:** Source A on-hand 100, target B on-hand 0
- **When:** Create planned transfer 50
- **Then:** A and B physical balances unchanged; MRP may schedule proposed dispatch/arrival.

### TRF-004 — Partial dispatch adds in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (dispatch 60 of 100: A −60, B unchanged, transit 60, undispatched 40), `packages/core/src/domain/transfers/transfer-quantity.test.ts`, `tests/integration/transfers-api.test.ts`, `tests/integration/transfers.test.ts`. E07-S03, #82.
- **Given:** Transfer 100, source stock 100
- **When:** Post goods issue 60
- **Then:** A decreases 60, B unchanged, in-transit +60, undispached balance 40.

### TRF-005 — Further dispatch of outstanding

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a further 40: dispatched 100, transit 100, undispatched 0), `tests/integration/transfers-api.test.ts`. E07-S03, #82.
- **Given:** Transfer 100, dispatched 60, source remaining sufficient
- **When:** Post additional dispatch 40
- **Then:** Total dispatched 100, in-transit 100 until receipts; undispached 0.

### TRF-006 — Partial destination receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (receive 50 of 60: B +50, transit 10, A unchanged), `tests/integration/transfers-api.test.ts`, `tests/integration/transfers.test.ts`. E07-S03, #82.
- **Given:** Transfer has in-transit 60
- **When:** Post destination receipt 50
- **Then:** Destination increases 50, in-transit decreases to 10; source remains unchanged.

### TRF-007 — Cannot receive more than dispatched

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (11 more is `TRANSFER_OVER_RECEIPT`; B and transit unchanged), `packages/core/src/domain/transfers/transfer-quantity.test.ts`, `tests/integration/transfers-api.test.ts` (409). E07-S03, #82.
- **Given:** Transfer dispatched 60 and received 50
- **When:** Try destination receipt 11
- **Then:** Rejected; in-transit remains 10, no destination stock added.

### TRF-008 — Cannot dispatch more than source physical stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (source 15, dispatch 20: `INSUFFICIENT_STOCK` naming 15; source, transit and postings unchanged; a racing pair can't overdraw), `tests/integration/transfers-api.test.ts`. E07-S03, #82.
- **Given:** Source currently 15, transfer outstanding 40
- **When:** Post dispatch 20
- **Then:** Rejected; source stock remains nonnegative and in-transit unchanged.

### TRF-009 — Transfer can be partially dispatched

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (dispatching all 60 the source holds of 100 leaves 40 undispatched and the transfer Open), `tests/integration/transfers-api.test.ts`. E07-S03, #82.
- **Given:** Source has 60, planned transfer 100
- **When:** Post dispatch 60
- **Then:** Allowed; 40 remains undispatched and transfer stays Open.

### TRF-010 — In-transit not available at source

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (with 60 in transit, a correction beyond A's 40 is refused), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (an issue can't use stock in transit), `tests/integration/transfers-api.test.ts`. E07-S03, #82; E08-S02, #84.
- **Given:** Material 60 in-transit from A to B
- **When:** Attempt new GI from A exceeding remaining physical stock
- **Then:** Reject despite transfer's in-transit quantity.

### TRF-011 — In-transit not available at destination

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` ("can't consume stock still in transit": consuming at B with 60 in transit is `INSUFFICIENT_STOCK` with available 0 until the receipt), `packages/core/src/services/transfers/transfer.service.test.ts`, `tests/integration/transfers-api.test.ts`. E07-S03, #82; E10-S02, #89.
- **Given:** B physical 0, transfer has 60 in-transit
- **When:** Try production consumption 5 at B
- **Then:** Rejected until destination goods receipt posted.

### TRF-012 — Transfer cannot close with transit

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (TRF-012: 60 dispatched and 50 received, Close Early is the 409 `TRANSFER_IN_TRANSIT` naming 10.000000 kg, and the transfer and its audit don't change; also 60 dispatched with nothing received names 60 kg), `tests/integration/document-lifecycle.test.ts` (TRF-012: a 60 kg transfer dispatched 60 and received 50 through the API; the Close Early dialog shows "10 kg still in transit", refuses with "Receive or write off the 10.000000 kg still in transit first." at 390 px, and the transfer stays Open with 10 in transit). E11-S01, #90; #190.
- **Given:** Transfer dispatched 60, received 50, transit 10
- **When:** Request Closed Early
- **Then:** Rejected with 10 remaining in transit.

### TRF-013 — Write-off lost transit quantity

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a write-off of 10 with a reason: transit 0, no location change, audited), `packages/app/src/app/api/tenants/[tenant]/transfers/[id]/write-offs/route.test.ts`, `tests/integration/transfers-api.test.ts` (audit channel api), `tests/integration/transfers.test.ts`. E07-S03, #82.
- **Given:** Transfer in-transit 10, missing 10
- **When:** Post dedicated transfer write-off 10 with reason
- **Then:** In-transit becomes 0; reason, source and audit recorded.

### TRF-014 — Write-off not generic inventory adjustment

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` and `tests/integration/transfers-api.test.ts` (a correction naming a `transfer` is 400 on that field; stock unchanged), `packages/core/src/domain/imports/prepare-stock-import.test.ts` (a transit column in a workbook is refused, pointing to the write-off). E07-S02/S03, #81, #82.
- **Given:** Transfer has 10 in transit
- **When:** Try ordinary per-location inventory correction on in-transit
- **Then:** Rejected; use dedicated transfer write-off/reversal.

### TRF-015 — Close Early after clearing in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (100 planned, 60 dispatched, 50 received, 10 written off: Closed Early with 50 abandoned, transit 0; postings and stock unchanged), `tests/integration/document-lifecycle.test.ts`. E11-S01, #90.
- **Given:** Transfer planned 100, dispatched 60, received 50, lost 10 written off
- **When:** Close Early
- **Then:** Allowed with status Closed Early because 10 were written off and 40 never dispatched. In-transit stays zero and postings remain; not Completed.

### TRF-016 — Overdue transfer arrival in MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Dispatched 30, originally due yesterday, not yet received
- **When:** Run MRP
- **Then:** Expected destination supply today, Overdue Transfer warning, destination physical stock still unchanged.

### TRF-017 — Insufficient planned source transfer stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer plans 100 but source projected only 60 at dispatch
- **When:** Run MRP
- **Then:** Insufficient Transfer Stock exception; do not assume full 100 destination supply or auto-change transfer.

### TRF-018 — No automatic transfers

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Deficit at B and stock surplus at A
- **When:** Run MRP auto-create
- **Then:** No transfer order created automatically.

### TRF-019 — Reverse destination receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a reversed receipt: destination −50, transit +50, linked and audited, once only), `tests/integration/production-transfer-reversals.test.ts` (through the API, and by a normal user in the UI ledger). E11-S03, #92.
- **Given:** Transfer receipt 50 already at destination, destination stock sufficient
- **When:** Reverse receipt in full
- **Then:** Destination −50 and in-transit +50, linked reversal and audit.

### TRF-020 — Source dispatch reversal blocked by downstream receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a dispatch reversal waits for receipts and write-offs, also across two dispatches), `tests/integration/production-transfer-reversals.test.ts` (`TRANSFER_REVERSAL_ORDER` with 50 received; the UI hint "Reverse receipts and write-offs first"). E11-S03, #92.
- **Given:** Transfer dispatched 60 and received 50
- **When:** Attempt source GI reversal directly
- **Then:** Reject until destination receipt (and any write-off) is reversed first.

### TRF-021 — Source dispatch reversal after downstream unwound

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts`, `tests/integration/production-transfer-reversals.test.ts` (after the receipt and write-off are reversed, the dispatch reversal restores 60 at the source, transit 0). E11-S03, #92.
- **Given:** Transfer dispatched 60, destination receipt and write-off correctly reversed
- **When:** Reverse source issue
- **Then:** In-transit decreases by original dispatch amount, source physical stock restored; no negative balances.

### TRF-022 — Transfer cannot mix tenants

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a Test transfer to a Prod-only location is `LOCATION_NOT_FOUND`; neither tenant changes), `tests/integration/transfers-api.test.ts`. E07-S03, #82.
- **Given:** A in Test, B in Prod
- **When:** Attempt transfer A→B
- **Then:** Cross-tenant reference rejected; neither tenant's inventory changes.

### TRF-023 — Transfer plan and actual dates separate

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (dated today; planned dates kept), `packages/app/src/app/api/tenants/[tenant]/transfers/[id]/dispatches/route.test.ts` (a client date is ignored), `tests/integration/transfers-api.test.ts`. E07-S03, #82.
- **Given:** Transfer planned yesterday but physically dispatched today
- **When:** Post dispatch
- **Then:** Movement dated today; original planned date retained for reports/overdue logic.

### TRF-024 — Transfer stock ledger traceable

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (legs: −60 at the source, +60 transit, −50 transit, +50 at the destination), `packages/app/src/app/admin/[tenant]/transfers/[id]/page.test.tsx`, `tests/integration/transfers-api.test.ts` (movements carry the posting ID and the transfer), `tests/integration/transfers.test.ts`. E07-S03, #82.
- **Given:** Transfer issued 60 and received 50
- **When:** Inspect ledger at A, transit, B
- **Then:** Shows −60 source, +60 transit, −50 transit, +50 destination with common transfer source.

### TRF-025 — Lost quantity resolves as Closed Early

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (fully dispatched with the loss written off, the last receipt leaves it Open, never Completed; Close Early makes it Closed Early), `tests/integration/document-lifecycle.test.ts` (60 dispatched, 55 received, 5 written off: Open with nothing in transit, then Closed Early in the UI), `tests/integration/production-transfer-reversals.test.ts`. E07-S03, #82; E11-S01, #90; #190.
- **Given:** Planned transfer 60 was fully dispatched, 55 received at destination and 5 lost with linked write-off
- **When:** Close transfer with zero in transit
- **Then:** Transfer closes as Closed Early rather than Completed, even though every dispatched unit is accounted for.

### TRF-026 — Transfer distinct sites and chronological dates

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/transfers/transfer.schema.test.ts`, `packages/app/src/components/transfers/transfer-form.test.tsx`, `packages/core/src/services/transfers/transfer.service.test.ts`, `tests/integration/transfers-api.test.ts` (A to A, or arrival before dispatch, refused on create and edit; the transfer unchanged). E07-S03, #82.
- **Given:** User proposes transfer from site A to A, or planned arrival earlier than planned dispatch
- **When:** Validate transfer creation or edit
- **Then:** Reject same-source destination and planned arrival-before-dispatch, leaving previous document unchanged.

### TRF-027 — Write-off reversal can reopen previously closed transfer

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (a reversed write-off puts the loss back in transit, reopens a Closed Early transfer and resets abandoned), `tests/integration/production-transfer-reversals.test.ts`. E11-S03, #92.
- **Given:** Transfer Closed Early after loss was written off and transit reached zero
- **When:** Reverse linked write-off with valid reason
- **Then:** Lost amount returns to in-transit and transfer status automatically recalculates to Open; it cannot remain closed with stock in transit.

## Demand forecast, safety stock & firm-order prioritization

### DEM-001 — Forecast no customer dimension

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/forecasts/forecast.service.test.ts` (a forecast stores material, location, day and the base-unit quantity, converted from the unit it was entered in, and has no customer), `packages/core/src/validators/forecasts/forecast.schema.test.ts`, `packages/app/src/components/forecasts/add-forecast-dialog.test.tsx` (the Add form has no customer field), `tests/integration/forecasts-api.test.ts` (the stored forecast is exactly material, location, date, quantity and version) and `tests/integration/forecasts.test.ts` (forecasts added in the UI list their quantity per day). E08-S03, #85.
- **Given:** Forecast for material M, site L, date D
- **When:** Create forecast record
- **Then:** Material/site/day/qty/UoM retained; customer not needed.

### DEM-002 — Forecast and order same day net demand

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (an order on the forecast's day, and per D08 one later in its month, leaves 40 of 100). The demand review shows it (#240); MRP's run is #14.
- **Given:** Forecast M/L/D=100; customer order M/L/D=60
- **When:** Run MRP
- **Then:** Total demand 100, decomposed 60 firm plus 40 residual forecast.

### DEM-003 — Firm orders greater than forecast

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (orders of 120 against 100 leave a residual of zero, never negative). MRP's 120 firm demand is #14.
- **Given:** Forecast 100 and orders 120 same M/L/D
- **When:** Run MRP
- **Then:** Total demand 120 firm, residual forecast zero, not 220.

### DEM-004 — No order leaves forecast

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (no order leaves the whole 100) and `packages/core/src/services/reports/demand-review.service.test.ts` (the forecast left, per bucket). MRP's run is #14.
- **Given:** Forecast 100 and no customer order matching
- **When:** Run MRP
- **Then:** Demand 100 forecast.

### DEM-005 — Forecast isolated by material

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (an order of another material consumes nothing). MRP's run is #14.
- **Given:** Forecast A 100, customer order B 60 on same site/day
- **When:** Run MRP
- **Then:** A forecast remains 100; B customer order remains 60.

### DEM-006 — Forecast isolated by location

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (an order at another location consumes nothing). MRP's run is #14.
- **Given:** Forecast M at A=100, order M at B=60
- **When:** Run MRP
- **Then:** A forecast unaffected by order at B.

### DEM-007 — Forecast isolated by original date

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` restates it per D08: an order in another month consumes nothing, one later in the same month does. MRP's run is #14.
- **Given:** Forecast M/L Monday 100; customer order M/L Tuesday 60
- **When:** Run MRP
- **Then:** Tuesday order does not consume Monday forecast.
- **Superseded by D08 (2026-10-25):** a forecast is consumed by the orders whose required date falls in its **calendar month**, so the Tuesday order consumes Monday's forecast when both fall in the same month. An order in another month still consumes nothing. Normative text: `research/decisions/D08-statistical-unit-and-demand-review.md`. Cases: `2026-10-25--0913UTC-demand-review.md`, "D08 restated as acceptance cases".

### DEM-008 — Partial fulfillment no double count

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (shipping doesn't change consumption: residual 40) and `packages/core/src/domain/demand/demand-tally.test.ts` (the open quantity is what is left to ship). MRP's total is #14.
- **Given:** Forecast 100, ordered 60, physically shipped 30
- **When:** Run MRP
- **Then:** Remaining firm 30 and residual forecast 40; total outstanding demand 70.

### DEM-009 — Fully fulfilled order doesn't restore forecast

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (a fully shipped order still consumes: residual 40). MRP's run is #14.
- **Given:** Forecast 100, customer order 60 fully shipped
- **When:** Run MRP
- **Then:** Outstanding firm zero; residual forecast 40.

### DEM-010 — Early closure releases undelivered forecast consumption

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (60 ordered, 30 abandoned on early closure: residual 70) and `packages/core/src/services/reports/demand-review.service.test.ts` (a cancelled order consumes nothing in the screen's read). MRP's run is #14.
- **Given:** Forecast 100, order 60, GI 30, close rest Early
- **When:** Run MRP
- **Then:** Residual forecast 70, outstanding firm 0.

### DEM-011 — Cancellation before fulfillment releases all

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (a cancelled line consumes nothing: residual 100) and `packages/core/src/services/reports/demand-review.service.test.ts`. MRP's run is #14.
- **Given:** Forecast 100, matching order 60 not fulfilled
- **When:** Cancel order then run MRP
- **Then:** Residual forecast returns to 100.

### DEM-012 — Overdue outstanding demand today

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/demand-tally.test.ts` and `packages/core/src/services/reports/demand-review.service.test.ts` (an Open line past its required date counts in today's bucket as open and overdue, its own date kept for Ordered). MRP's planning bucket is #14.
- **Given:** Order 40 due yesterday, nothing shipped
- **When:** Run MRP today
- **Then:** Demand 40 immediately due in today's planning bucket, original due date retained.

### DEM-013 — Overdue fulfillment retains original forecast mapping

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/demand/forecast-netting.test.ts` (an overdue line still consumes its own month) and `packages/core/src/domain/demand/demand-tally.test.ts` (its outstanding quantity counts today). MRP's run is #14.
- **Given:** Monday forecast 100, order 60 due Monday, now Wednesday and unfulfilled
- **When:** Run MRP Wednesday
- **Then:** Order still consumes Monday forecast; overdue outstanding firm need due today.

### DEM-014 — Safety target default zero

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/domain/safety-stock/target-on.test.ts` (no target in force reads 0.000000). MRP's safety gap is slice 3. E03-S03, #24.
- **Given:** Material/site has no safety-stock record
- **When:** Run MRP
- **Then:** Safety gap uses target zero; no fictitious safety stock created.

### DEM-015 — Safety target becomes valid from date

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `target-on.test.ts` (a target applies from its date until the next one), `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts`, the safety-stock `page.test.tsx` (the target in force today). MRP's daily calculation is slice 3. E03-S03, #24.
- **Given:** Safety target M/L 100 effective January 1
- **When:** Calculate January 1 through January 15
- **Then:** Target 100 each day unless superseded.

### DEM-016 — Safety target changes over time

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `target-on.test.ts` (100 from January 1, 150 from February 1, across the boundary), `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts`, `packages/core/src/domain/demo/supply-plan.test.ts` (the demo dataset raises two targets from a later date, three months after its anchor). The MRP run is slice 3. E03-S03, #24.
- **Given:** Target 100 from January 1 and 150 from February 1
- **When:** Run MRP across boundary
- **Then:** January uses 100; February uses 150.

### DEM-017 — Same-day duplicate safety target forbidden

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts` (a second target on the same date is refused, also when two creates race), `add-safety-stock-target-dialog.test.tsx`, `tests/integration/planning-parameters.test.ts` and `planning-parameters-api.test.ts` (409 and nothing written). E03-S03, #24.
- **Given:** Safety target already exists at M/L for Feb 1
- **When:** Try create second target at exact same key/date
- **Then:** Reject duplicate effective-from key rather than ambiguous competing targets.

### DEM-018 — No safety replenishment ahead of firm demand

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Stock only sufficient for due customer order but not target buffer
- **When:** Run MRP
- **Then:** Customer demand prioritized, safety stock gap displayed as lower-priority requirement.

### DEM-019 — Firm demand priority over forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer demand 10 and residual forecast 20 share day but supply limited 15
- **When:** Run MRP
- **Then:** Firm customer order is prioritized ahead of forecast; unmet forecast shown as shortage.

### DEM-020 — Older customer due date priority

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer O1 due Monday and O2 due Tuesday, insufficient stock
- **When:** Run MRP
- **Then:** O1's requirement scheduled first, O2 shortage transparent.

### DEM-021 — Equal-date customer orders equal business priority

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two order lines due same date and site
- **When:** Run MRP
- **Then:** No preferential customer-specific priority configured; deterministic technical order does not alter equal business priority.

### DEM-022 — Forecast ahead of safety target

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Residual forecast 40 and safety top-up 20 compete for scarce supply
- **When:** Run MRP
- **Then:** Forecast is prioritized ahead of safety-stock replenishment.

### DEM-023 — Safety replenishment respects lot rules

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Projected ending stock 8, safety target 20, minimum 10 and lot multiple 5
- **When:** Run MRP
- **Then:** Recommended quantity at least 12, rounded up to suitable lot multiple (15).

### DEM-024 — Order state/quantity changes re-net forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open order quantity adjusted within allowed range
- **When:** Rerun MRP
- **Then:** Only current active order amount consumes corresponding forecast; obsolete calculation not reused.

### DEM-025 — Historical forecast residual does not roll over

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Monday forecast 100, customer order 60 due Monday, 30 shipped; current day Wednesday
- **When:** Run MRP Wednesday
- **Then:** Remaining firm order 30 becomes due today while consuming Monday forecast for history; past residual 40 expires rather than requiring 70 today.

## MRP time buckets, BOM explosion, netting & shortages

### MRP-001 — Manual run covers all tenant locations

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/mrp/mrp-run.service.test.ts` (three locations, each with an Open line of the same material: the stored run has 90 daily results for each of the three pairs, 1 October to 29 December, none omitted), `packages/core/src/services/mrp/mrp-snapshot.service.test.ts` (every location is read, inactive ones by their data). E14-S02, #274.

- **Given:** Tenant has three active sites and valid demand at all
- **When:** Run MRP
- **Then:** All three sites included; none silently omitted.

### MRP-002 — MRP does not cross tenants

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/mrp/mrp-run.service.test.ts` (material 00000001 at location 00000001 in both tenants, 40 ordered in Prod and 70 in Test: Prod's run holds 40 of firm demand and nothing of Test's, and Test's latest run keeps its ID and time), `packages/core/src/services/mrp/mrp-snapshot.service.test.ts` (neither tenant's snapshot reads the other's stock or lines), `tests/integration/mrp-run-api.test.ts` (Test and Prod runs through the API, and a Test reset that leaves Prod's run). E14-S02, #274.

- **Given:** Prod and Test contain coincident material IDs but different demand
- **When:** Run Prod MRP
- **Then:** Results derived solely from Prod; Test unaffected.

### MRP-003 — 90 days includes today

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/mrp/plan-mrp.test.ts` (today 1 October: 90 buckets, 1 October to 29 December), `packages/core/src/services/mrp/mrp-run.service.test.ts` (the stored run's `startDate`/`endDate` and every pair's 90 stored days from 1 October, read back page by page), `tests/integration/mrp-run-api.test.ts` (a run through the API plans today through today + 89). #273, E14-S02, #274.

- **Given:** Fixed today 1 October
- **When:** Run MRP
- **Then:** Daily result buckets include October 1 through December 29 inclusive; 90 dates total.

### MRP-004 — 90-day projection with separate later supply dates

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Fixed today 1 October with demand on Dec 30
- **When:** Run MRP
- **Then:** Inventory daily buckets stop on day 89 and demand on day 90 is not silently included; independently justified earliest-supply recommendations later than day 89 appear separately with Beyond Horizon warning, not credited inside buckets.

### MRP-005 — Daily granularity retained

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/mrp/mrp-run.service.test.ts` (physical 50 and Open lines of 10 on Monday 5 and 15 on Wednesday 7 October 2026: the run stores the 5th, 6th and 7th as three rows, read back filtered to the pair as firm demand 10/0/15 and projected balances 40/40/25), `tests/integration/mrp-report-api.test.ts` (the same three days through the API, the same for a normal user and the admin), `tests/integration/mrp-report.test.ts` (the same three days in the report's day table). There is no weekly display yet (E18-S02): the days are stored and shown apart. E18-S01, #284.
- **Given:** Demand on Monday and Wednesday same material/site
- **When:** Run MRP
- **Then:** Distinct daily needs and projected balances stored before any weekly display aggregation.

### MRP-006 — Weekly display not mutate data

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Daily MRP saved for seven days
- **When:** Toggle weekly UI aggregate
- **Then:** Weekly view changes presentation only; underlying daily result unchanged.

### MRP-007 — Initial physical stock incorporated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material/site physically has 100 and future demand 40
- **When:** Run MRP
- **Then:** Initial projection starts from physical 100 and reflects need 40 without new supply if safety permits.

### MRP-008 — Negative projected balance is diagnostic

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/mrp/mrp-run.service.test.ts` and `tests/integration/mrp-run-api.test.ts`: physical 5 and an Open line of 20 store −15 before proposals on the line's day, read back through `GET /api/tenants/{tenant}/mrp/runs/latest`, while the stock balance and the stock report API still say 5. `tests/integration/mrp-report.test.ts`: the report's day table shows −15 before proposals and a shortage of 15 on that day, and the stock report API still says 5. E14-S02, #274; E18-S01, #284.

- **Given:** Physical 5, future requirement 20 and no supply
- **When:** Run MRP
- **Then:** Projected pre-proposal balance −15 allowed in report; actual balance stays 5.

### MRP-009 — Suggested replenishment restores safety target

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material-site projection drops to 4, safety target 10
- **When:** Run MRP
- **Then:** Suggested incoming quantity restores projected stock at least to 10, respecting rounding rules.

### MRP-010 — No duplicate planned supply after GR

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO for 100, partial GR of 40 posted
- **When:** Run MRP
- **Then:** Physical stock includes 40; only 60 remains expected from PO, not another 100.

### MRP-011 — No duplicate planned production after completion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order 100, 40 already completed
- **When:** Run MRP
- **Then:** 40 represented in physical output stock; only 60 pending as planned output.

### MRP-012 — Converted requisition not extra supply

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PR 100 converted to linked PO 60, 40 unconverted
- **When:** Run MRP
- **Then:** Pipeline total at most 100 (60 PO, 40 tentative PR), not PR 100 plus PO 60.

### MRP-013 — Cancelled supply ignored

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PR/PO/production document cancelled before processing
- **When:** Run MRP
- **Then:** Cancelled outstanding quantity not counted as incoming supply.

### MRP-014 — Closed Early supply ignored

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 100 received 60 and Closed Early
- **When:** Run MRP
- **Then:** 60 reflected in physical balance; no planned remaining 40.

### MRP-015 — Overdue PO shifted to today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 50 unreceived with due yesterday
- **When:** Run today
- **Then:** 50 expected today with Overdue Supply marker; physical balance unchanged.

### MRP-016 — Overdue production shifted to today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production output 20 pending and planned completion yesterday
- **When:** Run today
- **Then:** 20 expected today with overdue marker, no physical completion until posting.

### MRP-017 — Production due date is finished output date

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Make lead time 5, finish day Friday
- **When:** Run MRP
- **Then:** Finished output expected Friday; component input needed preceding Sunday for calendar-day difference.

### MRP-018 — Components required at start date

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Planned order output Fri, planned start Mon, input A required 80
- **When:** Run MRP
- **Then:** 80 A subtracted from projected available inventory on Monday even though physical consumption posts upon completion.

### MRP-019 — No physical reservation added

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Stock 100 and planned production input need 80
- **When:** Run MRP
- **Then:** Physical balance remains 100; projected available only 20 after planned input.

### MRP-020 — Later demand reveals component shortage

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Planned input 80 Mon from 100; new order needs 50 Wed
- **When:** Rerun MRP
- **Then:** Projected shortage of 30 is visible, rather than reusing same 80 twice.

### MRP-021 — Remaining component need after partial output

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order output 100, completion 40 posted, BOM A 2 kg each
- **When:** Run MRP
- **Then:** Planned A requirement for remaining 60 output is 120 kg, not 200 kg or an extrapolated variance.

### MRP-022 — Past-due component need shifted today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Start date Monday, now Wednesday with unfinished output
- **When:** Run MRP
- **Then:** Remaining BOM component requirement is projected for Wednesday; original planned start date preserved.

### MRP-023 — Finished output not available before planned completion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production starts Monday and finishes Friday
- **When:** Run MRP with finished-product demand Wednesday
- **Then:** That planned Friday output does not satisfy Wednesday supply need without lateness.

### MRP-024 — Top priority valid feasible BOM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two date-valid recipes, priority 1 and 2, priority 1 feasible
- **When:** Run MRP
- **Then:** Priority 1 selected, no unnecessary fallback.

### MRP-025 — Fallback transparently captures shortage

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Priority 1 BOM needs 1 A per finished unit and priority 2 needs B; final output lot-adjusted quantity is 6 with only 5 A dependable
- **When:** Run MRP
- **Then:** Feasibility checks 6 A, rejects priority 1 showing 1 A missing, and selects priority 2 only if its full rounded input requirement is feasible.

### MRP-026 — No infeasible parent auto-production

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** All valid parent BOMs lack dependable inputs
- **When:** Run automatic MRP on multi-level product with missing component supply
- **Then:** MRP shows complete provisional parent/intermediate dependency chain but creates no infeasible parent; only independently feasible lower-level orders may enter automatic creation batch.

### MRP-027 — Recursive intermediate replenishment

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished F requires intermediate I; I requires raw R; neither present
- **When:** Run MRP
- **Then:** Provisional F to I to R dependency quantities/blockers shown; feasible lower-level supply may be proposed, but hypothetical I or F output is not dependable supply and does not make a parent executable in the same run.

### MRP-028 — No circular BOM explosion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** A-B-C dependency graph is valid and acyclic
- **When:** Run multi-level MRP
- **Then:** Plan terminates with finite dependent demand, no recursive loop.

### MRP-029 — Multiple parent demands net same raw supply

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two products require same raw material at same site/day
- **When:** Run MRP
- **Then:** Raw component requirements aggregated/netted once against available physical and planned reliable supply.

### MRP-030 — Buy material yields PR proposal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Net raw requirement positive with no supply
- **When:** Run MRP manual
- **Then:** Suggested action is Create Purchase Requisition, not Create PO.

### MRP-031 — Make intermediate yields production proposal if feasible

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Intermediate Make, date-valid BOM with projected components
- **When:** Run MRP manual
- **Then:** Production-order recommendation produced with pinned BOM revision.

### MRP-032 — Finished Buy yields purchase proposal

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished product material-location mode Buy
- **When:** Run MRP
- **Then:** Suggestion uses Buy / PR path rather than assuming finished goods always manufactured.

### MRP-033 — Raw Make mode rejected before MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw material has invalid Make setting attempted
- **When:** Validate master and run
- **Then:** Invalid master not accepted; MRP cannot produce a raw Make action.

### MRP-034 — Missing planning parameters isolated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material A lacks lot data but B valid
- **When:** Run MRP
- **Then:** A yields explicit Missing Planning Parameters, B still gets valid result/recommendation.

### MRP-035 — Missing BOM isolated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Make intermediate A lacks any date-valid BOM; B valid
- **When:** Run MRP
- **Then:** A produces Missing BOM; B planning completes unaffected.

### MRP-036 — Invalid conversion explicit exception

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Legacy or corrupt persisted factor/dependency detected in stored data; normal input validation would have rejected this
- **When:** Run MRP with affected material
- **Then:** MRP emits Invalid UoM Conversion without guessing, valid unrelated items still plan; new invalid conversion records are rejected at entry.

### MRP-037 — Late lead-time warning

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Need due 3 days ahead, lead time 7 days
- **When:** Run MRP
- **Then:** Earliest proposed start today, completion 7 days hence, Late Supply by 4 days.

### MRP-038 — No backwards production starts

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production need yesterday, lead 4 days
- **When:** Run MRP today
- **Then:** No newly recommended production start is dated in the past.

### MRP-039 — Infeasible transfer not fully counted

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** 100 planned transfer dispatch, only 60 projected at source
- **When:** Run MRP
- **Then:** Insufficient Transfer Stock exception; only source-feasible amount may be projected at destination. No assumed full 100 delivery and no automatic transfer modifications.

### MRP-040 — Overdue in-transit transfer projected today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** In-transit 25 with arrival date yesterday
- **When:** Run MRP
- **Then:** 25 planned for destination today with Overdue Transfer warning; no physical destination stock yet.

### MRP-041 — Tentative PR not reliable BOM availability

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open PR 50 for raw input, no PO/GR, higher-priority BOM needs that 50
- **When:** Run MRP
- **Then:** PR is marked tentative and does not make BOM feasible for parent auto-order.

### MRP-042 — Planned receipts same day can cover requirement

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Scheduled PO receipt 40 and planned component requirement 40 on same day
- **When:** Run MRP
- **Then:** Same-day bucket can balance those quantities; physical completion still waits for actual receipt.

### MRP-043 — Safety-stock date transition

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Target rises 20→40 midway through horizon
- **When:** Run MRP
- **Then:** Target/shortage adapts on effective date and does not treat old 20 as perpetually valid.

### MRP-044 — MRP prioritizes firm before tentative forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** One raw shortage affects firm customer order and residual forecast
- **When:** Run MRP
- **Then:** Firm requirement given priority and forecast shortage remains visible.

### MRP-045 — Lot-size never underplans

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Exact computed need 4.000001 and multiple 2
- **When:** Run MRP
- **Then:** Proposal at least 6 (assuming no stricter minimum), not 4.

### MRP-046 — Lot rounding precedes BOM feasibility

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Demand 4.1 output units, production lot multiple 2; each output needs 1 raw A, dependable A stock 5
- **When:** Run MRP with active recipe
- **Then:** Suggested Make quantity rounds to 6 before testing 6 A; recipe is infeasible, no executable parent production order created merely because 4.1 A would fit.

### MRP-047 — Complete multilevel provisional plan is not dependable

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** F needs I, I needs R, all stock and firm receipts zero, R is Buy with valid parameters
- **When:** Run MRP
- **Then:** Explain hypothetical F/I dates and quantities down to R; only feasible R PR may be executable. Neither imaginary I nor F is counted in dependable supply.

### MRP-048 — Past residual forecast expires

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Yesterday forecast 100, order 60 due yesterday with 20 fulfilled, today is next day
- **When:** Run MRP today
- **Then:** Only unfulfilled firm 40 moves to today; yesterday residual forecast 40 expires and cannot generate catch-up demand.

### MRP-049 — Beyond-horizon feasible finish separately visible

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Today is day 0, demand on day 20, required Buy lead time 120 days
- **When:** Run 90-day MRP
- **Then:** Show Late Supply and dated Beyond Horizon proposed finish day 120; projected day 0–89 supply is not increased by that future receipt.

### MRP-050 — Inactive-input alternative triggers fallback or parent exception

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Make output F has priority 1 active BOM requiring inactive raw R, and priority 2 BOM with available active material S
- **When:** Run MRP for F
- **Then:** Reject priority 1 as Inactive BOM Component, select feasible priority 2; if no eligible alternative exists, show parent exception and create no F order.

### MRP-051 — Open production with inactive pinned component is at risk

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open production order for F pins BOM requiring raw R; R later deactivated with no stock or unfinished direct R document
- **When:** Run MRP for F demand
- **Then:** Keep order, flag At-Risk Existing Production / Inactive BOM Component. Its unproduced output is not dependable for BOM feasibility, shortage visible, no duplicate F auto-order until user resolves existing order.

## MRP reruns, proposal acceptance & automatic creation

### RUN-001 — On-demand only

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/mrp-run.test.ts`: after a customer order and a stock correction through the API and browsing three other pages, the MRP page and the API show the same latest run ID and time. Nothing but `MrpRunService.run` creates a run, called only by the Run MRP action and `POST …/mrp/runs`. E14-S02, #274.

- **Given:** Demand changed but no user starts MRP
- **When:** Wait or browse UI
- **Then:** No automatic MRP run generated merely by change.

### RUN-002 — Manual run records timestamp and ID

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/mrp-run.test.ts` (a normal user runs MRP in writable Prod and the page shows the new run's ID, time and account, and `GET …/mrp/runs/latest` returns that run with 90 days for each of its pairs), `tests/integration/mrp-run-api.test.ts`, `tests/integration/mrp-report.test.ts` (the report under the run's ID shows its days, and a later run replaces both). E14-S02, #274; E18-S01, #284.

- **Given:** Normal user triggers planning in writable tenant
- **When:** Run MRP
- **Then:** Run identifier/time and results available in report.

### RUN-003 — Default manual mode

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** User opens Run MRP dialog
- **When:** Leave creation option at default and run
- **Then:** Recommendations shown without automatically creating transactional PRs/orders.

### RUN-004 — One-click create with confirmation

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Valid PR recommendation exists from latest run
- **When:** User selects create action
- **Then:** Confirmation required before posting new requisition.

### RUN-005 — Manual Buy acceptance creates PR only

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Valid Buy recommendation for 50
- **When:** Confirm creation
- **Then:** PR 50 created, linked to run; no PO automatically issued.

### RUN-006 — Manual Make acceptance creates production order

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Valid feasible Make recommendation
- **When:** Confirm creation
- **Then:** Production order created with selected BOM revision and source run ID.

### RUN-007 — Automatic mode explicit opt-in

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Writable tenant with valid recommendations
- **When:** Choose automatic creation before MRP run
- **Then:** Only eligible PRs/feasible production orders created and linked to run ID.

### RUN-008 — Immediate identical rerun does not duplicate

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** First auto run creates PR 100
- **When:** Run same auto MRP with unchanged state
- **Then:** No duplicate PR for same uncovered demand.

### RUN-009 — MRP demand grows incremental

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing created production order covers 100, demand now 120
- **When:** Rerun MRP
- **Then:** Only 20 additional uncovered supply suggested (subject to lot rules).

### RUN-010 — MRP demand shrinks no auto-cancel

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing active production order 100, demand now 80
- **When:** Rerun automatic MRP
- **Then:** Existing 100 order untouched; surplus planned supply visible, no cancel/delete.

### RUN-011 — Recalculation supersedes old proposals

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Unexecuted suggestions from old MRP run exist
- **When:** Run fresh MRP
- **Then:** Old recommendations no longer active; new result set and timestamp shown.

### RUN-012 — Accepted documents survive rerun

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PR from previous run exists and still Open
- **When:** Rerun MRP
- **Then:** PR remains, linked to original run; outstanding quantity netted.

### RUN-013 — No edits to existing transactional docs

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Old PO/production order has fixed date/quantity
- **When:** Run automatic MRP
- **Then:** Old date/quantity/status unchanged, regardless of new needs.

### RUN-014 — Atomic automatic order batch

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Auto-run has 5 eligible new PR/orders
- **When:** Execute creation with all valid
- **Then:** Exactly 5 new documents created, all linked to run ID.

### RUN-015 — Automatic creation one invalid document

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Automatic batch has 5 candidates; one fails late validation
- **When:** Commit batch
- **Then:** Zero of five created; run's calculated output/exceptions retained with failure explanation.

### RUN-016 — Independent exceptions do not suppress valid planning

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material A missing BOM, material B Buy recommendation valid
- **When:** Run MRP auto mode
- **Then:** A exception reported; eligible B recommendation still considered for atomic create batch.

### RUN-017 — Stale manual recommendation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Manual MRP calculated; another user changes relevant inventory
- **When:** User accepts old recommendation
- **Then:** Rejected as stale, no order created, advised to rerun.

### RUN-018 — Stale auto creation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** MRP calculation based on stock; concurrent posting changes it before auto commit
- **When:** Attempt automatic batch commit
- **Then:** Batch revalidation fails, zero new documents created, results remain.

### RUN-019 — Concurrent automatic runs serialized

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two sessions request automatic MRP in same tenant at once
- **When:** Execute both
- **Then:** No duplicate order creation; at most one automatic create runs against given state at a time.

### RUN-020 — Manual rerun respects canceled PR

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PR 100 was canceled by user
- **When:** Run MRP again
- **Then:** Former canceled supply does not suppress required new PR.

### RUN-021 — MRP cannot run in read-only mode

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The manual half: `tests/integration/mrp-run.test.ts` (read-only Prod keeps the latest run on the page with no Run MRP, for a user and the admin), `tests/integration/mrp-run-api.test.ts` (a user's and the admin's tokens answer 409 `TENANT_READ_ONLY` and the earlier run and its results stay readable), `packages/core/src/services/mrp/mrp-run-gate.test.ts` (the real action and API wrappers store nothing). Automatic runs are E19-S03. E14-S02, #274.

- **Given:** Tenant read-only while last MRP results exist
- **When:** Try manual and automatic runs
- **Then:** Both blocked; older MRP report readable.

### RUN-022 — Manual suggestions tied to current tenant

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** User switches from Test to Prod after viewing recommendation
- **When:** Attempt accept old Test suggestion in Prod
- **Then:** No cross-tenant document creation; correct context/revalidation enforced.

### RUN-023 — Failure visibly identifies candidate

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** One auto-create candidate invalid
- **When:** Run automatic MRP
- **Then:** Report identifies cause/material/document candidate without silent partial creation.

### RUN-024 — API repeat of automatic run

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Completed automatic MRP API request with idempotency key
- **When:** Replay key with same payload within 24 hours
- **Then:** Same original run/result returned, no duplicate orders.

### RUN-025 — Provisional Make orders never auto-created

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** F and I missing dependable input; raw R Buy procurement can be recommended; MRP shows hypothetical F/I and feasible R PR
- **When:** Run automatic MRP
- **Then:** R PR may be created, F and I production orders not created; hypothetical projected outputs do not hide shortage or duplicate an actionable order.

## Excel opening balances & physical inventory corrections

### STX-001 — Opening balance template available

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/imports/workbook-file.test.ts` (the Stock sheet has Material ID, Location ID, Physical quantity and Unit, and the EN/PL instructions say desired balance, not change, with one commit reason such as "Opening balance"), `packages/core/src/domain/imports/stock-layout.test.ts` (each column's meaning and example in both languages), `tests/integration/stock-import-api.test.ts` (`.xlsx` for a token and the browser), `tests/integration/stock-import.test.ts`. The examples are in the instruction sheets, not data rows. E07-S02, #81.
- **Given:** New Prod tenant with no stock
- **When:** Normal user downloads opening balance XLS
- **Then:** Template documents material, location, physical desired quantity, UoM and mandatory reason; examples understandable.

### STX-002 — Opening balance creates ordinary movements

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (an opening workbook of 100 in Prod posts one +100 `correction`, reason "Opening balance", with audit before 0 / after 100, session and reason), `tests/integration/stock-import-api.test.ts`. E07-S02, #81.
- **Given:** Prod M/X on-hand 0, opening XLS contains 100
- **When:** Dry run and commit
- **Then:** Posts +100 stock adjustment with Opening Balance reason; signed movement and audit recorded.

### STX-003 — Actual balance not delta

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (100 to 85 previews and posts −15), `tests/integration/stock-import-api.test.ts` (balance 85), `tests/integration/stock-import.test.ts` (the screen previews −15 and the Stock page shows 85). E07-S02, #81.
- **Given:** M/X stock 100, Excel cell desired 85
- **When:** Commit validated correction
- **Then:** Only −15 movement posted, final stock 85.

### STX-004 — Increase current balance

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (100 to 130 previews +30; 90 to 105 posts +15). E07-S02, #81.
- **Given:** M/X stock 100, target Excel balance 130
- **When:** Commit validated correction
- **Then:** Movement +30 posted, ending stock 130.

### STX-005 — Unchanged physical value no movement

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (a row equal to the balance is `unchanged`; an all-unchanged commit adds no movement), `tests/integration/stock-import.test.ts` ("unchanged: 1"). E07-S02, #81.
- **Given:** M/X stock 100, target Excel balance 100
- **When:** Dry run and import
- **Then:** Shows No change and does not post pointless stock movement.

### STX-006 — Partial location selection

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (an unlisted position at another location keeps its 20; with stock at three locations and a workbook listing two, the third keeps every balance and gets no movement), `tests/integration/stock-import-api.test.ts`. E07-S02, #81; #139.
- **Given:** Three sites A/B/C have stock; workbook only site A
- **When:** Commit import
- **Then:** A targeted positions updated; B/C exactly unchanged.

### STX-007 — Partial material selection

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (at a location listing only one material, the other keeps its 20), `tests/integration/stock-import-api.test.ts`. E07-S02, #81.
- **Given:** Site A holds material M and N, file lists only M
- **When:** Commit import
- **Then:** Only M potentially changed, N unchanged.

### STX-008 — No implicit zero for missing rows

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (the unlisted position keeps 20, not 0; only listed rows add movements). Four positions, not twenty. E07-S02, #81.
- **Given:** Site A has 20 positions, workbook lists 3
- **When:** Commit import
- **Then:** Other 17 positions are not set to zero.

### STX-009 — Zero desired quantity allowed

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (100 to 0 posts −100, balance 0.000000), `tests/integration/stock-import-api.test.ts`. E07-S02, #81.
- **Given:** Material/site stock 100, correction row 0
- **When:** Commit
- **Then:** Post −100, final physical stock exactly zero.

### STX-010 — Negative factual quantity rejected

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/prepare-stock-import.test.ts`, `packages/core/src/services/imports/stock-import.service.test.ts` (−1 is `VALIDATION_FAILED` on Physical quantity, no commit token), `tests/integration/stock-import-api.test.ts`, `tests/integration/stock-import.test.ts` (row, column and message shown; Post disabled). E07-S02, #81.
- **Given:** File claims desired physical balance −1
- **When:** Dry run
- **Then:** Invalid quantity error, no import.

### STX-011 — Unknown material in correction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (`IMPORT_MISSING_REFERENCE` on Stock, row, Material ID, with "Check the ID, or create the material first."; no token; the dry run writes nothing), `tests/integration/stock-import-api.test.ts` (the row's code, no token), `tests/integration/stock-import.test.ts` (STX-011: the Stock import screen's dry run lists Stock, row 3, Material ID, "Material 99999999 doesn't exist in Prod. Check the ID, or create it first.", offers no posting, and the valid row beside it moves no stock). E07-S02, #81; #190.
- **Given:** File refers to nonexistent material ID
- **When:** Dry run
- **Then:** Sheet/row/material error with corrective advice; no stock change.

### STX-012 — Unknown location in correction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (an unknown location is `IMPORT_MISSING_REFERENCE` on Location ID with advice; no token). E07-S02, #81.
- **Given:** File refers to unknown location ID
- **When:** Dry run
- **Then:** Reference error, no stock change.

### STX-013 — Duplicate material-location correction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/prepare-stock-import.test.ts` (two rows for one material and location, in any unit, are `IMPORT_DUPLICATE_KEY`), `packages/core/src/services/imports/stock-import.service.test.ts`, `tests/integration/stock-import.test.ts` (both rows listed; Post disabled). E07-S02, #81.
- **Given:** Two XLS rows for same material/site with different quantities
- **When:** Dry run
- **Then:** Duplicate key flagged, import cannot commit.

### STX-014 — Mandatory reason for bulk correction

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/validators/imports/import-request.schema.test.ts`, `packages/app/src/app/api/tenants/[tenant]/stock-import/commit/route.test.ts` (400 on `reason`; the service is never called), `packages/app/src/components/imports/import-screen.test.tsx`, `tests/integration/stock-import-api.test.ts`. E07-S02, #81.
- **Given:** Valid correction workbook but no correction reason
- **When:** Attempt commit
- **Then:** Rejected; movement and audit unchanged.

### STX-015 — Different existing conversion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (2 case at 12 each over 10 each previews desired 24 and +14 with "Entered: 2 case"; the commit ends at 24), `tests/integration/stock-import-api.test.ts`. E07-S02, #81.
- **Given:** File quantity 2 cases, material BUoM each, defined conversion 12
- **When:** Dry run and commit
- **Then:** Desired final physical balance is 24 each, not +24 on top of current balance.

### STX-016 — Stock changed after dry run

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (a −10 between dry run and commit makes the commit `IMPORT_STALE` and keeps 90; −10 then +10 is still stale), `tests/integration/stock-import-api.test.ts` (409 `IMPORT_STALE`; the other posting is kept). A correction stands in for the goods issue. E07-S02, #81.
- **Given:** Dry run sees on-hand 100 and target 85; another user posts GI −10
- **When:** Commit old preview
- **Then:** Rejected due to stale physical balance; does not overwrite concurrent stock.

### STX-017 — Multiple corrections all-or-nothing

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (all problems listed at once with no token; a commit with errors or a forged token adds no movement or audit; a failure in a later chunk rolls back every row). E07-S02, #81.
- **Given:** Workbook includes two valid positions and one invalid
- **When:** Try commit
- **Then:** No position changes, error list includes offending record.

### STX-018 — Role parity for correction

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` and `tests/integration/stock-import-api.test.ts` (a normal user's commit records their account, session and channel; the admin's token commit names the admin on `api`), `packages/app/src/app/admin/[tenant]/stock-import/actions.test.ts` (a normal user's and an admin's UI commit each pass their own account, session and `ui`), `tests/integration/stock-import.test.ts` (both roles commit in the browser; the admin's movements are audited as `admin`, on `ui`, with a session other than the normal user's). E07-S02, #81; #139.
- **Given:** Normal user and admin have write access
- **When:** Each executes equivalent validated correction workflow
- **Then:** Both can commit, with their own account/session attribution.

### STX-019 — Tenant read-only blocks corrections

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-import-api.test.ts` (read-only Prod answers 409 `TENANT_READ_ONLY` to dry run and commit; stock unchanged), `packages/app/src/components/imports/import-screen.test.tsx` (upload, reason and commit disabled), `packages/core/src/http/tenant-server-action.test.ts` (the gate refuses before the handler runs). E07-S02, #81.
- **Given:** Prod marked read-only
- **When:** Attempt correction XLS commit
- **Then:** No stock or audit business writes; actionable blocked message.

### STX-020 — In-transit excluded from XLS corrections

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/domain/imports/prepare-stock-import.test.ts` (a Transfer, Transfer ID or In-transit column is `IMPORT_TRANSIT_COLUMN`, pointing to the write-off), `packages/core/src/services/imports/stock-import.service.test.ts` (a row at a location with stock in transit moves only the physical balance; the transfer keeps its 10). E07-S02, #81.
- **Given:** Transfer contains 10 in transit
- **When:** Try to include transit as ordinary location correction
- **Then:** Not accepted as physical location balance; dedicated transfer write-off/reversal required.

### STX-021 — Audit signed deltas from absolute input

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/stock-import.service.test.ts` (90 to 105 posts +15 with before, after, reason and the audit entry), `tests/integration/stock-import.test.ts` (the ledger shows reason and user). E07-S02, #81.
- **Given:** M/X balance changes 90→105 via XLS
- **When:** Inspect movement and audit
- **Then:** Shows target 105, calculated movement +15, reason and actor; not raw replacement without history.

## Bearer tokens, API parity, errors & idempotency

### API-001 — Normal user issues token only in interactive UI

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts`, `packages/app/src/components/api-tokens/create-token-dialog.test.tsx`, `packages/core/src/services/api-tokens/api-token.service.test.ts`, `tests/api-token-minting.test.ts`. E01-S03, PR #41.
- **Given:** Normal active account signed in
- **When:** Create bearer token named agent1 through authenticated UI with explicit confirmation
- **Then:** Secret shown once, token inherits user's normal rights; bearer API cannot create additional tokens.

### API-002 — Administrator issues token only in interactive UI

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (the admin creates and revokes a token on the screen; `POST /api/tokens` answers 405 to the admin's token and to a normal user's); `tests/api-token-minting.test.ts` and `packages/app/src/app/api/tokens/route.test.ts` (no minting route for any role). E01-S03, PR #41; #52.
- **Given:** Built-in admin signed in
- **When:** Create own token through authenticated UI with explicit confirmation
- **Then:** Token inherits admin rights but bearer API creation remains absent/forbidden, including for admin.

### API-003 — Unique token names per account

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts`, `tests/integration/api-tokens.test.ts`. E01-S03, PR #41.
- **Given:** User already has token named 'build'
- **When:** Create another own token named 'build'
- **Then:** Duplicate name rejected, existing token remains valid.

### API-004 — Same token name in different accounts

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts`, `tests/integration/api-tokens.test.ts`. E01-S03, PR #41.
- **Given:** User A has token 'build', user B has none
- **When:** User B creates token 'build'
- **Then:** Allowed because uniqueness is per account, not system-wide.

### API-005 — Many tokens permitted

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts`. E01-S03, PR #41.
- **Given:** User has several active named tokens
- **When:** Create one more unique token
- **Then:** New token succeeds; existing tokens continue independently.

### API-006 — Token secret only shown once

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (the reloaded list no longer contains the secret), `packages/app/src/components/api-tokens/create-token-dialog.test.tsx`. E01-S03, PR #41.
- **Given:** User creates token and leaves creation view
- **When:** Reopen token listing
- **Then:** Token metadata visible but secret cannot be retrieved.

### API-007 — Token last used time recorded

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts`, `tests/integration/api-tokens.test.ts`. E01-S03, PR #41.
- **Given:** Valid token never used
- **When:** Make successful authorized API request
- **Then:** Token's last-used timestamp updated.

### API-008 — Token revocation effective immediately

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (revoked from the API and from the screen), `packages/app/src/app/api/tokens/[id]/route.test.ts`, `packages/core/src/services/api-tokens/api-token.service.test.ts`. E01-S03, PR #41.
- **Given:** Two active tokens for same user
- **When:** Revoke token A, then call API with A and B
- **Then:** A rejected, B remains usable.

### API-009 — Never-expiring token without explicit revocation

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts`, `packages/core/src/database.test.ts` (tokens have no expiry; only a revoke, reset, deactivation or admin-password change ends them). E01-S03, PR #41.
- **Given:** Token created long ago, owner still active
- **When:** Use token after 24h and after idempotency records expiry
- **Then:** Token remains valid; token lifetime is not tied to idempotency TTL.

### API-010 — Token inherits role restrictions

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** A normal user's token is refused (403) on admin-only operations, end to end: `GET /api/users` in `tests/integration/api-tokens.test.ts`; `POST /api/users`, `PATCH /api/users/{id}` and `PUT /api/users/{id}/password` in `tests/integration/api-users.test.ts`, where the same token still changes its own preferences; a master-data write of each kind in `tests/integration/materials-api.test.ts` (create and change a material), `named-records-api.test.ts` (create), `planning-parameters-api.test.ts` (create a safety-stock target) and `boms-api.test.ts` (create a BOM), where the token still reads. Unit tests in the routes' `route.test.ts` files and `packages/app/src/auth/api-write.test.ts`. `tests/integration/import-api.test.ts` (a normal user's token's import dry run is 403 `FORBIDDEN`). `tests/integration/forecasts-api.test.ts` (a normal user's token can't write forecasts but still reads them). E01-S03, PRs #41, #48; #52; with #22, #23, #24, #26 and #27; E08-S03, #85.
- **Given:** Normal user's bearer token valid
- **When:** Try to change master material
- **Then:** Rejected as forbidden; ordinary allowed transaction can still succeed.

### API-011 — Token reflects user deactivation

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (a read and a write both get 401 after deactivation), `packages/core/src/services/users/user.service.test.ts`, `packages/core/src/services/api-tokens/api-token.service.test.ts`. E01-S03, PR #41.
- **Given:** Token valid then account deactivated
- **When:** Attempt read and write API calls
- **Then:** Both rejected as invalid credentials immediately.

### API-012 — Token invalid after password reset

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts`, `packages/core/src/services/users/user.service.test.ts`. E01-S03, PR #41.
- **Given:** User issued token, admin resets password
- **When:** Try API call with old token
- **Then:** Rejected; user must create a new token after login.

### API-013 — API explicitly scopes tenant

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenant-isolation-api.test.ts` (a tenant-less path such as `/api/materials` or `/api/locations` is 404 for a read and a write; a material and a location created in Test through the API are absent from Prod), `tests/integration/tenants.test.ts` (one tenant read by its path; an unknown tenant is 404), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (one token writes Prod and Test separately, each through `/api/tenants/{tenant}/…`), `tests/tenant-entry-points.test.ts` (every tenant route sits under `api/tenants/[tenant]/`), `packages/app/src/app/api/tenants/[tenant]/route.test.ts`. E02-S01, #19.
- **Given:** One account accesses Test and Prod
- **When:** Use authorized API call selecting Test then Prod
- **Then:** Each request affects only specified tenant; no implicit cross-tenant data read/write.

### API-014 — API/UI role parity for reports

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-report.test.ts` (a normal user reads the stock report in the UI), `tests/integration/stock-report-api.test.ts` and `tests/integration/variance-report-api.test.ts` (a normal user's token and the admin's get identical tenant-scoped reports), `tests/integration/audit-history.test.ts` (the filtered audit matches the screen). `tests/integration/mrp-report.test.ts` (a normal user reads the latest MRP report in the UI: its days and pair count match the API's), `tests/integration/mrp-report-api.test.ts` (a normal user's token and the admin's get identical filtered MRP reports). E13-S01/S02, #94, #95; E18-S01, #284.
- **Given:** Normal account uses report UI and API
- **When:** Read inventory and latest MRP
- **Then:** Equivalent tenant-specific report content available in both channels.

### API-015 — API/UI parity for dry run

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/import.test.ts` (one workbook through the screen and through `POST /api/tenants/prod/import/dry-run` gives the same problems at the same sheet, row and column; a normal user has no Import entry and is sent away from the screen), `tests/integration/import-api.test.ts` (the API previews and commits like the screen; a normal user's token is 403 and a read-only tenant 409), the dry-run `route.test.ts` and the Import `actions.test.ts` (both hand the prepared workbook to the same `ImportService.dryRun`). The preview rows are asserted per channel, not compared side by side. E05-S01, #27.
- **Given:** Admin can run master XLS dry run in UI
- **When:** Run equivalent via API
- **Then:** Same validation and preview behavior, same authorization; no API-only skip.

### API-016 — API/UI parity for reversals

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-reversals.test.ts` (a normal user reverses a goods issue in the UI and, with their token, through the API: the no-negative refusal, same-key replay, once only), `packages/app/src/app/api/tenants/[tenant]/stock/movements/[id]/route.test.ts` (a strict body passed to the shared service), `packages/core/src/services/stock/stock-reversal.service.test.ts` (reason required). E11-S02, #91.
- **Given:** Normal user can reverse posted GI line in UI
- **When:** Use corresponding API action with authorized token
- **Then:** Same no-negative check, reason requirement, once-only rule and audit.

### API-017 — API/UI parity for admin reset

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset.test.ts` and `test-reset-api.test.ts` exercise the same admin reset from both surfaces, including previously read-only Test. Normal-token and cookie-only reset requests are denied; action tests reject normal and signed-out callers. #93.
- **Given:** Admin can trigger Test reset in UI
- **When:** Execute through admin bearer API
- **Then:** Same authorization, read-only safeguards and full atomic reset; normal token forbidden.

### API-018 — API error has stable code and message

**Priority:** P1 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials-api.test.ts` (an incomplete material is refused with a stable code and every missing field named, and nothing is created). Unknown references: `tests/integration/planning-parameters-api.test.ts` and `tests/integration/boms-api.test.ts` (a Test set, target or BOM naming a material that exists only in Prod is 404 `MATERIAL_NOT_FOUND` and stores nothing), with the message asserted in `packages/core/src/services/materials/find-material.test.ts` ("There is no material 00000001 in this tenant."). E02-S03, #21, with #22, #24 and #26.
- **Given:** Unknown referenced material on a mutating API call
- **When:** Submit validly authenticated request
- **Then:** Returns documented stable code plus human-readable actionable explanation, no silent partial success.

### API-019 — Missing API idempotency key

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (a write without an `Idempotency-Key` is refused and nothing is created), `packages/core/src/http/idempotency-key.test.ts`, `packages/app/src/auth/api-write.test.ts`. Token minting has no API route (API-002, API-032). E02-S03, #21.
- **Given:** Authenticated valid POST for a document creation but no key
- **When:** Send mutation
- **Then:** Bearer API mutation rejected without key. Issuing a token is deliberately unavailable in bearer API and must occur through interactive UI.

### API-020 — First keyed API write

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (a keyed create makes exactly one record and answers it). `tests/integration/shipments-api.test.ts` (a keyed goods issue of 10 creates one goods issue and moves stock from 100 to 90 once; the retry replays the same ID). That test runs in Prod; Test writes also need the generation (API-034). E02-S03, #21; E08-S02, #84.
- **Given:** Valid token and key K in Test
- **When:** Post GI of 10
- **Then:** Exactly one GI and ledger movement created with successful response.

### API-021 — Same key same body returns cached result

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (the replay answers byte for byte and creates nothing; a token revoke replays), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (once per key). `tests/integration/import-api.test.ts` (an import commit replayed with its key answers the same body, marked replayed, and its material exists once). `tests/integration/transfers-api.test.ts` (a dispatch replayed with its key returns the same posting and moves stock once), `tests/integration/goods-receipts-api.test.ts` (a receipt replayed with its key returns the same receipt; stock and received move once), `tests/integration/purchasing-api.test.ts` (a PO once per key), `tests/integration/shipments-api.test.ts`, `tests/integration/customer-orders.test.ts` and `tests/integration/forecasts-api.test.ts` (a keyed replay returns the original and creates nothing). E02-S03, #21, with #27; E07-S03, #82; E08, #83, #84, #85; E09, #86, #87.
- **Given:** Original keyed request succeeded and response lost
- **When:** Repeat identical key/method/payload within 24h
- **Then:** Original result returned for same account/action/tenant generation; no duplicated document, receipt, import, MRP or token revocation. Token issuance is UI-only; no API replay can mint a token.

### API-022 — Same key different body rejected

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (the key with another body is refused), `packages/core/src/services/idempotency/idempotency.service.test.ts` (`IDEMPOTENCY_KEY_REUSED`, nothing runs). E02-S03, #21.
- **Given:** Key K already used for GI 10
- **When:** Retry K but GI 11
- **Then:** Conflict error; neither replay nor second movement created.

### API-023 — Same key another operation rejected

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (the key for another operation is refused), `packages/core/src/services/idempotency/idempotency.service.test.ts` (the error names the first operation, nothing runs). E02-S03, #21.
- **Given:** Key K already used for operation A
- **When:** Reuse K in same account/tenant for operation B
- **Then:** Conflict or nonmatching-operation error; B not accidentally executed as A.

### API-024 — Keys isolated per tenant

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenant-isolation-api.test.ts` (one key sent to Test, then to Prod with another body, runs as two writes, neither replayed, each record only in its own tenant), `packages/core/src/services/idempotency/idempotency.service.test.ts` ("keeps keys separate per tenant": each tenant has its own key store). E02-S03, #21.
- **Given:** User used key K in Test
- **When:** Use K for different valid Prod mutation
- **Then:** Prod key scope independent; data correct in each tenant.

### API-025 — Keys isolated per user

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (one account's key is apart from another's), `packages/core/src/services/idempotency/idempotency.service.test.ts`. E02-S03, #21.
- **Given:** User A used key K in Prod
- **When:** User B uses K for own authorized Prod mutation
- **Then:** Account scoping keeps identity separate; no mistaken replay of A response.

### API-026 — 24-hour retention boundary

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/idempotency/idempotency.service.test.ts` (a fake clock: the key replays until just before 24 hours, then runs anew; a stale generation is refused even for a stored key). Unit level. E02-S03, #21.
- **Given:** Key K used for a valid write and cached
- **When:** Repeat just before 24h and again after expiry
- **Then:** Within same tenant generation, original response before TTL and after TTL key may be reused subject to validation. Any payload from obsolete Test generation is rejected regardless of TTL.

### API-027 — MRP auto-run idempotency

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Automatic run creates 3 documents with key K
- **When:** Retry identical API call within 24h
- **Then:** Returns same run result and 3 documents, not 6.

### API-028 — Excel import idempotency

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/import-api.test.ts` (a master-data import commit retried with its key replays the first answer, marked replayed, and its material exists once), `tests/integration/stock-import-api.test.ts` (a stock-import commit retried with its key returns the identical body, marked replayed, with one +100 movement). E05-S01, #27; E07-S02, #81.
- **Given:** Inventory correction XLS committed with key K
- **When:** Retry same API mutation
- **Then:** Same outcome returned; no second adjustment generated.

### API-029 — Optimistic API version conflict

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (users), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (a stale version is 409 `VERSION_CONFLICT` and the newer change stays), `tests/integration/boms-api.test.ts` (a stale BOM `PATCH` is 409 `VERSION_CONFLICT`), the services' and routes' unit tests. `tests/integration/customer-orders.test.ts` and `tests/integration/forecasts-api.test.ts` (a stale version is 409 `VERSION_CONFLICT`), `tests/integration/purchasing-api.test.ts` (a stale requisition or order PATCH is `VERSION_CONFLICT`). E02-S03, #21, with #22, #23 and #26; E08-S01, #83; E08-S03, #85; E09-S01, #86.
- **Given:** Object version 2 loaded by client A, edited to v3 by B
- **When:** Client A attempts update expecting v2
- **Then:** HTTP 409 and clear version conflict; v3 preserved.

### API-030 — API cannot bypass tenant read-only

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (an admin token's update of a Prod material is 409 `TENANT_READ_ONLY` and changes nothing). `tests/integration/import-api.test.ts` (an admin token's import dry run and commit in read-only Prod are 409 `TENANT_READ_ONLY`, and nothing is created). E02-S04, #25, with #27.
- **Given:** Prod read-only and admin token provided
- **When:** Try admin-originated business record update via API
- **Then:** Blocked regardless of token privilege; no write.

### API-031 — Global API actions scoped without tenant data leakage

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-users.test.ts` (the admin's token deactivates a user through `PATCH /api/users/{id}`: the Global audit holds `users.user.deactivated` for that user on the API channel with the token's name, `active` yes → no, and both tenants' materials, locations, customers, suppliers, current stock and audit read the same before and after). #192.
- **Given:** Admin deactivates a user using Global-scoped action
- **When:** Inspect audit and active tenant records
- **Then:** Global audit written; tenant business stock/master data unchanged.

### API-032 — Token minting is not available through bearer API

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/api-token-minting.test.ts` (only the server action creates tokens, and it never reads `Authorization`), `packages/app/src/app/api/tokens/route.test.ts`, `tests/integration/api-tokens.test.ts` (405 for the admin's token and a normal user's). E01-S03, PR #41; #52.
- **Given:** Existing valid bearer token belongs to admin or ordinary user
- **When:** Attempt any API action that would create a new token
- **Then:** Creation denied/not exposed regardless of role, idempotency key or tenant; interactive signed-in UI with explicit confirmation is the only issuance channel. List/revoke APIs remain.

### API-033 — Old Test idempotency request cannot mutate reused ID

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts` demonstrates the old generation being refused after a real reset, including its previously used key. Reset and IdempotencyService tests cover the expired-key case and enforce generation checking before lookup. #93, with #21.
- **Given:** Test generation G1 processed keyed stock operation; Test reset seeded G2 with same material ID
- **When:** Replay G1 payload with same key inside or outside 24 hours
- **Then:** Request rejected as stale generation and never returns a success affecting G2 or writes G2 stock. Global credentials remain valid for new correctly scoped requests.

### API-034 — Tenant metadata supplies current Test-generation precondition

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenants.test.ts` (tenant metadata gives the generation), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (a Test write without it is 428, with the current one it succeeds), `tests/integration/boms-api.test.ts` (a Test BOM write without it is 428 `GENERATION_REQUIRED`), `tests/integration/tenant-isolation-api.test.ts` (a generation above the current one is 409 `GENERATION_STALE`, in Test and in Prod, and nothing is created), `packages/core/src/domain/tenants/generation.test.ts` and `packages/app/src/auth/api-write.test.ts`. The real reset and its stale-generation case are verified by #93 (see the additional evidence below). `tests/integration/import-api.test.ts` (a Test import dry run without the generation is 428 `GENERATION_REQUIRED`, and with a stale one 409 `GENERATION_STALE`). `tests/integration/customer-orders.test.ts` and `tests/integration/forecasts-api.test.ts` (a Test write without the generation is 428 `GENERATION_REQUIRED`). E02-S03, #21, with #26 and #27; E08-S01, #83; E08-S03, #85.
- **Evidence (#93):** `tests/integration/test-reset-api.test.ts` fetches the incremented generation from tenant metadata after a real reset and refuses the old precondition (:126–128: the old reset is 409, a material write at the old generation `GENERATION_STALE`); the same key with the current precondition replays exactly once. `tests/integration/test-reset.test.ts` refuses an edit loaded before a real reset on the screen.
- **Given:** User bearer token can read Test and Prod tenant metadata; Test dataset generation is G1
- **When:** Make Test mutation without precondition, with G1, and after reset with old G1
- **Then:** Missing generation rejected (HTTP 428), current G1 mutation may succeed subject to ordinary rules, stale G1 after reset G2 rejected (HTTP 409). Current generation is available from tenant metadata.

## Audit, concurrency & transactional atomicity

### AUD-001 — All creates audited

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` (user creation with account, session and channel), `tests/integration/materials.test.ts` and `named-records.test.ts` (creates in the tenant audit, with account, session and channel), `tests/integration/planning-parameters.test.ts`, the user, material, named-record, planning-parameter and safety-stock service tests, and `packages/core/src/services/boms/bom.service.test.ts` (a BOM create's entry with its new values and recipe). `packages/core/src/services/stock/stock.service.test.ts` and `tests/integration/stock.test.ts` (every correction writes a tenant-audit entry with actor, session or token, channel and before/after), `packages/core/src/services/customer-orders/customer-order.service.test.ts` (an order's create entry with the UI channel, session and its new lines, and the account that created it), `tests/integration/customer-orders.test.ts` (:106: a normal user's API create entry in the Prod tenant audit names that user's account, with the API channel, their token, no session, and the new customer, location and lines). E02-S02, #20, with #26; E07-S01, #80; E08-S01, #83; E08-S04, #140.
- **Given:** Normal user creates customer order
- **When:** Read tenant audit
- **Then:** Create event with actor, tenant, session, channel, new values exists.

### AUD-002 — All edits audited

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials.test.ts` (an edit shows before → after in the tenant audit), `tests/integration/named-records.test.ts`, the material, named-record, planning-parameter and safety-stock service tests, and `packages/core/src/services/boms/bom.service.test.ts` (a revision's entry with the old and new recipe). Documents: `tests/integration/customer-orders.test.ts` (an order edit's before/after lines), `packages/core/src/services/forecasts/forecast.service.test.ts` and `tests/integration/forecasts-api.test.ts` (a forecast change's before/after), `packages/core/src/services/shipments/shipment.service.test.ts` (:274) and `tests/integration/shipments-api.test.ts` (:328) (a shipment edit's before/after date and lines, once per keyed request). E02-S02, #20, with #22, #23, #24 and #26; E08-S01, #83; E08-S03, #85; E08-S05, #147.
- **Given:** Admin edits material description
- **When:** Read audit
- **Then:** Before/after values of changed master record visible.

### AUD-003 — Deactivation audited not hard deletion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials.test.ts` and `named-records.test.ts` (the deactivated record stays, shown Inactive, and the audit records active: yes → no), `tests/integration/audit.test.ts` (users), `packages/core/src/services/boms/bom.service.test.ts` (a BOM's deactivation and reactivation entries, active yes → no → yes). E02-S02, #20, with #26.
- **Given:** Admin deactivates material
- **When:** Inspect business record and audit
- **Then:** Inactive record persists and audit captures state change.

### AUD-004 — Reversal audits both original and reverse

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit-history.test.ts` (a UI correction's posted and reversed entries and its reversal's own entry stay separate, linked both ways by "Reversed by" / "Reverses", each with its reason; a production completion reversal and a transfer dispatch reversal, filtered by their record, show the reversal with its reason, and their movements "Reverses" / "Reversed by" each other), `packages/core/src/services/audit/audit-history.test.ts` (`reversalLinks` from either side, within the tenant), `packages/app/src/components/audit/audit-table.test.tsx`, `packages/core/src/services/stock/stock-reversal.service.test.ts`, `packages/core/src/services/production-orders/production-completion.service.test.ts` (a completion reversal audits the completion, the order and each movement), `packages/core/src/services/transfers/transfer.service.test.ts` (the transfer reversal event). E11-S02/S03, #91, #92; E13-S03, #96; E13-S05, #152.
- **Given:** Original movement and linked reversal exist
- **When:** Read audit
- **Then:** Both actions remain as separate immutable events with link/reason.

### AUD-005 — Audit includes tombstone on permitted deletion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/forecasts/forecast.service.test.ts` (a removed forecast's entry keeps its key and quantity, after: null), `tests/integration/forecasts-api.test.ts` (a removal audited as a tombstone with what it held), `tests/integration/forecasts.test.ts`. E08-S03, #85.
- **Given:** Operation legitimately deletes or removes business object under rules
- **When:** Inspect audit
- **Then:** Tombstone snapshot retains prior identity/content; record not silently erased from history.

### AUD-006 — UI edits show source channel

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit-history.test.ts` (a stock correction and its reversal posted in the UI show channel UI, the account and an 8-character session), `tests/integration/stock.test.ts` (a UI correction's audit has channel ui, a session and the normal user), `tests/integration/customer-orders.test.ts` (a UI order edit recorded with before/after, channel ui and its session). E07-S01, #80; E08-S01, #83; E13-S03, #96.
- **Given:** User changes transactional record in UI
- **When:** Read audit
- **Then:** Channel UI and session/account shown.

### AUD-007 — API edits show named token

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenant-isolation-api.test.ts` (a material and a location changed with a token show channel API and the token's name in the Prod audit, through the API and on the screen, never the secret), `tests/integration/api-tokens.test.ts` (a revoke through the API shows channel API and the token's name, never the secret), `packages/core/src/services/audit/audit-recorder.test.ts`, the tenant routes' unit tests (`apiActor`). E02-S02, #20.
- **Given:** Agent changes record using token 'robot-a'
- **When:** Read audit
- **Then:** Channel API and token name/ID shown, not token secret.

### AUD-008 — Share account attribution is session-level

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` (one account signed in twice: each change carries its own session, same account), `packages/core/src/services/users/user.service.test.ts`. E02-S02, #20.
- **Given:** Two humans logged into same account with distinct sessions
- **When:** Each posts different edit
- **Then:** Audit separates session IDs while retaining same account ID; no invented human attribution.

### AUD-009 — Audit read available to normal users

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` (a normal user reads the Global audit and the Test audit's entries, with no controls on either), `tests/integration/read-only-api.test.ts` (a normal user's token reads Prod's audit), the audit page and route unit tests. E02-S02, #20.
- **Given:** Normal account in selected tenant
- **When:** Open tenant audit via UI and API
- **Then:** Read-only access permitted, no edit/delete controls exposed.

### AUD-010 — Audit cannot be edited by admin

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` (the audit routes answer 405 to PATCH, PUT, DELETE and POST), `packages/db/src/entities/audit/audit.entity.test.ts` (triggers abort an update or delete in SQLite), `tests/audit-append-only.test.ts` (nothing in the source writes to it). E02-S02, #20.
- **Given:** Admin attempts to amend an old audit event
- **When:** Use UI or API
- **Then:** Operation refused; previous audit unchanged.

### AUD-011 — Prod retention through Test reset

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts` compares Prod audit before/after both reset modes; real SQLite service and db reset tests retain Prod audit rows. #93.
- **Given:** Prod has historical audit entries
- **When:** Admin resets Test
- **Then:** Prod audit remains intact.

### AUD-012 — Test audit cleared on reset

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts` begins with audited Test mutations and observes an empty Test audit after reset. Db and service tests prove deletion, rollback and fresh demo seeding. #93.
- **Given:** Test has prior audit events
- **When:** Admin regenerates Test
- **Then:** Old Test-specific audit removed with old Test business data.

### AUD-013 — Global audit retained across resets

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** API/UI reset tests observe the acting admin, UI session or API token, and retained prior Global history. The real SQLite audit tests still abort Global updates/deletes. #93.
- **Given:** Global account/reset events recorded
- **When:** Reset Test
- **Then:** Global history still readable and append-only.

### AUD-014 — Global audit covers token changes

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (token creation and revocation in the Global audit, no secret; every token a reset or a deactivation ends is revoked by the admin), `packages/core/src/services/api-tokens/api-token.service.test.ts`, `packages/core/src/services/users/user.service.test.ts` ("tokens a reset or deactivation ends"). The admin's tokens ended at startup after `CPG_ADMIN_PASSWORD` changes stay unaudited by decision (#44, spec Q1). E02-S02, #20, with #17, #44.
- **Given:** User creates then revokes API token
- **When:** Read Global audit
- **Then:** Token create/revoke events with account/time recorded, no token secret.

### AUD-015 — Global audit covers password reset

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` ("Password reset", actor and subject, "Password replaced (not recorded)"), `packages/core/src/services/users/user.service.test.ts`. E02-S02, #20.
- **Given:** Admin resets normal user password
- **When:** Read Global audit
- **Then:** Actor, subject account and reset action recorded without password or hash.

### AUD-016 — Global audit covers read-only toggle

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (Test and Prod made read-only, then Prod writable again, each with before and after, through `GET /api/audit`), `tests/integration/read-only.test.ts` (Prod made read-only and writable again, on the Global audit screen), `packages/core/src/services/tenants/tenant.service.test.ts`. E02-S04, #25.
- **Given:** Admin sets Prod read-only true then false
- **When:** Read Global audit
- **Then:** Both changes logged with before/after read-only flag values.

### AUD-017 — Atomic production completion under concurrent stock loss

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a second ORM issues 6 of 10 first; the completion is refused: cocoa 4, bar 0, no completion). E10-S02, #89.
- **Given:** Input stock 10, production needs 10, another session issues 6 first
- **When:** Try completion concurrently
- **Then:** Completion rejected or serialized correctly; no input negative and no orphan finished stock.

### AUD-018 — Atomic multi-line goods receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("writes nothing when one line fails": no receipt, movement, received quantity or audit), `tests/integration/goods-receipts-api.test.ts` (400 on `lines.1.unit`; stock and received unchanged). E09-S02, #87.
- **Given:** GR two lines, second fails validation while first could pass
- **When:** Attempt post
- **Then:** Neither line changes inventory or order received amounts.

### AUD-019 — Atomic transfer dispatch

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` ("rolls both legs back when the posting fails after the source leg was flushed": source, movement, posting, transit and audit unchanged). The failure is injected at unit level. E07-S03, #82.
- **Given:** Source issue and in-transit posting paired
- **When:** Simulate failure between sub-movements
- **Then:** Both rolled back; cannot lose source stock without transit credit.

### AUD-020 — Atomic transfer receipt

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` ("rolls both legs back when the receipt fails": destination, transit, received and postings unchanged). The failure is injected at unit level. E07-S03, #82.
- **Given:** Transit decrement and destination increment paired
- **When:** Simulate failure while processing receipt
- **Then:** Neither side commits alone; invariant source+transit+destination preserved.

### AUD-021 — Atomic production reversal

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a forced audit failure after the stock flush leaves no inverse, link, produced or state change), `tests/integration/production-transfer-reversals.test.ts`. E11-S03, #92.
- **Given:** Finished output removal and component restoration planned
- **When:** Force one stock validation failure
- **Then:** No inverse movement or order state commits.

### AUD-022 — Atomic XLS import

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/imports/import.service.test.ts` (a commit with a valid row and an invalid one writes neither), `packages/core/src/services/imports/import-boms.test.ts` (a refused BOM workbook applies none of its sheets), `packages/core/src/http/request-savepoint.test.ts` (every row written through the real services rolls back when the commit throws). With hundreds of rows (#192): `import.service.test.ts` commits a 500-row workbook, 450 materials and 51 locations, with one unknown ID at row 400; the dry run reports only that error, on its row and column, and the commit is refused with `IMPORT_STALE`, leaving every material, location and audit entry as before, while the same workbook without that row writes all 501. A refused commit answers `IMPORT_STALE`; the full list of problems comes from the dry run (XLS-009). Inventory: `packages/core/src/services/imports/stock-import.service.test.ts` (a stock commit of a workbook with errors writes no movement or audit; a failure in a later chunk of 40 rows rolls all of them back; 500 stock lines across 20 posting chunks with one line in an unconvertible unit at row 481: the dry run reports only that line, and the commit is refused with `IMPORT_STALE`, posting no movement and changing no balance or audit entry; the clean workbook's commit failing in its last chunk, after 475 lines were posted, rolls them all back; the clean workbook then posts all 500). E05-S01, #27; E07-S02, #81.
- **Given:** Hundreds of rows with one invalid
- **When:** Try commit
- **Then:** No subset of masters/inventory changes; failed operation surfaces all detected validation issues.

### AUD-023 — Atomic auto-MRP batch

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Several orders to create, one candidate invalid
- **When:** Attempt auto-create
- **Then:** Zero new orders; saved MRP results and error explanation remain.

### AUD-024 — Optimistic locking in UI

**Priority:** P0 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials.test.ts` (two sessions edit one material: the second sees the conflict, and the first one's change stays), `tests/integration/named-records.test.ts` (the same for a location), `tests/integration/api-idempotency.test.ts` (users), `packages/app/src/components/materials/material-controls.test.tsx` and `named-record-actions.test.tsx`, the services' tests. E02-S03, #21.
- **Given:** Two sessions load same material version
- **When:** A saves edit then B saves stale edit
- **Then:** B conflict message; A modification preserved.

### AUD-025 — Optimistic locking in API

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts`, `materials-api.test.ts` and `named-records-api.test.ts` (the second, stale update is 409; no last write wins). Documents: `tests/integration/customer-orders.test.ts` (a stale order PATCH from either role is 409 `VERSION_CONFLICT` and the first change, 36.000000, stays), `packages/core/src/services/customer-orders/customer-order.service.test.ts`, `tests/integration/purchasing-api.test.ts` (a stale requisition or order PATCH is 409, the newer change kept), `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (a receipt advances the PO version), `tests/integration/production-orders.test.ts` (a stale production-order PATCH is 409), `tests/integration/shipments-api.test.ts` (:328: a stale shipment PATCH is 409 `VERSION_CONFLICT`), `packages/core/src/services/shipments/shipment.service.test.ts` (:388: the newer planned date stays). E02-S03, #21; E08-S01, #83; E08-S05, #147; E09-S01/S02, #86, #87; E10-S01, #88.
- **Given:** Two API clients use same version number
- **When:** First changes order, second submits stale update
- **Then:** Second HTTP 409; no last-write-wins.

### AUD-026 — Concurrent GI on limited stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (two connections race on the same stock: one commits), `tests/integration/shipments-api.test.ts` (two concurrent issues of 7 on 10: statuses 200 and 409, stock 3.000000, one goods issue). E08-S02, #84.
- **Given:** On-hand 10, two sessions attempt GI 7 each
- **When:** Post concurrently
- **Then:** At most one succeeds and stock remains nonnegative.

### AUD-027 — Data references enforced

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (an unknown supplier, or a Test order naming a Prod-only supplier, is `SUPPLIER_NOT_FOUND`; no order saved), `packages/core/src/services/suppliers/find-supplier.test.ts`, `packages/core/src/services/customer-orders/customer-order.service.test.ts` (a missing customer, location or material writes no header, line or audit entry). E08-S01, #83; E09-S01, #86.
- **Given:** PO references supplier that does not exist in selected tenant
- **When:** Attempt creation
- **Then:** Fails without orphan PO/order line.

### AUD-028 — No password in audit snapshots

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit.test.ts` (no password or hash on the audit page), `packages/core/src/services/users/user.service.test.ts`, `packages/core/src/services/audit/audit-recorder.test.ts` (secret-looking keys are refused). E02-S02, #20.
- **Given:** Admin resets password
- **When:** Inspect all audit before/after payloads
- **Then:** No raw password or stored credential hash exposed.

### AUD-029 — No bearer secret in audit snapshots

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/api-tokens/api-token.service.test.ts` (creation is recorded by name, never the secret), `tests/integration/api-tokens.test.ts`. E02-S02, #20, with #17.
- **Given:** User creates token
- **When:** Inspect audit
- **Then:** Named token reference present, bearer secret absent.

### AUD-030 — Business date and audit timestamp distinct

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit-history.test.ts` (a receipt posted today against a line planned for 2027-01-05: its movement's audit entry shows the audit timestamp with "Business date <today>" under it, and the order keeps 2027-01-05), `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` and `tests/integration/goods-receipts-api.test.ts` (the planned date kept, the movement dated today, the audit `occurredAt` the posting moment), `tests/integration/shipments-api.test.ts` (an issue and its movement are dated today; the order keeps its required date; the audit entry has its own `occurredAt`), `packages/app/src/components/audit/audit-table.test.tsx`, `packages/app/src/components/audit/audit-query.test.ts` (`businessDateOf`). E08-S02, #84; E09-S02, #87; E13-S03, #96.
- **Given:** Document planned for tomorrow, receipt posted today
- **When:** Inspect source, ledger and audit
- **Then:** Document retains planned date; stock posting uses today; audit records actual change timestamp.

## Reports, help, localization, theme & scope boundaries

### UX-001 — English by default

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts`, `packages/core/src/services/preferences/user-preference.service.test.ts`. E01-S04, PR #32.
- **Given:** Fresh user with no preference
- **When:** Sign in
- **Then:** UI defaults to English.

### UX-002 — Polish language selection

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts`, `tests/integration/help.test.ts` (Polish help), `packages/app/src/i18n/messages/messages.test.ts` (every English string has a Polish one). Tooltips don't exist yet. E01-S04, PR #32.
- **Given:** Active user on English UI
- **When:** Change user language to Polish
- **Then:** Navigation, help, tooltips and error messages available in Polish.

### UX-003 — Language preference per account

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts` (in one browser, the admin in Polish and a second account in English, each kept across two sign-ins in turn), `packages/core/src/services/preferences/user-preference.service.test.ts` (one account's choice doesn't change another's). E01-S04, PR #32; #52.
- **Given:** User A chooses Polish, user B stays English
- **When:** Sign in separately
- **Then:** Both see their own chosen language; one does not alter the other.

### UX-004 — Language preference across tenants

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts` (Polish kept while switching Test → Prod → Test from the tenant strip, and on Prod opened afresh). Preferences are a global table, outside tenant scope (`packages/db/src/entities/index.ts`); tenant data stays apart in `packages/db/src/tenants/tenant-isolation.test.ts`. E01-S04, PR #32; #52.
- **Given:** User selects Polish while in Test
- **When:** Switch to Prod
- **Then:** Same user's selected language continues; business data still isolated.

### UX-005 — Light mode selectable

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts`, `packages/app/src/preferences/theme.test.ts`. E01-S04, PR #32.
- **Given:** User currently viewing dark UI
- **When:** Choose light mode
- **Then:** Pages display light theme under current user preference.

### UX-006 — Dark mode selectable

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts`, `packages/app/src/preferences/theme.test.ts`. E01-S04, PR #32.
- **Given:** User currently viewing light UI
- **When:** Choose dark mode
- **Then:** Pages display dark theme without changing business records.

### UX-007 — Theme preference persists in user settings

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/preferences.test.ts` (dark kept after signing out and in again, while switching Test → Prod → Test, and on Prod opened afresh without the theme cookie), `packages/app/src/app/login/actions.test.ts`. E01-S04, PR #32; #52.
- **Given:** User selects dark theme and logs out
- **When:** Sign in again and visit another tenant
- **Then:** Account setting retains dark preference.

### UX-008 — Footer present on login page

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/footer.test.ts`, `packages/app/src/components/layout/app-footer.test.tsx`. E01-S04, PR #32.
- **Given:** Unauthenticated visitor opens login
- **When:** Inspect footer
- **Then:** Exact footnote sentence and both named links present.

### UX-009 — Footer present on transaction page

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/footer.test.ts` (a normal user signed in on Prod's Materials and Customer orders pages: the page ends with the exact footnote sentence and both links, each opening in a new tab). #192.
- **Given:** Authenticated normal user opens operational maintenance
- **When:** Inspect footer
- **Then:** Exact footnote sentence and both links present.

### UX-010 — Footer present on admin/help/report page

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** The root layout renders the footer on every page (`packages/app/src/app/layout.test.tsx`); `tests/integration/footer.test.ts` asserts it on `/`, `/login`, `/help`, `/admin`, `/admin/users`, `/admin/tokens`, `/admin/audit`, `/admin/test`, `/admin/test/audit`, a filtered `/admin/test/audit`, `/admin/test/reports/stock`, `/admin/test/reports/variance`, the MRP report page `/admin/test/mrp` and a filtered `/admin/test/mrp?material=…`. E01-S04, PR #32; #52; E13-S05, #152; E18-S01, #284.
- **Given:** Admin visits user administration, help and MRP report
- **When:** Inspect footer on each
- **Then:** Exact required text and links on all pages.

### UX-011 — OpenMercato Skills link correct

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/layout/app-footer.test.tsx`, `tests/integration/footer.test.ts`. E01-S04, PR #32.
- **Given:** Any page with app footer
- **When:** Activate OpenMercato Skills link
- **Then:** Link target is https://github.com/open-mercato/skills.

### UX-012 — AITechLeaders link correct

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/layout/app-footer.test.tsx`, `tests/integration/footer.test.ts`. E01-S04, PR #32.
- **Given:** Any page with app footer
- **When:** Activate AITechLeaders training link
- **Then:** Link target is https://www.aitechleaders.pl/.

### UX-013 — Searchable in-app documentation available

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** Searchable help in both languages: `tests/integration/help.test.ts`, `packages/app/src/help/search-help.test.ts` (a search for "completion" finds the `production-order-detail` topic with its "Posting a completion" paragraph and the 0.5 kg × 4 = 2 kg example, and "księgowanie wykonania" finds it in Polish; `search-help.test.ts` also asserts that `HELP_TOPIC_ROUTES` maps the production order page to that topic); `tests/every-page-has-help.test.ts` fails the build for a page without a topic. E01-S04, PR #32; E10-S02, #89; E10-S03, #143.
- **Given:** Normal user on production completion screen
- **When:** Open Help and search for 'completion'
- **Then:** Relevant operational help and examples found without leaving app.

### UX-014 — Contextual field tooltip

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/field-tooltips.test.ts` (for a kg output that converts 1 bag = 25 kg, Planned quantity's tooltip opens on keyboard focus and says it is entered "in kg or in a physical alternate unit this output converts, such as bag (not SU)", converted "into kg, rounded half up to six decimals", keeping "the unit and factor you entered with the order"; Escape closes only the tooltip, not the dialog. Minimum lot's tooltip opens on hover and names kg, six decimals and "0 means no minimum". At 390 px a tap on Base quantity's info button opens a tooltip whose box lies inside the viewport; the tap is a synthesized touch pointer plus click, since agent-browser taps only on iOS). Per field, the text that names its unit and storage: `production-orders/production-dialog.test.tsx` (Planned quantity: the output's units, base unit only, or general before an output is chosen), `materials/create-material-dialog.test.tsx` and `material-controls.test.tsx` (Base unit: six decimals, locks once referenced, in English and Polish), `materials/add-conversion-dialog.test.tsx` and `conversion-actions.test.tsx` (Alternate and Base quantity: "denominator alternate units = numerator base units", exact and greater than 0, never revalues earlier postings, SU a reporting unit only), `planning-parameters/add-planning-parameters-dialog.test.tsx` and `planning-parameter-actions.test.tsx` (Minimum lot and Lot multiple in the chosen material's base unit), `safety-stock/add-safety-stock-target-dialog.test.tsx` and `safety-stock-target-actions.test.tsx` (Target: from its date until the next, 0 ends the buffer), and `boms/recipe-form.test.tsx` (component quantity: per 1 base unit of the output, stored in the component's base unit). The control: `packages/ui/src/backend/forms/info-tip.test.tsx` (keyboard focus, hover, tap and click open it; the button is named after its field and described by the text; Escape closes it inside a dialog without cancelling the form) and `crud-form.test.tsx`. Both languages have every key: `i18n/messages/messages.test.ts`. E20-S01, #290.

- **Given:** User edits production order or master-data quantity
- **When:** Inspect tooltip for component UoM/meaning
- **Then:** Tooltip explains expected entry/BUoM behavior appropriate to current field.

### UX-015 — Guided how-to in Polish

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/help.test.ts` (a Polish account finds the "Import z arkusza" topic by searching "skoroszyt", with its steps: Pobierz szablon … wykonaj próbę), `packages/app/src/help/topics.test.ts` (the topic exists in Polish, written apart from the English), `packages/app/src/components/imports/workbook-file.test.ts` (the template's Instrukcja sheet explains the columns and BOM IDs in Polish, with an Example column), `packages/app/src/components/imports/report-text.test.ts` and `packages/app/src/components/imports/import-screen.test.tsx` (problems and refusals in Polish, e.g. "Zostaw ID puste, aby utworzyć nowy rekord."). E05-S01, #27.
- **Given:** User selects Polish then opens import Help
- **When:** Follow step-by-step XLS dry-run guide
- **Then:** Instruction steps, examples and error guidance accessible in Polish.

### UX-016 — Material XLS error helpful for newcomer

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/import.test.ts` (an unknown explicit ID is listed on the screen with its sheet, row 2, column ID and "Leave the ID blank to create a new record."), `packages/app/src/components/imports/report-text.test.ts` (the same in Polish), `packages/core/src/services/imports/import.service.test.ts` (XLS-004). E05-S01, #27.
- **Given:** Uploaded row with unknown explicit ID
- **When:** Run dry run and view UI feedback
- **Then:** Shows offending row/key and specific action e.g. leave ID blank to create.

### UX-017 — Inventory report physical vs in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-report.test.ts` (after a 30 kg dispatch without receipt, a normal user sees the source at 70 kg on hand and 30 kg in transit out, and the destination at 0 kg on hand and 30 kg in transit in), `tests/integration/stock-report-api.test.ts` (the same figures through the API), `packages/core/src/services/reports/stock-report.service.test.ts` (transit is never added to on hand), `packages/app/src/app/admin/[tenant]/reports/stock/page.test.tsx`, `packages/app/src/app/admin/[tenant]/stock/page.test.tsx`, `tests/integration/transfers.test.ts` (the Stock page shows 40 kg physical and 60 kg in transit separately). E07-S03, #82; E13-S01, #94.
- **Given:** Transfer dispatched but not received
- **When:** Open current inventory report
- **Then:** Physical on-hand and in-transit shown distinctly; no accidental destination availability.

### UX-018 — MRP report overdue indicators

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Last MRP has overdue PO, overdue transfer and late recommendation
- **When:** Open MRP results
- **Then:** Warnings and affected material/date visible in material/location filter context.

### UX-019 — MRP report daily/weekly presentation

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Daily results across a week
- **When:** Toggle aggregation
- **Then:** Weekly totals computed for display; daily results preserved.

### UX-020 — MRP report BOM rejection explanations

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Fallback occurred due to missing component
- **When:** Open latest MRP report
- **Then:** Show chosen BOM and rejected higher priority BOM plus component shortage quantity.

### UX-021 — Report API parity

**Priority:** P1 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/stock-report-api.test.ts` and `tests/integration/variance-report-api.test.ts` (a normal user and the admin get the same report through the API; Prod rows never appear in Test). `tests/integration/mrp-report-api.test.ts` (a normal user and the admin get the same MRP report through the API, with the figures the screen shows in `tests/integration/mrp-report.test.ts`; this file's Prod pair never appears in Test's report). E13-S01/S02, #94, #95; E18-S01, #284.
- **Given:** Inventory and MRP reports have content in UI
- **When:** Fetch equivalent report through API
- **Then:** Equivalent tenant-scoped data returned under same role authorization.

### UX-022 — Audit readable in both languages

**Priority:** P2 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/audit-history.test.ts` (in Polish, a movement reversal's action, fields and business date are translated while the IDs, reason and dates stay as recorded; in English and Polish, every field of a completion reversal and a transfer posting reversal is named), `packages/app/src/components/audit/audit-table.test.tsx`, `tests/audit-labels.test.ts` (every recorded action, record type and audit field is named in EN and PL; the recorder refuses a field `AUDIT_FIELDS` doesn't list, so a new one cannot ship unnamed). E13-S03, #96; E13-S04, #145.
- **Given:** Normal user switches between English and Polish
- **When:** View audit history
- **Then:** Field labels/action descriptions localized without changing immutable audit facts.

### UX-023 — No price or accounting workflow

**Priority:** P2 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/navigation.test.ts` (a normal user's sidebar has no pricing, invoicing, payment, billing, accounting, VAT or currency entry, while it offers Forecasts, Demand review, Production orders, Purchase requisitions and Purchase orders; the help page, which covers the API, names none of them). No order, BOM or posting carries a price: every document test creates them without one. That core planning works without them waits for MRP (#14). #192.
- **Given:** User browsing main screens and API help
- **When:** Inspect available functions
- **Then:** No required invoicing/pricing/payments modules; core planning works without them.

### UX-024 — No capacity/work-center scheduling

**Priority:** P2 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` and `tests/integration/production-orders.test.ts` (same-site, same-date orders save with no resource check). The planning run is slice 3 (#14). E10-S01, #88.
- **Given:** Production orders share time and site
- **When:** Run planning and inspect UI
- **Then:** No machine-sequencing or resource constraint required for MVP.

### UX-025 — No SSO required

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/auth.test.ts` (:35: on a fresh production container with no single sign-on configured, the admin signs in with the built-in password and gets a local session cookie), `tests/integration/users.test.ts` (a normal user signs in with a local password too). E01-S01/S02, PRs #29, #34.
- **Given:** New runtime has valid built-in admin secret
- **When:** Sign in with local password
- **Then:** Works without Microsoft/Google single sign-on.

### UX-026 — No hard reservation required

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/document-lifecycle.test.ts` (an open production order needs all 100 kg on hand; a goods issue of 10 kg of it posts with 200, with no reservation in the way, and the order then shows 90 kg available and a 10 kg shortage). The next MRP's shortage is slice 3 (#14). #192.
- **Given:** Planning has outstanding production demand and raw stock exists
- **When:** Post otherwise valid physical goods issue before production
- **Then:** No reservation system blocks transaction; next MRP detects resulting shortage.

### UX-027 — Weekly aggregation distinguishes flow and balances

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Seven days of receipts/demand and daily projected balances including a recurring shortage
- **When:** Open weekly MRP view
- **Then:** Demand/receipt/issue flows are summed, projected stock is last-day balance, shortage peak/minimum inventory comes from weakest day; stock balances and persistent deficits are not summed across days.

## Lifecycle states & master deactivation guardrails

### LFC-001 — New document starts Open

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` and `tests/integration/customer-orders.test.ts` (a new order and its lines are Open with fulfilled 0 and stock has no movement), `packages/core/src/services/purchase-requisitions/purchase-requisition.service.test.ts` and `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (Open, converted/received 0), `tests/integration/purchasing-api.test.ts`, `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (no movement when a PO is created), `packages/core/src/services/production-orders/production-order.service.test.ts` (Open, produced and abandoned 0, no movement), `packages/core/src/services/transfers/transfer.service.test.ts`, `packages/app/src/components/transfers/transfer-form.test.tsx` and `tests/integration/transfers-api.test.ts` (a transfer is created Open with progress 0 and no movement). E07-S03, #82; E08-S01, #83; E09-S01, #86; E10-S01, #88.
- **Given:** New PR, PO, production order or customer order
- **When:** Create valid record
- **Then:** Document status Open; progress zero; no physical movements on creation.

### LFC-002 — Partially fulfilled document remains Open

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts`, `tests/integration/goods-receipts-api.test.ts` (30 of 100 received: Open, received 30, outstanding 70); for a customer order, `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (a partly issued order stays Open with 15 outstanding). E08-S02, #84; E09-S02, #87.
- **Given:** Purchase order 100, goods receipt 40
- **When:** Inspect status
- **Then:** Open, progress 40 of 100, outstanding 60.

### LFC-003 — Exact fulfillment becomes Completed

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (produced 100 → Completed), `packages/core/src/services/production-orders/production-order.service.test.ts` (outstanding 0.000000), `packages/core/src/domain/production-orders/production-completion.test.ts`, `tests/integration/production-completions.test.ts` (outstanding 0); the same for a PO, `tests/integration/goods-receipts-api.test.ts` (an exact receipt completes it, outstanding 0), and a customer order, `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (an exact final issue completes it). E10-S02, #89, with #84 and #87.
- **Given:** Production order 100, total produced 100
- **When:** Inspect status
- **Then:** Completed with no outstanding production supply.

### LFC-004 — Partial document Closed Early

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (target 100, 40 produced, Close Early → Closed Early, 60 abandoned, 0 outstanding; unchanged after a reversal), `packages/core/src/services/production-orders/production-order.service.test.ts` (closure posts no movement and refuses later completions; "requires components for the outstanding quantity only…": target 100, 40 produced → requirements for 60; after Close Early every component's required and shortage are 0 and there is no shortage; "requires nothing of a cancelled or completed order…"), `packages/app/src/components/production-orders/production-content.test.tsx` (a Closed Early or Cancelled order's page says it needs no more components, never the shortage warning), `tests/integration/document-lifecycle.test.ts` (UI closure of a waste-only order, stock unchanged; "plans only the outstanding quantity…": UI closure of a partly produced order, after which the page and the API detail show no requirement and no shortage). MRP's view is slice 3 (#14). E11-S01, #90; E11-S04, #144.
- **Given:** Production order 100, produced 40
- **When:** Close Early
- **Then:** Status Closed Early; no planned output/components for remaining 60.

### LFC-005 — Cannot cancel processed PO

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (a receipt makes Cancel `DOCUMENT_PROCESSED`; Close Early succeeds), `packages/app/src/app/admin/[tenant]/purchase-orders/[id]/page.test.tsx` (Close Early offered), `packages/core/src/services/goods-receipts/receipt-reversal.test.ts` and `tests/integration/document-lifecycle.test.ts` (Cancel still refused after a full receipt reversal). E11-S01, #90, with #91.
- **Given:** PO with goods receipt 1 unit
- **When:** Attempt Cancelled
- **Then:** Cancelled not permitted; may complete or Close Early consistent with processing.

### LFC-006 — Cancel never-processed PO

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (Cancelled, retained, abandoned 60, outstanding 0; its requisition's conversion kept), `tests/integration/document-lifecycle.test.ts` (API Cancel of all five document types, same-key replay, one audit entry each). MRP ignoring it is MRP-013 (slice 3). E11-S01, #90.
- **Given:** PO Open with zero goods receipts
- **When:** Cancel
- **Then:** PO remains retained with Cancelled state; not counted in future supply.

### LFC-007 — Cancellation of processed customer order blocked

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (after real issues Cancel is `DOCUMENT_PROCESSED`; Close Early keeps stock and postings), `tests/integration/document-lifecycle.test.ts` (409, then a UI Close Early; issued stock and the shipment kept), `packages/core/src/services/goods-issues/issue-reversal.test.ts` (still refused after a full issue reversal). E11-S01, #90.
- **Given:** Order with one GI posting
- **When:** Try Cancelled on whole order
- **Then:** Rejected; preserve deliveries; use early closure for undelivered remainder.

### LFC-008 — No manual reopening completed document

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (a Completed PO refuses receipts, `PURCHASE_ORDER_NOT_OPEN`), `tests/integration/goods-receipts.test.ts` and `packages/app/src/app/admin/[tenant]/purchase-orders/[id]/page.test.tsx` (no receipt action once Completed), the `cancel` and `close-early` route tests (no status field accepted), `tests/integration/document-lifecycle.test.ts` (a terminal document refuses a second transition). A reversal recalculates the status: `packages/core/src/services/goods-receipts/receipt-reversal.test.ts`, `tests/integration/stock-reversals.test.ts` (Completed PO → Open), `packages/core/src/services/production-orders/production-completion.service.test.ts` (Completed order → Open). E09-S02, #87; E11-S01/S02/S03, #90, #91, #92.
- **Given:** PO Completed after full receipt
- **When:** User attempts Open status change
- **Then:** Direct reopening unavailable; permitted reversal can recalculate state.

### LFC-009 — Order header status from lines

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("keeps the header Open while one line is complete"), `tests/integration/goods-receipts-api.test.ts`, `packages/core/src/domain/document-lifecycle/lifecycle.test.ts` (every two-line state combination), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (closing one line keeps the header Open). E09-S02, #87; E11-S01, #90.
- **Given:** PO line A completed and B still Open
- **When:** Inspect header
- **Then:** Header remains Open.

### LFC-010 — All lines fully fulfilled

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/goods-issues/goods-issue.service.test.ts`, `tests/integration/shipments-api.test.ts` and `tests/integration/shipments.test.ts` (lines A and B both issued in full: the header is Completed), `packages/core/src/domain/document-lifecycle/lifecycle.test.ts`. E08-S02, #84; E11-S01, #90.
- **Given:** Customer order lines A/B both completely issued
- **When:** Inspect header
- **Then:** Header Completed.

### LFC-011 — Mixed completed and abandoned lines

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (A fully issued, B issued 4 then Closed Early → header Closed Early), `packages/core/src/domain/document-lifecycle/lifecycle.test.ts`, `tests/integration/document-lifecycle.test.ts` (Closed Early and Cancelled lines → Closed Early). E11-S01, #90.
- **Given:** Customer order A completed and B partially issued then Closed Early
- **When:** Inspect header
- **Then:** Header Closed Early, not Completed.

### LFC-012 — Material blocked from deactivation with stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (a stocked material's deactivation is `STOCK_NOT_EMPTY` naming material, location and 2.000000 each; allowed once zero), `tests/integration/stock.test.ts` (material and location deactivation through the API: 409 `STOCK_NOT_EMPTY` with `params` material, location, 24.000000 each and the message naming them; the material's Deactivate dialog shows the same text and the material stays Active; allowed after −24), `packages/app/src/i18n/error-message.test.ts`. E07-S01, #80; #190.
- **Given:** Material has 1 physical unit at a site
- **When:** Admin deactivates material
- **Then:** Rejected with material/location/quantity as blocking condition.

### LFC-013 — Material blocked from deactivation with open PO

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("material deactivation with an open order": 409 `MATERIAL_IN_OPEN_ORDER` naming the PO, with its ID as `params.order`), `tests/integration/purchasing-api.test.ts` (the API refusal's `params.order`), `tests/integration/purchasing.test.ts` (the material's Deactivate dialog names the Open PO and links `/admin/prod/purchase-orders/{id}`, which opens it; the material stays Active), `packages/app/src/i18n/error-message.test.ts` and `packages/app/src/components/master-data/deactivation-blocker-error.test.tsx` (the message and link in English and Polish). E09-S01, #86; E09-S05, #186.
- **Given:** Material stock zero but has an open PO line
- **When:** Admin deactivates material
- **Then:** Rejected with outstanding document reference.

### LFC-014 — Material blocked from deactivation with open customer demand

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` (`MATERIAL_HAS_CUSTOMER_DEMAND` names the order, also beyond a 100-line batch, and is allowed once demand is resolved), `tests/integration/customer-orders.test.ts` (409 naming the customer order; the material's Deactivate dialog links `/admin/prod/customer-orders/{id}` for an Open order that has a line for it), `packages/app/src/components/master-data/deactivation-blocker-error.test.tsx` (the link in English and Polish). E08-S01, #83; #168.
- **Given:** Material stock zero with active undelivered order
- **When:** Admin tries deactivate
- **Then:** Rejected; user shown outstanding demand blocker.

### LFC-015 — Material deactivation after cleanup

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (a raw component with no stock, transit or Open document of its own, used by two active BOMs' current revisions, one historic revision and an Open order's pinned revision, is deactivated and audited; the BOMs, both revisions and the order, with its requirement, are unchanged). The new parent order's choice of an eligible alternative is MRP's, slice 3 (#14). E10-S05, #191.
- **Given:** Material has zero physical/transit stock, no unfinished direct operational documents, but may appear in active/historic BOMs
- **When:** Admin deactivates material
- **Then:** Deactivation allowed despite BOM-only references; historic BOM immutable and new MRP parent creation must use eligible alternative or raise inactive-input exception.

### LFC-016 — Location blocked with physical stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/stock/stock.service.test.ts` (a stocked material's and location's deactivation is `STOCK_NOT_EMPTY`, naming the material, location, quantity and unit; allowed once zero), `tests/integration/stock.test.ts` (`STOCK_NOT_EMPTY`; allowed once zero), `packages/core/src/services/imports/import.service.test.ts` (a location refusal names material, location and exact quantity). E07-S01, #80; #139.
- **Given:** Location contains nonzero stock
- **When:** Admin tries deactivate
- **Then:** Rejected and identifies nonzero balances.

### LFC-017 — Location blocked with in-transit stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` (zero physical stock but transit from or to the location: `LOCATION_HAS_OPEN_TRANSFERS` at both ends), `tests/integration/transfers-api.test.ts` (refused, allowed once resolved). E07-S03, #82.
- **Given:** Location has zero physical balance but transfer in transit from/to it
- **When:** Admin tries deactivate
- **Then:** Rejected until transfer resolved.

### LFC-018 — Location blocked with outstanding documents

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/transfers/transfer.service.test.ts` and `tests/integration/transfers-api.test.ts` (an unfinished transfer blocks deactivation, naming its ID), `packages/core/src/services/production-orders/production-order.service.test.ts` (`LOCATION_HAS_PRODUCTION_ORDERS`), `tests/integration/production-orders.test.ts` (409 with `params.order`; the dialog links `/admin/prod/production-orders/{id}`), `tests/integration/transfers.test.ts` (the location's and the material's Deactivate dialogs link `/admin/prod/transfers/{id}`, which opens the transfer), `packages/app/src/components/master-data/deactivation-blocker-error.test.tsx` (both documents link in English and Polish); an Open purchase order delivering to the location or an Open requisition at it (`LOCATION_HAS_PURCHASE_ORDERS`, `LOCATION_HAS_REQUISITIONS`, naming the document; allowed once it is Completed, Cancelled or Closed Early) in `packages/core/src/services/purchase-orders/purchase-order.service.test.ts`, `tests/integration/purchasing-api.test.ts` and `tests/integration/purchasing.test.ts` (the location's Deactivate dialog links `/admin/prod/purchase-orders/{id}`; a requisition has no page, so it is named without a link) (#141); an Open customer order at the location (`LOCATION_HAS_CUSTOMER_ORDERS`): `tests/integration/customer-orders.test.ts` (the location's Deactivate dialog links `/admin/prod/customer-orders/{id}`, which opens the order) and `deactivation-blocker-error.test.tsx` (English and Polish) (#168). E07-S03, #82; E10-S01, #88; #139.
- **Given:** Location has unfinished production order or transfer
- **When:** Admin tries deactivate
- **Then:** Rejected with blocking document links.

### LFC-019 — Location can deactivate after clearing

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** Deactivation stores Inactive and keeps the record and its history (`packages/core/src/services/named-records/named-records.test.ts`, `tests/integration/named-records.test.ts` and `named-records-api.test.ts`); new planning parameter sets and safety-stock targets refuse it and its pickers drop it (`packages/core/src/services/locations/find-location.test.ts`, `packages/core/src/services/planning-parameters/planning-parameter.service.test.ts`, `packages/core/src/services/safety-stock/safety-stock-target.service.test.ts`, `references.test.tsx`, `tests/integration/planning-parameters.test.ts`), while its existing rows stay; so do new POs and requisitions (`purchase-order.service.test.ts`, `purchase-requisition.service.test.ts`, `LOCATION_INACTIVE`). Once cleared, the refused location deactivates: stock counted to zero (`packages/core/src/services/stock/stock.service.test.ts` :128), its transfer received in full (`packages/core/src/services/transfers/transfer.service.test.ts` :710), its POs Completed, Cancelled or Closed Early and its requisitions no longer Open (`purchase-order.service.test.ts` :631–683, `tests/integration/purchasing-api.test.ts` :217); a Cancelled production order no longer blocks it (`production-order.service.test.ts` :237). E03-S02, #23, with #24; E07-S01/S03, #80, #82; E09-S03, #141; E10-S01, #88.
- **Given:** Location empty, transfers complete, no open operational documents
- **When:** Admin deactivates location
- **Then:** Inactive status stored and future selection blocked; history readable.

### LFC-020 — Customer can deactivate with open order

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/customer-orders/customer-order.service.test.ts` and `tests/integration/customer-orders.test.ts` (the customer's deactivation is allowed while an order is outstanding; the order stays editable; a new order is `CUSTOMER_INACTIVE`), `packages/core/src/services/goods-issues/goods-issue.service.test.ts` and `tests/integration/shipments-api.test.ts` (the order is still shipped and issued after the deactivation, and its fulfilled quantity rises). E08-S01, #83; E08-S04, #140.
- **Given:** Customer has outstanding order
- **When:** Admin deactivates customer
- **Then:** Allowed; existing order can still be fulfilled; new customer order blocked.

### LFC-021 — Supplier can deactivate with open PO

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (the admin deactivates a supplier with an open PO; the PO stays readable and editable; a new PO is refused), `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` (a receipt on that PO after the deactivation posts and raises stock), `tests/integration/purchasing-api.test.ts`. E09-S01, #86; E09-S03, #141.
- **Given:** Supplier has unfinished PO
- **When:** Admin deactivates supplier
- **Then:** Allowed; existing PO/GR still usable; new PO for inactive supplier blocked.

### LFC-022 — BOM deactivation doesn't strand production

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (after revision 2 and deactivation, the completion preview expects revision 1, and a completion posts with revision 1's expected quantities), `packages/core/src/services/production-orders/production-order.service.test.ts` and `tests/integration/production-orders.test.ts` (new orders refuse the deactivated BOM). E10-S02, #89; E10-S03, #143.
- **Given:** Order already pins BOM revision; admin deactivates logical BOM
- **When:** Post valid production completion
- **Then:** Existing order completes against pinned recipe, while new orders exclude deactivated alternative.

### LFC-023 — Inactive supplier excluded from new PO

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/app/src/components/purchase-requisitions/choices.test.ts` (only active suppliers offered), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` (`SUPPLIER_INACTIVE`, nothing saved), `tests/integration/purchasing-api.test.ts` (409 `SUPPLIER_INACTIVE`). E09-S01, #86.
- **Given:** Supplier inactive; new material order planned
- **When:** Attempt manual supplier assignment
- **Then:** Supplier not selectable, error shows inactive status; no PO created.

### LFC-024 — Closed Early line not counted by MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Multi-line PO one line completed, one Closed Early with 20 abandoned
- **When:** Run MRP
- **Then:** Abandoned 20 not projected as planned incoming supply.

### LFC-025 — Active BOM dependency alone does not block deactivation

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (the same test as LFC-015: the deactivation is allowed and audited as `materials.material.deactivated`, and the BOM is unchanged). MRP not selecting the recipe is slice 3 (#14). E10-S05, #191.
- **Given:** Raw R is referenced by currently active BOM of F but R has no stock/transit or unfinished direct document
- **When:** Admin deactivates R
- **Then:** Allowed, audited; historic BOM unchanged; new MRP must not select the recipe without active R.

### LFC-026 — No usable BOM with inactive component raises exception

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Output F has only an active BOM whose raw input R was deactivated
- **When:** Run MRP requesting F
- **Then:** Explicit parent Inactive BOM Component / Missing Usable BOM exception; no F production order, no PR for inactive R, unrelated materials still plan.

### LFC-027 — Deactivated BOM-only material risks existing parent production

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `packages/core/src/services/production-orders/production-order.service.test.ts` (the same test as LFC-015: the deactivation is allowed, and the Open order keeps its BOM, revision, status, version and requirement). MRP's at-risk report is slice 3 (#14). E10-S05, #191.
- **Given:** Raw material R has only active BOM references; existing order of finished F pins a recipe using R, and R has no stock/transit or unfinished direct R document
- **When:** Deactivate R then run MRP
- **Then:** Deactivation allowed; pinned order preserved; MRP reports F at-risk due to inactive R, excludes prospective F output from dependable planning and never silently auto-replaces it.

## Cross-domain end-to-end regression journeys

### E2E-001 — Raw purchase to finished customer shipment

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Empty Prod masters prepared: raw R, finished F, BOM F uses R, one site, supplier/customer, demand 10 F
- **When:** Run MRP, create PR, convert to PO, post GR, rerun and complete production, ship 10 F with GI
- **Then:** Supplier receipt increases R, completion consumes R and produces F, customer GI reduces F; order fully fulfilled and all movements auditable.

### E2E-002 — Intermediate material multi-level supply

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** F recipe uses I, I recipe uses R; all stock zero and demand for F
- **When:** Run MRP, procure R, post GR, rerun, make I, complete, rerun, make F, complete
- **Then:** MRP never assumes not-yet-feasible parent output; dependencies fulfilled in sequence with no duplicate planned or posted supply.

### E2E-003 — BOM fallback due to unavailable ingredient

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two date-valid F recipes A high priority/B low priority, only B ingredients on hand
- **When:** Run MRP then create and complete F production order
- **Then:** B revision pinned; A rejection shortage explanation visible; physical output correct.

### E2E-004 — BOM version edit while executing production

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `packages/core/src/services/production-orders/production-completion.service.test.ts` (a completion of 40 is posted on revision 1, the BOM is revised to revision 2, and the next completion still expects and stores revision 1's quantities; the order stays on revision 1, both completions keep their own lines, and both revisions keep their own components; another test posts after a revision and a deactivation). E10-S03, #143; E10-S05, #191.
- **Given:** Order pinned revision 1, partially completed; admin changes recipe to revision 2
- **When:** Post next production completion
- **Then:** Uses revision 1 expected quantities; historical production and new revision remain distinct.

### E2E-005 — Demand falls after PR auto-created

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** MRP creates PR 100, customer forecast then reduced to 70
- **When:** Rerun MRP automatic
- **Then:** No new PR, no modification of old PR; excess planned supply shown.

### E2E-006 — Two simultaneous order postings against stock

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/shipments-api.test.ts` (with 10 in stock, two order lines of 7 on two orders, each shipped, are issued at once through two accounts' tokens: one 200 and one 409 `INSUFFICIENT_STOCK` naming 3 available; the ledger is the count of 10 and one issue of 7, never below zero, stock 3, and the audit has exactly one `goods-issues.goods-issue.posted` entry, the winner's), and the same file's single-line race (two concurrent issues of 7 on one line: one goods issue, stock 3); `packages/core/src/services/goods-issues/goods-issue.service.test.ts` (two connections race: one issue, one movement, stock 3). E08-S02, #84; #192.
- **Given:** Site stock 10 with two outstanding order lines for 7 each
- **When:** Issue both from independent sessions concurrently
- **Then:** At most one GI succeeds; audit and ledger show physical stock not below zero.

### E2E-007 — Goods receipt correction affects MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 100, receipt 100 posted; 20 incorrectly received
- **When:** Reverse appropriate posted receipt line fully and post corrected line per policy, rerun MRP
- **Then:** Physical and received quantities match corrected postings; remaining supply derived correctly; history immutable.

### E2E-008 — Customer return without return module

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order fully shipped, 5 units physically returned
- **When:** Enter positive stock correction with explicit reason, rerun MRP
- **Then:** Physical stock increases, sales order remains fulfilled and no return module/document required.

### E2E-009 — Partial transfer with loss

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/document-lifecycle.test.ts` (E2E-009: with A at 100 and B at 0, a transfer planned at 60 is dispatched 60, received 50 then 5, and 5 written off through the API; it stays Open with nothing in transit, Close Early on screen makes it Closed Early with 5 abandoned; A holds 40 and B 55; the transfer's postings list the 5 kg write-off, whose audit entry names that posting). `packages/core/src/services/transfers/transfer.service.test.ts` (E2E-009: the same 60/55/5 run, the write-off's transit leg and its audit link, and the closure's audit entry; also 60/50/10). E07-S03, #82; E11-S01, #90; #190.
- **Given:** A has 100 and B 0, transfer planned 60
- **When:** Dispatch 60, receive 55, write off lost 5, close transfer
- **Then:** A stock 40, B stock 55, transit 0; transfer Closed Early, never Completed, because 5 units written off; loss linked in audit and ledger.

### E2E-010 — Test reset while Prod operations continue

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/test-reset-api.test.ts` sends a Test reset and a normal user's Prod goods receipt against Prod's open purchase order together. The server runs them one after the other, since the reset never yields, in whichever order they arrive, and the test passes in either order. Both succeed. Test moves to the next generation with its 26 demo materials back at 00000001…00000026, and its audit is empty, including an entry written just before. In Prod, the order line has received 2 kg. The receiving location's stock goes from 6 to 8 kg, and its ledger gains exactly one movement, the user's 2 kg over the API, with the earlier movements unchanged. The audit gains only the user's entries. The transfer in transit, the other location's ledger, Prod's metadata and the user accounts are unchanged. Remaining gaps: a receipt that runs *during* the reset, which one server process can't do, and the Given's MRP results, which await MRP (slice 3, #14). #189.
- **Given:** Test has demo stock, Prod contains an open PO and MRP results
- **When:** Admin resets Test while user reads/posts valid Prod GR
- **Then:** Test fully regenerated with old Test audit cleared; Prod PO, stock, audit and global user accounts unaffected.

### E2E-011 — Read-only Prod protects production

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/production-completions.test.ts` (a read-only completion POST is 409, and afterwards the output and both inputs keep the same balance and ledger, the history is empty and the order's produced, outstanding and version are unchanged; the preview and history stay readable, there is no Post button; once writable again a completion succeeds). E10-S02, #89; E10-S03, #143.
- **Given:** Prod has valid stock and open production order; admin toggles Prod read-only
- **When:** Try completion through UI and API; view latest results; switch flag off and retry
- **Then:** Writes fail while read-only with no partial movement; reads work; after writable, valid completion succeeds.

### E2E-012 — Inventory XLS correction after production variance

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Actual ingredient consumption was higher than expected; stock differs from physical count
- **When:** Upload corrected absolute stock XLS for relevant materials and locations, dry run, commit
- **Then:** Only listed positions adjusted by computed deltas, variance history preserved, next MRP starts from corrected physical stock.

### E2E-013 — Agent API retry during network failure

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/shipments-api.test.ts` (a keyed goods issue of 10 and its same-key retry: the retry is marked replayed with the original issue's ID, stock moves from 100 to 90 once, the shipment has one goods issue, the ledger one goods-issue movement and the audit exactly one `goods-issues.goods-issue.posted` entry for it; API-020, API-021). E08-S02, #84; #192.
- **Given:** Agent token issues valid GI with idempotency key, response lost
- **When:** Agent retries within 24h using same key/body then reads stock ledger
- **Then:** Only one physical issue and matching audit exists, original result returned to agent.

### E2E-014 — Normal user cannot modify master via agent

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/shipments-api.test.ts` (a normal user's token is refused a `PATCH` of an existing BOM with 403 `FORBIDDEN`, the BOM and its audit unchanged; the same token's goods issue then posts, and its `goods-issues.goods-issue.posted` entry names the account and the token on the API channel). #192.
- **Given:** Normal account has valid API token and prod business access
- **When:** Attempt master BOM edit and then valid customer GI
- **Then:** BOM edit forbidden; permitted GI succeeds with account/token audit attribution.

### E2E-015 — Import full BOM into production planning

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/import-api.test.ts` (a new BOM imported through its import reference gets a permanent ID at revision 1, and a later import makes revision 2 while revision 1 stays), `tests/integration/import.test.ts` (the same on the screen), `packages/core/src/services/imports/import-boms.test.ts` (a production order for the imported BOM's output preselects and pins it at revision 1, and keeps revision 1 and its quantities after a later import makes revision 2). Only MRP picking the recipe remains, slice 3 (#14). E05-S01, #27; E10-S05, #191.
- **Given:** New logical BOM import references existing materials via temporary Import Reference
- **When:** Dry run+commit, run MRP for feasible Make, create production order
- **Then:** Permanent BOM ID and immutable revision created, MRP picks valid recipe and order pins it.

### E2E-016 — Safety target increases during horizon

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material with target 10 today, 30 next month; demand and procurement lead time defined
- **When:** Run 90-day MRP then compare date-specific balances
- **Then:** Different daily target gaps, sensible dated supply proposals and no double counting against customer demand.

### E2E-017 — Inactivated supplier but existing procurement completes

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/purchasing-api.test.ts` ("receives an Open PO after its supplier is deactivated": the receipt posts, the PO completes, stock gains a `goods-receipt` movement naming the receipt and the PO, the audit records `goods-receipts.goods-receipt.posted`, and a new PO for that supplier is 409 `SUPPLIER_INACTIVE`); unit: `packages/core/src/services/goods-receipts/goods-receipt.service.test.ts` ("receives on an Open order whose supplier was deactivated since"), `packages/core/src/services/purchase-orders/purchase-order.service.test.ts` ("refuses an inactive supplier … for a new order", "keeps an earlier order readable and editable when its supplier is deactivated"). E09-S05, #186.
- **Given:** Supplier has existing PO, then admin makes supplier inactive
- **When:** Post GR against old PO; try create a new PO
- **Then:** Old PO receives normally with movement/audit; new PO rejected.

### E2E-018 — Language/theme/help survive Test reset

**Priority:** P1 · **Channel:** UI · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts`: a normal user chooses Polish and dark and owns a token; after each real reset (with Test writable and read-only) the API returns the same preferences, the user's token still answers and is still listed, and the user's browser session is still signed in. Revisiting the app, it renders `<html lang="pl">` in dark, the help link reads "Pomoc", and `/help` opens with the heading "Pomoc", still dark. Test's demo data is regenerated from 00000001. #93, #189.
- **Given:** Normal user selects Polish/dark and owns active token; Test has data
- **When:** Reset Test, revisit app with same user
- **Then:** Polish/dark preferences, token and sessions preserved; Test demo data regenerated.

### E2E-019 — Full-run integrity after stock reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order completed and output on-hand, completed output reversed, and input restored
- **When:** Run MRP with current demand
- **Then:** Reversed production no longer counts as physical output, remaining order need/status reflected, no double-count of historical ledger.

### E2E-020 — Reused Test IDs are safe after full reset

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/test-reset-api.test.ts`: the admin's API token, used as an agent would use it, posts a G1 goods issue with its own idempotency key, for what is left on an Open demo shipment. G1 is the test's own reset, and the reset to G2 follows within the same UTC day (a run that crosses midnight between them starts that part over, #200), so both are one day's tiny dataset; `packages/core/src/domain/demo/test-datasets.test.ts` shows that dataset has, on every day of 2025–2027, a shipment that no goods issue names, with positive lines, and that every seeded goods issue takes its shipment's lines in full (so such a shipment is Open with everything left to issue). After a real reset, G2 has a shipment with the same ID, location and material, still Open with the same quantity left to issue. The retry under G1, with its key and with a new key, is 409 `GENERATION_STALE` both times. G2's material, its stock ledger at the shipment's location, G2's goods issues and that shipment are unchanged. So are Prod's lists (first page), its transfer and order, both ledgers, the latest audit page and its metadata. The same token then creates G2's first transfer, 00000001, and a G1 key reused at G2 is a new request (material 00000027). A stale G1 edit of material 00000001 is refused the same way, with its used key and a new one (TEN-030). In `tests/integration/test-reset.test.ts`, a screen edit loaded before the reset is refused and the new material 00000001 keeps its demo description. #93, #189, #200.
- **Given:** Agent cached Test generation G1 with material 00000001 and an idempotent API GI request, while Prod operates
- **When:** Admin resets Test to G2 (new material 00000001), agent retries G1 request
- **Then:** G1 API precondition rejects retry; G2 material and stock unchanged, global token still valid for freshly scoped G2 API actions, Prod unaffected.

### E2E-021 — Provisional multi-level visibility without unsafe order creation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** F BOM uses I, I BOM uses R, all absent, R is Buy and valid
- **When:** Run automatic MRP and inspect both planning report and persisted documents
- **Then:** Report explains provisional full F/I/R hierarchy, dates and shortages; only feasible raw R PR created, zero F/I infeasible production orders; rerun after dependable supply permits higher-level executable orders.
