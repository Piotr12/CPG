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

Last updated 2026-10-20 for epic E02 (#10), against CI on `main` at `3e46bf8` (PR #57 for E02-S04 merged with green CI), plus the AUD-008 end-to-end test added with that update. Earlier: epic E01 (#9) against `9ea5973`, and its end-to-end follow-up (#52).

This document contains the complete acceptance catalogue for the CPG MVP. Each test preserves its ID, title, priority, execution channel, and Given / When / Then criteria.

## Tenant isolation, users & read-only operation

### TEN-001 — Two tenants at initialization

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenants.test.ts` (the chooser offers Test and Prod), `tests/integration/materials.test.ts`, `named-records.test.ts`, `materials-api.test.ts` and `named-records-api.test.ts` (Test starts with the demo records), `packages/core/src/demo-data.test.ts` (the startup seed fills Test, never Prod). Prod being empty on a fresh install is asserted by that unit test only: the integration files share one app. E02-S01, #19.
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

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** Creation and sign-in: `tests/integration/users.test.ts`, `packages/core/src/services/users/user.service.test.ts`. The normal user is refused every admin-only operation (`tests/integration/api-tokens.test.ts`, `packages/core/src/http/auth.test.ts`); the master-data part waits for master data (#22). E01-S02, PR #34.
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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** One active normal account
- **When:** Log in simultaneously from two different clients with same credentials
- **Then:** Both sessions remain valid and functional, with independent session identifiers.

### TEN-010 — All active users access both tenants

**Priority:** P1 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/tenants.test.ts` (Test to Prod and back, no other step), `tests/integration/navigation.test.ts` (the switch on the same screen and back, and a normal user switching from the mobile top bar), `tests/integration/users.test.ts` (a normal user opens both tenants), `packages/app/src/app/admin/[tenant]/page.test.tsx` (`requireUser`, not `requireAdmin`). E02-S01, #19.
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

- **Evidence:** `packages/core/src/services/materials/material.service.test.ts` and `packages/core/src/services/named-records/named-records.test.ts` (the same ID in both tenants, each read and changed in its own), `tests/integration/navigation.test.ts` (a record's page switches to the other tenant's list, never to a record of the same ID). E02-S01, #19, with #22 and #23.
- **Given:** Material 00000001 exists in both tenants with different descriptions
- **When:** Read material in each tenant
- **Then:** Correct tenant-local record is returned in each; no cross-tenant matching or update.

### TEN-013 — Tenant-specific stock isolation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material and location IDs coincide across two tenants
- **When:** Post +7 in Test
- **Then:** Prod stock balance remains unchanged; Test increases by 7.

### TEN-014 — Cross-tenant reference rejected

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** Data layer only: `packages/db/src/tenants/tenant-isolation.test.ts` (a reference to another tenant's record is rejected and nothing is written), the material and named-record service tests, and `tests/integration/named-records-api.test.ts` (an ID the tenant doesn't have answers 404). No business document references a material yet; the document half waits for BOMs (#26) and orders. E02-S01, #19.
- **Given:** A Test document tries to reference a Prod material ID with no Test equivalent
- **When:** Validate/create record
- **Then:** Reference is not resolved across tenants and the operation fails without writes.

### TEN-015 — Tenant read-only blocks normal writes

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The gate doesn't look at the role: `packages/core/src/http/tenant-server-action.test.ts` refuses a normal user's write to a read-only tenant with `TENANT_READ_ONLY` and runs nothing, and `tests/integration/read-only.test.ts` shows the read-only explanation on a refused screen write (the admin's). No normal user can write business data yet (materials are admin-only), so the order-creation part waits for slice 2. E02-S04, #25.
- **Given:** Prod set read-only by admin
- **When:** Normal user attempts order creation
- **Then:** No document or audit business mutation posts; clear read-only explanation.

### TEN-016 — Read-only also blocks administrator

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (the admin token's update of a Test material while Test is read-only is 409 `TENANT_READ_ONLY`, and the stored description and version remain), `tests/integration/read-only.test.ts` (on the screens, the admin's Create material from a page loaded before the flag is refused with the explanation, and nothing is stored), `packages/core/src/http/tenant-server-action.test.ts`. E02-S04, #25.
- **Given:** Test set read-only
- **When:** Admin attempts master-data update
- **Then:** Update is blocked despite admin role; previously stored values remain.

### TEN-017 — Read-only covers API writes

**Priority:** P0 · **Channel:** API · **Status:** Partially verified

- **Evidence:** `tests/integration/read-only-api.test.ts` (an admin token's material create and edit in read-only Prod, and a master-data write of every kind, answer 409 `TENANT_READ_ONLY` with nothing changed), `packages/core/src/services/idempotency/idempotency.service.test.ts` (no key is stored). The gate covers every tenant write route (`tests/api-writes.test.ts`), but the scenario's goods issue comes in slice 2, so its half waits, as for TEN-015. E02-S04, #25.
- **Given:** Prod read-only
- **When:** API attempts goods issue with otherwise valid token and idempotency key
- **Then:** Request is rejected; no inventory movement or order change is created.

### TEN-018 — Read-only allows reads

**Priority:** P1 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/read-only-api.test.ts` (materials and the tenant audit read through the API for the admin and a normal user), `tests/integration/read-only.test.ts` (the screens). Inventory and MRP reports wait for slices 2 and 3. E02-S04, #25.
- **Given:** Test read-only with records and last MRP run
- **When:** Normal user opens inventory, MRP report and audit
- **Then:** All read-only views still work.

### TEN-019 — Read-only blocks new MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Admin with Test writable and populated
- **When:** Reset Test dataset
- **Then:** Old Test business records and Test audit vanish; freshly seeded Test has a new dataset generation, all Test-local business ID sequences restart at 00000001, prior read-only state restored and Prod unchanged.

### TEN-023 — Test reset when previously read-only

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test was manually marked read-only
- **When:** Admin resets Test
- **Then:** Test regenerated with fresh dataset generation and restarted ID sequences; prior read-only remains enabled and Prod untouched.

### TEN-024 — Test reset preserves global identities

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two user accounts and API tokens with sessions exist
- **When:** Admin resets Test
- **Then:** Users, active sessions, tokens, preferences and Global audit survive unchanged.

### TEN-025 — Test reset excludes Prod

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod contains customer orders, stock and immutable audit
- **When:** Admin resets Test
- **Then:** All Prod records, balances, audit and read-only state remain identical.

### TEN-026 — Reset concurrent write safety

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** One session preparing Test update and admin resets Test
- **When:** Attempt write during reset while read-only gate active
- **Then:** Update is blocked or safely completed before reset; no partial demo data leaks into regenerated dataset.

### TEN-027 — Reset failure atomicity

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test has valid pre-reset data; reset fails mid-work
- **When:** Trigger Test regeneration fault
- **Then:** Old consistent dataset remains, original read-only setting restored and Prod not affected.

### TEN-028 — Global audit reset survival

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Global admin actions already audited
- **When:** Reset Test repeatedly
- **Then:** Global audit retains old admin events and contains a new reset event.

### TEN-029 — Test reset restarts all business ID counters

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test had material 00000047 and several documents before reset
- **When:** Administrator performs full Test reset
- **Then:** New Test generation starts all auto-generated business sequences afresh. Seeded demonstration materials receive initial IDs beginning 00000001, followed by subsequent IDs; Prod and global identities do not restart.

### TEN-030 — Old Test generation mutation is rejected

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** As API-033: a stale generation is refused before any key lookup or write (`packages/core/src/services/idempotency/idempotency.service.test.ts`, `packages/core/src/http/tenant-server-action.test.ts`). The reset itself comes in slice 2 (D06). E02-S03, #21.
- **Given:** Client prepared an API write with dataset-generation G1 and material 00000001; reset created G2 with same ID assigned to another material
- **When:** Client retries stale G1 API mutation
- **Then:** HTTP 409/428 precondition failure, no G2 record touched, even with previously used or expired idempotency key.

## Material master data, unit conversions & planning parameters

### MAT-001 — Sequential first material ID

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Empty Prod tenant
- **When:** Admin creates first material
- **Then:** Material ID is 00000001.

### MAT-002 — Sequential next IDs

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two materials already created
- **When:** Admin creates third material
- **Then:** New ID has eight digits and follows prior sequence without reuse.

### MAT-003 — Tenant-local sequence

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod has assigned 00000001; Test contains independent materials
- **When:** Create next material in Prod
- **Then:** Numbering follows Prod only, independent of Test numbering.

### MAT-004 — ID cannot be edited

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing material has stock or no stock
- **When:** Attempt change material ID
- **Then:** Edit not allowed; original immutable ID remains.

### MAT-005 — Type required

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Create material without type
- **When:** Submit through UI or API
- **Then:** Validation identifies material type as mandatory; no material created.

### MAT-006 — Three allowed types

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Create raw, intermediate and finished materials
- **When:** Save and inspect
- **Then:** All three documented types accepted and retained accurately.

### MAT-007 — Invalid material type

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** New material with unrecognized type
- **When:** Validate creation
- **Then:** Rejected with descriptive type validation; no record created.

### MAT-008 — Description and BUoM mandatory

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** New material missing description or BUoM
- **When:** Attempt save
- **Then:** Missing required fields are identified; no partial record inserted.

### MAT-009 — BUoM can change before transactional use

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has no BOM revision reference, operational document reference or inventory movement
- **When:** Admin changes base UoM
- **Then:** BUoM can change, with conversion consistency verified; after any listed reference the same change is rejected.

### MAT-010 — BUoM locked after posted stock movement

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material appears in a posted inventory movement
- **When:** Admin attempts base UoM change
- **Then:** BUoM change rejected and past quantities unaffected; same lock already applies at BOM or operational document reference.

### MAT-011 — Type locked when BOM references

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material referenced by an active or historic BOM
- **When:** Attempt material type change
- **Then:** Reject edit, preserving historical component/output semantics.

### MAT-012 — Type locked after transaction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material referenced by an order or posting
- **When:** Attempt change raw to intermediate
- **Then:** Change blocked; existing type retained.

### MAT-013 — Type editable while unused

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has no BOM references or transactions
- **When:** Admin changes type within supported set
- **Then:** Updated type stored and audited.

### MAT-014 — Raw material Buy-only

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw material assigned at one location
- **When:** Admin tries to set procurement mode Make
- **Then:** Rule rejects Make for raw material.

### MAT-015 — Intermediate Make or Buy

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Intermediate material defined at two locations
- **When:** Set one Make and another Buy
- **Then:** Both site-specific modes saved independently.

### MAT-016 — Site planning parameters present

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material-location pair with valid Make/Buy, days, minimum, lot multiple
- **When:** Save and use in MRP
- **Then:** MRP reads the parameters for that exact site/material combination.

### MAT-017 — Missing parameters explicit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material demand at a site with absent Make/Buy
- **When:** Run MRP
- **Then:** Missing Planning Parameters exception; no guessed supply document for affected material.

### MAT-018 — Calendar-day lead time

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Planning lead time 7 whole days
- **When:** MRP computes need on October 15
- **Then:** Back-scheduled start uses October 8, not seven business days earlier.

### MAT-019 — Convert case to each at input

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** BUoM each, factor 1 case = 12 each
- **When:** Enter 2 cases in transaction or BOM
- **Then:** Stored authority is 24 each; original 2 cases and factor retained for display/audit.

### MAT-020 — Convert tonne to kg

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material BUoM kg and a tonne conversion defined
- **When:** Enter 0.25 tonne
- **Then:** Stored amount is 250 kg, not 0.25 kg.

### MAT-021 — Numerator/denominator inverse

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Conversion factor 3/2 relative to BUoM
- **When:** Convert 4 alternative units and display inverse
- **Then:** BUoM calculation equals 6 and reverse representation is consistent at allowed precision.

### MAT-022 — Invalid zero denominator

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** New conversion has denominator 0
- **When:** Submit master change
- **Then:** Validation rejects conversion; prior factor, if any, stays unchanged.

### MAT-023 — Missing alternative conversion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Quantity entered in UoM not convertible for material
- **When:** Attempt save or run dependent MRP
- **Then:** Transaction cannot silently assume 1:1; actionable invalid conversion error/exception.

### MAT-024 — Exact six-decimal quantity

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Previously saved BOM uses 1 case = 12 each
- **When:** Admin changes conversion to 1 case = 10 each
- **Then:** Existing BOM/transactions remain 12 BUoM; new 1-case entries use 10 BUoM.

### MAT-028 — No retroactive BOM revision from conversion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** One BOM revision with stored component 12 each
- **When:** Update unrelated material case conversion
- **Then:** BOM revision number unchanged; stored BOM component quantity stays 12.

### MAT-029 — Inactive material excluded from new entries

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material inactive, historical PO remains
- **When:** Create new PO line using inactive material
- **Then:** New selection rejected; historical PO remains readable and eligible for completion.

### MAT-030 — BUoM locked by any historic BOM reference

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has never been posted or ordered but appears as output/input in an immutable BOM revision, active or archived
- **When:** Admin attempts BUoM edit
- **Then:** Reject change with BOM reference; preserve recipe interpretation across all historical versions.

### MAT-031 — BUoM locked by operational document without posting

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has no physical stock movements but is referenced by an unposted customer order, PR, PO or production order
- **When:** Admin changes material BUoM
- **Then:** Reject change before first physical transaction; no existing document quantity silently reinterpreted.

### MAT-032 — Non-terminating UoM conversion rounds once

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material BUoM each, alternate UoM conversion factor 1/3, user enters 1 alternate unit
- **When:** Save valid business quantity
- **Then:** Store authoritative 0.333333 each by decimal half-up rounding; preserve entered value and exact factor; reject positive input that rounds to zero.

## BOM alternatives, immutable revisions & recipe validity

### BOM-001 — Finished material may have BOM

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished material with raw component
- **When:** Create recipe
- **Then:** BOM created with required component quantities and validity.

### BOM-002 — Intermediate material may have BOM

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Intermediate output with raw input
- **When:** Create recipe
- **Then:** Intermediate BOM accepted and can feed parent recipe.

### BOM-003 — Raw material cannot be BOM output

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw material selected as recipe output
- **When:** Save BOM
- **Then:** Validation rejects recipe; no BOM revision added.

### BOM-004 — Finished material not permitted as component

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Recipe for finished output references finished component
- **When:** Save revision
- **Then:** Invalid component type error, no revision created.

### BOM-005 — Raw and intermediate components allowed

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished recipe refers to one raw and one intermediate
- **When:** Validate and save
- **Then:** Recipe accepted, with each component material and required BUoM.

### BOM-006 — Recipe per one output BUoM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Recipe needs 0.5 kg A and 0.2 litre B per finished each
- **When:** Plan 10 finished units
- **Then:** Expected component quantities are 5 kg A and 2 litres B (normalized in each material's BUoM).

### BOM-007 — Partial finished quantity scales recipe

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** One output BUoM uses 0.125 kg ingredient
- **When:** Plan 4 output BUoM
- **Then:** Computed requirement is exactly 0.5 kg.

### BOM-008 — BOM alternative count

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** One finished material has two valid alternatives with different priorities
- **When:** Read BOM master
- **Then:** Both independent logical BOM IDs and their versions remain available.

### BOM-009 — Highest priority selected when feasible

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM validity starts tomorrow
- **When:** Select BOM for production completion date today
- **Then:** BOM is excluded from eligible choices.

### BOM-013 — Validity end inclusive

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM valid through October 31
- **When:** Create order with planned completion October 31
- **Then:** BOM eligible on through date.

### BOM-014 — Validity end exceeded

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM valid through October 31
- **When:** Attempt new production order dated November 1
- **Then:** BOM not eligible; fail or use another date-valid option.

### BOM-015 — Partially overlapping equal priority

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two alternatives for same output priority 1, periods Jan–Mar and Mar–May
- **When:** Admin creates/edits second BOM
- **Then:** Rejected due to overlapping March; identifies conflicting alternative.

### BOM-016 — Fully overlapping equal priority

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two alternatives same output priority with identical validity dates
- **When:** Save second alternative
- **Then:** Validation rejects duplicate priority/overlap.

### BOM-017 — Different periods same priority

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Alternative A active Jan and B active Feb with no overlap
- **When:** Save both at same priority
- **Then:** Accepted because validity never overlaps.

### BOM-018 — Priority checks on validity edit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two different-priority or non-overlapping alternatives
- **When:** Edit date interval to create equal-priority overlap
- **Then:** Edit rejected even though priority field was not changed.

### BOM-019 — Priority checks on any BOM update

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Equal-priority overlap would result from a change to BOM definition
- **When:** Change relevant BOM fields
- **Then:** Same active-alternative uniqueness validation runs; inconsistent current selection cannot be saved.

### BOM-020 — First revision immutable after change

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM revision 1 in use
- **When:** Change a component amount
- **Then:** Revision 2 created with new amount; revision 1 and referencing production orders unchanged.

### BOM-021 — Validity edit creates revision

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Current BOM revision has from/to dates
- **When:** Admin changes valid-through
- **Then:** New immutable revision created, old revision remains intact.

### BOM-022 — Logical BOM deactivation does not create recipe revision

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Active BOM revision used by completed order
- **When:** Deactivate logical BOM via its audited active flag
- **Then:** Historical production order retains pinned original recipe, new orders cannot select inactive BOM, and status toggle creates no new immutable recipe revision.

### BOM-023 — Unchanged content no new revision

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing logical BOM revision; uploaded complete recipe identical
- **When:** Perform BOM import
- **Then:** No new revision, result marked Unchanged.

### BOM-024 — Cyclic direct ingredient blocked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM for intermediate A contains A
- **When:** Validate recipe
- **Then:** BOM rejected and offending self-cycle shown.

### BOM-025 — Cyclic indirect dependency blocked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Recipes A needs B; B needs C
- **When:** Edit C recipe to use A
- **Then:** Entire change rejected and path A → B → C → A reported.

### BOM-026 — Change can't modify existing order recipe

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order pins recipe revision 1
- **When:** Admin changes BOM to revision 2 then completes old order
- **Then:** Completion expects revision 1 quantities, not revision 2.

### BOM-027 — No mandatory auto-BOM on new Make master

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Intermediate Make material exists without any BOM
- **When:** Save master and run MRP
- **Then:** Master allowed; MRP identifies Missing BOM for affected demand.

### BOM-028 — Manual BOM override restricted by dates

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Several revisions/alternatives, one expired
- **When:** User chooses an expired revision for new production order
- **Then:** New order cannot reference expired BOM; date-valid alternatives offered.

### BOM-029 — Logical status toggle preserves revision count

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Logical BOM has immutable revisions 1 and 2 and an existing production order pins revision 1
- **When:** Admin deactivates and later reactivates logical BOM
- **Then:** Active flag/audit changes, revision 1 and 2 snapshots unchanged, no artificial revision 3; pinned order still references revision 1.

### BOM-030 — Reactivation validates competing BOM priorities

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Logical BOM alternative A active with priority 1 and overlapping validity; alternative B inactive at priority 1
- **When:** Administrator reactivates B without changing recipe
- **Then:** Activation rejected due to overlapping equal-priority selectable alternatives; B remains inactive and neither alternative gets a new immutable recipe revision.

## Master-data & BOM spreadsheet imports

### XLS-001 — Documented material template

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Admin viewing material imports
- **When:** Download XLS template
- **Then:** Template documents ID blank=create, existing=update, unknown explicit ID=error, required fields and examples.

### XLS-002 — Material import auto-generates ID

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Tenant has material IDs 00000001 and 00000002
- **When:** Dry run then import valid row with blank ID
- **Then:** Third material created with generated ID 00000003; import result shows assignment.

### XLS-003 — Known material ID updates record

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing material 00000001
- **When:** Import changed description with ID 00000001
- **Then:** Same record updated, no second material created; edit audited.

### XLS-004 — Unknown explicit material ID errors

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Import material row with ID 00009876 absent from tenant
- **When:** Run dry run
- **Then:** Error includes worksheet, row, ID and advice to leave ID blank to create.

### XLS-005 — Duplicate material IDs in workbook

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook has two material rows for 00000001
- **When:** Run dry run
- **Then:** Both relevant rows identified as conflicting; import cannot commit.

### XLS-006 — Missing required material type

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Import row without type
- **When:** Run dry run
- **Then:** Reports row/field validation failure; no partially created material.

### XLS-007 — Missing referenced location

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Planning-parameter import refers to nonexisting site
- **When:** Run dry run
- **Then:** Reference rejected with import dependency guidance; no write.

### XLS-008 — Wrong template order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM workbook references material not imported yet
- **When:** Run dry run
- **Then:** Import fails with missing-material and master dependency explanation.

### XLS-009 — Dry run reports multiple errors

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** One workbook has duplicate ID, invalid type and unknown reference
- **When:** Run dry run
- **Then:** All detectable errors listed, not just first error.

### XLS-010 — Dry run does not modify data

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook contains valid create/update rows
- **When:** Run dry run only
- **Then:** All masters, BOM revisions and audit business records unchanged.

### XLS-011 — Dry run summarizes effect

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook has one new, one modified, one unchanged record
- **When:** Run dry run
- **Then:** Preview labels create/update/unchanged and shows affected identifiers.

### XLS-012 — Commit requires successful dry run

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook never validated or validation failed
- **When:** Try commit
- **Then:** Commit is rejected; no rows written.

### XLS-013 — Import is atomic across valid rows

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook includes several valid data rows and one invalid
- **When:** Attempt import
- **Then:** Entire workbook rejected; valid rows not applied either.

### XLS-014 — Conflict after dry run

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Dry run valid for updating material 00000001
- **When:** Another session edits that material then commit import
- **Then:** Commit fails with concurrency explanation; other session's changes preserved.

### XLS-015 — Tenant read-only forbids import

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test tenant read-only
- **When:** Admin tries master import
- **Then:** Neither dry-run commit nor master changes posted; inspection-only validation may be offered without committing.

### XLS-016 — Tenant isolation during import

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test and Prod have same master business ID but different contents
- **When:** Import update in Test
- **Then:** Only Test's matching business record updated.

### XLS-017 — BOM workbook structure

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Admin downloads BOM template
- **When:** Open workbook
- **Then:** Separate header and component-line sheets with permanent BOM ID and Import Reference guidance.

### XLS-018 — New BOM temp reference

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM header has blank ID and Import Reference RECIPE-X; component lines use RECIPE-X
- **When:** Dry run and import
- **Then:** Header and lines bind one new generated logical BOM ID; no orphan components.

### XLS-019 — Two new BOMs same upload

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook creates RECIPE-A and RECIPE-B for different alternatives
- **When:** Import
- **Then:** Each component set linked to its own newly generated logical BOM; independent revisions.

### XLS-020 — Update existing logical BOM by ID

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing BOM ID with revision 2
- **When:** Import changed complete recipe for same BOM ID
- **Then:** New immutable revision 3 created and older versions retained.

### XLS-021 — Omitted component removed in new revision

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM revision lists components A/B/C; incoming recipe lists A/B
- **When:** Dry run and commit
- **Then:** Preview reports C removed; new revision contains A/B while old revision still contains A/B/C.

### XLS-022 — Identical BOM is no-op

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Imported header, dates, priority and all component data identical to current version
- **When:** Dry run and commit
- **Then:** Result marked Unchanged; no new revision or history rewrite.

### XLS-023 — BOM import priority conflict

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Uploaded BOM overlaps active same-priority alternative
- **When:** Dry run
- **Then:** BOM import rejected with conflict; no new versions created.

### XLS-024 — BOM import cycle

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Imported components form indirect cycle
- **When:** Dry run
- **Then:** Import rejected with full dependency path; none of workbook applied.

### XLS-025 — BOM import identifies specific changes

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing A 1 kg/B 2 kg, imported A 1.5 kg/C 1 kg
- **When:** Dry run
- **Then:** Preview identifies A changed, B removed and C added.

### XLS-026 — Atomic multi-sheet BOM import

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Header valid but one component row refers to invalid material
- **When:** Commit after dry run
- **Then:** Entire workbook remains unapplied; no partial header or revision.

### XLS-027 — Stable BOM ID never overwritten

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Import existing BOM ID to update content
- **When:** Commit
- **Then:** Logical BOM ID unchanged; revision changes only when content changes.

### XLS-028 — BOM import status-only change does not version recipe

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Existing BOM workbook supplies complete unchanged header recipe and component lines but toggles logical BOM active status
- **When:** Dry run then commit
- **Then:** Update audited logical active flag (subject to priority-overlap validation), report status-only change, create no new immutable recipe revision.

## Customer orders, forecasts, shipments & goods issues

### SAL-001 — Customer master required for order

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Create customer order with unknown customer ID
- **When:** Save
- **Then:** Operation fails with missing-customer reference; no order created.

### SAL-002 — Order header one location

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer order for location A
- **When:** Add two lines for different materials at location A
- **Then:** Order stores one header location and both lines.

### SAL-003 — Multiple dates per customer order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order has two lines required Monday and Friday
- **When:** Save and inspect
- **Then:** Each line keeps its own required date; header location remains shared.

### SAL-004 — No cross-location line override

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order for location A
- **When:** Try to add a line delivered from location B
- **Then:** Line rejected or user must create separate order for location B.

### SAL-005 — Customer order lifecycle begins Open

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Valid new customer order
- **When:** Create order
- **Then:** Header and active lines begin Open with fulfilled quantity zero.

### SAL-006 — Create shipment against order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Open order with two line items
- **When:** Create outbound shipment referencing it
- **Then:** Shipment references exactly one customer order; lines reference matching order lines.

### SAL-007 — Shipment can contain several lines of one order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer order has A and B lines
- **When:** Make one shipment with both lines
- **Then:** Both lines accepted under same parent order.

### SAL-008 — Shipment cannot combine customer orders

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open orders O1 and O2
- **When:** Try shipment with a line from each
- **Then:** Rejected; separate shipment required.

### SAL-009 — Shipment creation does not decrement inventory

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Stock 100, open customer order 60
- **When:** Create outgoing shipment for 60 without GI
- **Then:** Physical inventory remains 100, fulfilled quantity unchanged.

### SAL-010 — Partial GI fulfills only its line

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line A=50 and B=30, stock sufficient
- **When:** Goods issue 20 of A
- **Then:** A fulfilled 20; B fulfilled 0; respective material inventory decreases 20 only.

### SAL-011 — Multiple GI posts accumulate

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line 60, stock sufficient
- **When:** Post GI 20 then GI 25
- **Then:** Line fulfilled quantity 45, outstanding 15, header still Open.

### SAL-012 — Over-issue blocked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line 60 with 50 already fulfilled
- **When:** Post GI for 11
- **Then:** Rejected (only 10 outstanding), with no stock or demand changes.

### SAL-013 — Exact final GI marks fulfilled

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line 60 with 50 fulfilled
- **When:** Post GI 10
- **Then:** Line fully fulfilled; if all lines complete, order status becomes Completed.

### SAL-014 — Fully delivered order consumes forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, order 60 and GI 60 same original date
- **When:** Run MRP
- **Then:** Demand from those records is remaining forecast 40; no firm outstanding 60.

### SAL-015 — Early close releases abandoned forecast consumption

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, order 60 and GI 30
- **When:** Close remaining order line Early
- **Then:** MRP residual forecast 70; outstanding firm demand 0; 30 deliveries remain historical.

### SAL-016 — Cancellation restores forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, new unfulfilled order 60
- **When:** Cancel order before any GI
- **Then:** Customer order no longer consumes 60; forecast residual 100.

### SAL-017 — Open overdue order due today for MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Unfulfilled customer order due yesterday
- **When:** Run MRP today
- **Then:** Outstanding amount planned as immediately due today; original required date kept for forecast consumption.

### SAL-018 — No customer over-delivery by shipment line

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Shipment for 15 outstanding units of order line
- **When:** Try to issue 16
- **Then:** Blocked even if physical stock 100.

### SAL-019 — Change ordered quantity with no delivery

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line 60, no goods issue
- **When:** Admin/normal user changes quantity 80
- **Then:** New amount stored, audited and used by next MRP; customer forecasts update accordingly.

### SAL-020 — Quantity cannot drop below delivered

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line 60, GI 40 posted
- **When:** Edit ordered quantity to 39
- **Then:** Rejected; previous 60 retained.

### SAL-021 — Partially delivered line immutable identity

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order line partially fulfilled
- **When:** Try changing material or original due date
- **Then:** Change rejected for processed line, preserving fulfillment and forecast history.

### SAL-022 — Partially delivered location immutable

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order header has posted GI on a line
- **When:** Change order fulfillment location
- **Then:** Blocked; prior GI attribution remains at original site.

### SAL-023 — Status across multi-line order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order has line A fully fulfilled and B partially fulfilled
- **When:** Recalculate header status
- **Then:** Open while B active; Completed only when all lines fulfilled; Closed Early once unresolved parts are expressly abandoned.

### SAL-024 — No customer-return workflow

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Completed customer order and goods physically returned
- **When:** Record positive inventory correction with reason
- **Then:** Physical stock rises but original customer order stays fulfilled; no return/credit document created.

### SAL-025 — Inactive customer existing order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Active supplier and material but no requisition
- **When:** User creates PO
- **Then:** Valid PO saved without PR reference and counted as planned supply.

### BUY-003 — PO from requisition creates link

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open requisition for 100
- **When:** Create PO for 60 referencing requisition
- **Then:** Requisition converted amount becomes 60; PO line references originating requisition.

### BUY-004 — Requisition may split across POs

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Open PR for 100
- **When:** Create PO 40 to supplier A and PO 60 to supplier B
- **Then:** Both POs retained; PR converted quantity 100; its status Completed.

### BUY-005 — Suppliers unrestricted per material

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has no supplier-material mapping
- **When:** Create PO using any active supplier
- **Then:** PO accepted; no sourcing master required.

### BUY-006 — Supplier site single header

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO for location A
- **When:** Add two distinct material lines
- **Then:** Both lines belong to same location A.

### BUY-007 — PO cannot mix locations

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO header for location A
- **When:** Try line at location B
- **Then:** Reject or require separate PO; no mixed-site header.

### BUY-008 — Different delivery dates per PO line

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO has material A due Wednesday and B due Friday
- **When:** Save
- **Then:** Individual planned dates stored per line.

### BUY-009 — PR and PO do not create incoming stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw material has physical stock 0 and an open purchase requisition
- **When:** Convert PR to linked purchase order with planned delivery date, without posting GR
- **Then:** Physical on-hand remains zero; only purchase requisition, purchase order and actual goods receipt are procurement entities. The PO is planned supply; no separate incoming-shipment object exists.

### BUY-010 — Partial goods receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO line ordered 100
- **When:** Post GR line for 30
- **Then:** Physical stock +30, PO received 30, outstanding 70, PO remains Open.

### BUY-011 — Multiple receipts against same PO line

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO line 100; first receipt 30 posted
- **When:** Post second receipt 50
- **Then:** Total received 80, outstanding 20; no duplicate posted amount.

### BUY-012 — Multi-line GR from one PO

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO with material A=50 B=10
- **When:** Post GR for 20 A and 5 B in one receipt
- **Then:** Both balances update and corresponding PO lines reflect received quantities atomically.

### BUY-013 — Multi-PO GR forbidden

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two POs from same supplier
- **When:** Try receipt with a line from each PO
- **Then:** Rejected; one GR can only reference one PO.

### BUY-014 — Supplier short delivery remains open

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 100, total GR 95
- **When:** Read status and outstanding
- **Then:** PO Open with 5 remaining unless explicitly Closed Early.

### BUY-015 — PO over-delivery permitted

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO ordered 100, supplier delivers 110
- **When:** Post GR of 110
- **Then:** Warning surfaced, 110 physically accepted, PO completed and no negative outstanding.

### BUY-016 — Exact receipt completes PO

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO ordered 100
- **When:** GR 100
- **Then:** PO line completed; header Completed when all lines complete.

### BUY-017 — PO closure after partial receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO line ordered 100, received 60
- **When:** Close Early
- **Then:** Remaining 40 no longer counted as scheduled supply; actual 60 remains in inventory.

### BUY-018 — Cancelled PR no planned supply

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PR 100 unconverted
- **When:** Cancel PR
- **Then:** No outstanding tentative supply counted in next MRP.

### BUY-019 — Overdue PO considered today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO due yesterday with 40 outstanding
- **When:** Run MRP today
- **Then:** Expected supply 40 allocated today with Overdue Supply warning, no actual GR posted.

### BUY-020 — Partially received PO supplier locked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO with first receipt posted
- **When:** Attempt supplier edit
- **Then:** Edit rejected, previous supplier retained.

### BUY-021 — Partially received PO location locked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO at site A with first GR
- **When:** Attempt header location B
- **Then:** Rejected, prior stock movements stay associated with A.

### BUY-022 — Received PO line material/UoM locked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO line A with GR posted
- **When:** Try change line to material B or different stored UoM
- **Then:** Reject line identity change; existing receipt cannot be reinterpreted.

### BUY-023 — PO quantity not below received

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 100 already received 80
- **When:** Reduce ordered quantity to 79
- **Then:** Rejected, retains at least 80.

### BUY-024 — PO date editable after receipt

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO partially received, remaining supply open
- **When:** Change planned delivery date of open amount
- **Then:** Allowed and audited; next MRP uses revised planned date.

### BUY-025 — Inactive supplier blocks new PO

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished Make product has valid recipe revision 3
- **When:** Create manual production order
- **Then:** Order references BOM revision 3 explicitly; product, location, planned quantity and finish date saved.

### PRD-002 — Automatic BOM selection feasible

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two valid alternatives, top one has projected components
- **When:** Create production order with default BOM selection
- **Then:** Highest-priority feasible revision preselected.

### PRD-003 — Manual BOM override allowed

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two date-valid BOMs with different priorities
- **When:** User chooses lower-priority BOM when creating order
- **Then:** Order uses selected active date-valid revision, not automatically overwritten.

### PRD-004 — Manual order allows component shortage

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Selected BOM requires 60 kg and physical stock 30 kg
- **When:** User creates manual production order
- **Then:** Order creation allowed with explicit shortage warning; no component consumption yet.

### PRD-005 — BOM validity checked on new order

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Active recipe not valid on planned completion date
- **When:** Attempt to create order referencing recipe
- **Then:** Creation rejected or valid alternative required.

### PRD-006 — Existing order survives BOM change

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order pins revision 1; admin creates revision 2 and deactivates old alternative
- **When:** Open original order
- **Then:** Pinned revision 1 still available for completion; recipe unchanged.

### PRD-007 — Planned start from lead time

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Make lead time 5 days, planned completion October 15
- **When:** Create order
- **Then:** Derived planned start October 10, respecting calendar days.

### PRD-008 — No capacity scheduling required

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two orders share same production dates at one location
- **When:** Save both
- **Then:** Orders can coexist; no machine/resource allocation required or enforced.

### PRD-009 — No stock at order creation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material components currently unavailable
- **When:** Create future production order
- **Then:** No physical stock changes; planned projected requirements are reflected in MRP.

### PRD-010 — Production expected consumption prefill

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** BOM per 1 each: 0.5 kg A, 2 each B
- **When:** Post completion for 4 finished each
- **Then:** Form proposes 2 kg A and 8 each B before edits.

### PRD-011 — Production partial completion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order planned 100, components available
- **When:** Post output 40 and actual components
- **Then:** 40 finished posted, component stock decreased by actual amounts, outstanding production 60.

### PRD-012 — Repeated partial completions

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order 100, first completion 40
- **When:** Post second completion 25
- **Then:** Actual produced 65, remaining target 35, prior postings preserved.

### PRD-013 — Actual consumption below BOM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Expected ingredient 20 kg for 40 output
- **When:** Record 18 kg actual on completion
- **Then:** Only 18 kg consumed, variance −2 kg recorded and inventory decremented by 18.

### PRD-014 — Actual consumption above BOM

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Expected ingredient 20 kg for 40 output; stock supports 23
- **When:** Record 23 kg actual
- **Then:** 23 kg consumed, variance +3 kg visible and audited.

### PRD-015 — Add extra raw input

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion BOM lacks material X but raw X exists in stock
- **When:** Add 2 kg X to actual consumption
- **Then:** Extra material consumed and variance recorded, subject to stock validation.

### PRD-016 — Add extra intermediate input

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion requires additional intermediate component not in BOM
- **When:** Post it as actual consumption
- **Then:** Additional intermediate consumption accepted and tracked.

### PRD-017 — Reject extra finished component

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion attempt adds a finished good as component
- **When:** Submit
- **Then:** Rejected under component material type rules; no partial stock posting.

### PRD-018 — Zero-output waste

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Open order and component A stock sufficient
- **When:** Post completion with output 0 and A consumed 10
- **Then:** A −10 physical, finished output unchanged, waste/variance recorded, order remains Open.

### PRD-019 — Overproduction warning but accept

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order planned 100 and produced 95
- **When:** Post completion output 10 with sufficient components
- **Then:** Warn output exceeds plan; if accepted, actual output 105 and order Completed.

### PRD-020 — Negative ingredient stock blocks completion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Input A stock 5, actual consumption 6
- **When:** Post completion producing 10
- **Then:** Entire completion fails; neither finished goods nor input movements posted.

### PRD-021 — Atomic inputs plus output

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion uses input A and B and creates product C; B would go negative
- **When:** Try post all
- **Then:** No movement for A, B or C; order completion count unchanged.

### PRD-022 — Physical stock unchanged by planning

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order created for 50 future finished units
- **When:** View inventory before any completion
- **Then:** Physical finished stock unchanged; MRP may account for planned output.

### PRD-023 — Post completion dated today

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order planned finish next week
- **When:** Record actual completion today
- **Then:** Actual movement's business posting date is today, not future planned finish.

### PRD-024 — Production order partial edit locks recipe

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order has first completion posted
- **When:** Try change output material, site or BOM revision
- **Then:** All those identity changes rejected.

### PRD-025 — Production target may increase

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order target 100, actual output 40
- **When:** Change target to 120
- **Then:** Change audited and MRP outstanding production becomes 80.

### PRD-026 — Production target cannot drop below actual

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order output 40 already posted
- **When:** Change planned target to 39
- **Then:** Rejected; target and actual posting unchanged.

### PRD-027 — Production planned finish editable

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Order partially completed
- **When:** Change remaining planned finish date
- **Then:** Edit allowed and audited; MRP uses updated date.

### PRD-028 — Past variance not extrapolated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order 100, produced 40 using twice normal BOM input
- **When:** Run MRP for remaining 60
- **Then:** Remaining component requirement based on recipe for 60, not inferred doubled consumption.

### PRD-029 — Close partial order early

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order 100 has 40 physically produced
- **When:** Close Early
- **Then:** 40 output remains; remaining planned output 60 and component need drop from MRP.

### PRD-030 — Completed order no unfinished requirement

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order planned 100 and produced 100
- **When:** Run MRP
- **Then:** Order has zero outstanding finished output and component need.

## Physical inventory, postings & stock integrity

### INV-001 — Inventory balance starts zero

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** New material-location pair has no movement
- **When:** Query inventory
- **Then:** Physical on-hand is zero, not negative or undefined.

### INV-002 — Goods receipt increases only target material/site

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material A at location X on-hand 10
- **When:** Post GR +4 for A at X
- **Then:** A/X becomes 14; other material/site balances unchanged.

### INV-003 — Goods issue reduces only target stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material A at location X on-hand 10 and matching customer order
- **When:** Post GI for 3
- **Then:** A/X becomes 7; linked order fulfillment +3.

### INV-004 — Production posts both signs

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw input A 100, finished output F 0
- **When:** Complete production with actual A used 25 and F produced 10
- **Then:** A 75, F 10, same atomic posting group.

### INV-005 — No negative stock on GI

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Goods issue requests 11 from 10 on-hand
- **When:** Attempt posting
- **Then:** Rejected with exact available/required context; on-hand stays 10.

### INV-006 — No negative stock on manual correction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material on-hand 2
- **When:** Enter signed adjustment −3
- **Then:** Rejected; no inventory movement or business audit entry for committed stock change.

### INV-007 — Zero stock is permitted

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material on-hand 10
- **When:** Post valid issue of exactly 10
- **Then:** Remaining stock exactly zero.

### INV-008 — Negative projected stock differs from actual

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Actual on-hand 5 and future firm demand 20
- **When:** Run MRP
- **Then:** MRP may show −15 projected before replenishment, while on-hand stays 5.

### INV-009 — Transfer in-transit not physical

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Site A physical 100, site B 0
- **When:** Dispatch transfer 30 without receipt
- **Then:** A physical 70, B physical 0, transfer in-transit 30.

### INV-010 — Daily posting not backdated

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Today's business date set by runtime, planned document dated last week
- **When:** Post actual GR
- **Then:** Movement uses today's date; planned document date stays last week.

### INV-011 — Cannot future-date goods issue

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** User tries to enter future actual-posting date
- **When:** Submit actual GI
- **Then:** System posts only with today's business date; no future-dated ledger entry.

### INV-012 — All stock movements have source

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Post GR, GI, completion and manual correction
- **When:** Inspect stock ledger
- **Then:** Each movement shows material, site, date, signed BUoM quantity, type and source document.

### INV-013 — Stock ledger is separate from audit

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Stock adjustment changes balance
- **When:** Read ledger and audit
- **Then:** Ledger shows quantity movement and reason; audit shows who changed which records with before/after.

### INV-014 — Manual correction requires reason

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Normal user opens adjustment on stocked material
- **When:** Submit adjustment without reason
- **Then:** Validation prevents posting until nonempty reason supplied.

### INV-015 — Both roles can adjust stock

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Normal user and admin have valid logins
- **When:** Each posts a valid adjustment
- **Then:** Both succeed with proper attribution and correct balance.

### INV-016 — Opening balance uses ordinary posting

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod empty; A/X on-hand 0
- **When:** User records +100 with reason Opening Balance
- **Then:** On-hand 100 with inventory movement +100 and audit, not silent balance injection.

### INV-017 — Customer physical return as adjustment

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Fulfilled customer sale and product returned to warehouse
- **When:** Post positive inventory correction with reason
- **Then:** Physical stock increases, original customer order fulfilled amount unchanged.

### INV-018 — Physical balances tenant-local

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test and Prod each have same material/location IDs
- **When:** Post movement in Prod only
- **Then:** Test balance unchanged; separate movement-ledger/audit event.

### INV-019 — Invalid material reference

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material ID absent in selected tenant
- **When:** Submit inventory movement
- **Then:** Rejected by referential integrity; no ledger or on-hand changes.

### INV-020 — Inactive location blocks new business posting

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Site inactive, no active documents
- **When:** Try new inventory receipt or order at inactive site
- **Then:** New operation cannot select inactive site.

### INV-021 — Physical stock never below zero in race

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Stock 10, two concurrent sessions each issue 7
- **When:** Post both near-simultaneously
- **Then:** At most one commits; no balance −4 or two successful GI movements.

### INV-022 — Read-only blocks physical stock changes

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Tenant flag read-only
- **When:** Post otherwise valid receipt, issue and adjustment
- **Then:** All rejected with no movements.

### INV-023 — Stock calculations BUoM only

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Input quantity 2 cases, factor 12 each per case
- **When:** Post valid receipt
- **Then:** Movement amount is +24 each and query shows BUoM authority.

### INV-024 — Purchase order expected, goods receipt physical

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO 100 exists with delivery date and no goods receipt
- **When:** Inspect on-hand, then post valid GR for 40
- **Then:** Physical stock stays unchanged before GR then increases by 40 exactly once; PR/PO do not create an incoming-shipment document.

### INV-025 — Physical stock updated once per completion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Same production completion posted successfully once
- **When:** Inspect all affected stock balances
- **Then:** Input and output movements equal exactly actual once, no duplicate from status update or reporting.

## Corrections and reversible physical postings

### REV-001 — Goods receipt single-line reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** GR line posted +100, at least 100 stock remains
- **When:** Reverse original GR line with reason
- **Then:** One −100 movement posted today, linked original marked reversed, stock restored to pre-GR amount.

### REV-002 — GR reversal blocked by insufficient stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** GR line +100, only 40 remains after other operations
- **When:** Try full reversal
- **Then:** Rejected; GR remains active, no partial −40 movement inserted.

### REV-003 — GI line reversal restores stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** GI line −20 already fulfilled customer order
- **When:** Reverse entire line with reason
- **Then:** Inventory +20 and fulfilled customer line −20; order lifecycle recalculated atomically.

### REV-004 — Other GR lines unaffected

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Multi-line GR A/B/C, B wrong
- **When:** Reverse entire B posting
- **Then:** A/C movement and received quantities unchanged; B fully reversed.

### REV-005 — Other GI lines unaffected

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two issued lines in one shipment
- **When:** Reverse one issued line
- **Then:** Only that material/line stock and fulfillment change.

### REV-006 — Partial mistaken GR corrected via two postings

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** GR line originally +100 but should have been +80
- **When:** Reverse full 100 and post corrected +80
- **Then:** Final net movement +80, historical +100/−100/+80 independently visible.

### REV-007 — Double reversal rejected

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Posting already reversed once
- **When:** Attempt second reversal of original posting
- **Then:** Rejected; no second compensating movement created.

### REV-008 — Reversal requires reason

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Valid unreversed GI/GR line
- **When:** Submit reversal with empty reason
- **Then:** Validation rejects; nothing changed.

### REV-009 — Reversal dated today only

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Original receipt posted last month
- **When:** Reverse it today
- **Then:** Reversal movement date today, original unchanged; both dates visible.

### REV-010 — Manual adjustment reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Adjustment −5 or +5 previously posted
- **When:** Reverse with valid reason and sufficient stock
- **Then:** Inverse quantity posted once, linked to original, balance correctly restored.

### REV-011 — Production completion full reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion +10 finished F and −25 A/−15 B; F stock at least 10
- **When:** Reverse completion
- **Then:** F −10, A +25, B +15 atomically; completion/order produced amount decremented.

### REV-012 — Production reversal output check

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Completion +10 F, only 9 F now physically available
- **When:** Request reversal
- **Then:** Rejected before any component is returned or order quantities changed.

### REV-013 — Production zero-output waste reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Waste-only posting F +0, A −10
- **When:** Reverse it
- **Then:** A restored +10; finished output remains unchanged; historic waste posting preserved.

### REV-014 — One partial completion reversal leaves others

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order has completion 40 and completion 25
- **When:** Reverse completion 25 only
- **Then:** Only corresponding actual movements reversed; output 40 remains and planned outstanding recalculated.

### REV-015 — Reversal recomputes document state

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer order Completed after full GI
- **When:** Reverse final issued line
- **Then:** Order reverts to Open if amount outstanding; new demand available to subsequent MRP.

### REV-016 — PO receipt reversal recomputes received amount

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO Completed after receiving 100
- **When:** Reverse GR line for 30
- **Then:** PO received 70, outstanding 30 and status Open (unless explicitly closed).

### REV-017 — Reversal respects tenant read-only

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Tenant is read-only, physical posting exists
- **When:** Attempt reversal
- **Then:** Rejected like other business writes, original posting and balances unchanged.

### REV-018 — Production reversal is atomic across components

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Reversal would require finished stock not available
- **When:** Attempt reversal despite input balances being valid
- **Then:** No finished stock movement, input restoration or document update takes effect.

### REV-019 — API duplicate reversal prevented

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Reversal request successfully executed and client retries same key
- **When:** Retry identical payload
- **Then:** Original response returned, no duplicate inverse posting; a distinct key attempting second reversal is also rejected.

### REV-020 — Audit ties correction to original

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two linked original/reversal ledger postings exist
- **When:** View user audit trail
- **Then:** Both operations and original-reversal relationship visible, with reason and before/after.

### REV-021 — Rare full reversal with reversible temporary stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Original GR +100, downstream GI 80, stock 20; true GR should have been +90
- **When:** Adjust stock temporarily +80 with reason, reverse original GR −100, post corrected GR +90, reverse temporary adjustment −80
- **Then:** Final stock is 10, matching correct historical net. All ledger postings/reversals remain auditable, no step negative and no temporary +80 left unbalanced.

## Location transfers, in-transit balances & exceptions

### TRF-001 — Transfer requires two physical locations

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two active locations A/B and material M
- **When:** Create transfer from A to B with planned dates and quantity
- **Then:** Single-material transfer saved with source/destination and expected dates.

### TRF-002 — Transfer single material

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Two materials M/N intended to move
- **When:** Attempt to put both in one transfer document
- **Then:** Must create separate transfer documents; no multi-material transfer.

### TRF-003 — Transfer creation no physical effect

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Source A on-hand 100, target B on-hand 0
- **When:** Create planned transfer 50
- **Then:** A and B physical balances unchanged; MRP may schedule proposed dispatch/arrival.

### TRF-004 — Partial dispatch adds in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer 100, source stock 100
- **When:** Post goods issue 60
- **Then:** A decreases 60, B unchanged, in-transit +60, undispached balance 40.

### TRF-005 — Further dispatch of outstanding

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer 100, dispatched 60, source remaining sufficient
- **When:** Post additional dispatch 40
- **Then:** Total dispatched 100, in-transit 100 until receipts; undispached 0.

### TRF-006 — Partial destination receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer has in-transit 60
- **When:** Post destination receipt 50
- **Then:** Destination increases 50, in-transit decreases to 10; source remains unchanged.

### TRF-007 — Cannot receive more than dispatched

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer dispatched 60 and received 50
- **When:** Try destination receipt 11
- **Then:** Rejected; in-transit remains 10, no destination stock added.

### TRF-008 — Cannot dispatch more than source physical stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Source currently 15, transfer outstanding 40
- **When:** Post dispatch 20
- **Then:** Rejected; source stock remains nonnegative and in-transit unchanged.

### TRF-009 — Transfer can be partially dispatched

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Source has 60, planned transfer 100
- **When:** Post dispatch 60
- **Then:** Allowed; 40 remains undispatched and transfer stays Open.

### TRF-010 — In-transit not available at source

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material 60 in-transit from A to B
- **When:** Attempt new GI from A exceeding remaining physical stock
- **Then:** Reject despite transfer's in-transit quantity.

### TRF-011 — In-transit not available at destination

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** B physical 0, transfer has 60 in-transit
- **When:** Try production consumption 5 at B
- **Then:** Rejected until destination goods receipt posted.

### TRF-012 — Transfer cannot close with transit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer dispatched 60, received 50, transit 10
- **When:** Request Closed Early
- **Then:** Rejected with 10 remaining in transit.

### TRF-013 — Write-off lost transit quantity

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer in-transit 10, missing 10
- **When:** Post dedicated transfer write-off 10 with reason
- **Then:** In-transit becomes 0; reason, source and audit recorded.

### TRF-014 — Write-off not generic inventory adjustment

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer has 10 in transit
- **When:** Try ordinary per-location inventory correction on in-transit
- **Then:** Rejected; use dedicated transfer write-off/reversal.

### TRF-015 — Close Early after clearing in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer receipt 50 already at destination, destination stock sufficient
- **When:** Reverse receipt in full
- **Then:** Destination −50 and in-transit +50, linked reversal and audit.

### TRF-020 — Source dispatch reversal blocked by downstream receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer dispatched 60 and received 50
- **When:** Attempt source GI reversal directly
- **Then:** Reject until destination receipt (and any write-off) is reversed first.

### TRF-021 — Source dispatch reversal after downstream unwound

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer dispatched 60, destination receipt and write-off correctly reversed
- **When:** Reverse source issue
- **Then:** In-transit decreases by original dispatch amount, source physical stock restored; no negative balances.

### TRF-022 — Transfer cannot mix tenants

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** A in Test, B in Prod
- **When:** Attempt transfer A→B
- **Then:** Cross-tenant reference rejected; neither tenant's inventory changes.

### TRF-023 — Transfer plan and actual dates separate

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer planned yesterday but physically dispatched today
- **When:** Post dispatch
- **Then:** Movement dated today; original planned date retained for reports/overdue logic.

### TRF-024 — Transfer stock ledger traceable

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer issued 60 and received 50
- **When:** Inspect ledger at A, transit, B
- **Then:** Shows −60 source, +60 transit, −50 transit, +50 destination with common transfer source.

### TRF-025 — Lost quantity resolves as Closed Early

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Planned transfer 60 was fully dispatched, 55 received at destination and 5 lost with linked write-off
- **When:** Close transfer with zero in transit
- **Then:** Transfer closes as Closed Early rather than Completed, even though every dispatched unit is accounted for.

### TRF-026 — Transfer distinct sites and chronological dates

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** User proposes transfer from site A to A, or planned arrival earlier than planned dispatch
- **When:** Validate transfer creation or edit
- **Then:** Reject same-source destination and planned arrival-before-dispatch, leaving previous document unchanged.

### TRF-027 — Write-off reversal can reopen previously closed transfer

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer Closed Early after loss was written off and transit reached zero
- **When:** Reverse linked write-off with valid reason
- **Then:** Lost amount returns to in-transit and transfer status automatically recalculates to Open; it cannot remain closed with stock in transit.

## Demand forecast, safety stock & firm-order prioritization

### DEM-001 — Forecast no customer dimension

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast for material M, site L, date D
- **When:** Create forecast record
- **Then:** Material/site/day/qty/UoM retained; customer not needed.

### DEM-002 — Forecast and order same day net demand

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast M/L/D=100; customer order M/L/D=60
- **When:** Run MRP
- **Then:** Total demand 100, decomposed 60 firm plus 40 residual forecast.

### DEM-003 — Firm orders greater than forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100 and orders 120 same M/L/D
- **When:** Run MRP
- **Then:** Total demand 120 firm, residual forecast zero, not 220.

### DEM-004 — No order leaves forecast

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100 and no customer order matching
- **When:** Run MRP
- **Then:** Demand 100 forecast.

### DEM-005 — Forecast isolated by material

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast A 100, customer order B 60 on same site/day
- **When:** Run MRP
- **Then:** A forecast remains 100; B customer order remains 60.

### DEM-006 — Forecast isolated by location

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast M at A=100, order M at B=60
- **When:** Run MRP
- **Then:** A forecast unaffected by order at B.

### DEM-007 — Forecast isolated by original date

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast M/L Monday 100; customer order M/L Tuesday 60
- **When:** Run MRP
- **Then:** Tuesday order does not consume Monday forecast.

### DEM-008 — Partial fulfillment no double count

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, ordered 60, physically shipped 30
- **When:** Run MRP
- **Then:** Remaining firm 30 and residual forecast 40; total outstanding demand 70.

### DEM-009 — Fully fulfilled order doesn't restore forecast

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, customer order 60 fully shipped
- **When:** Run MRP
- **Then:** Outstanding firm zero; residual forecast 40.

### DEM-010 — Early closure releases undelivered forecast consumption

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, order 60, GI 30, close rest Early
- **When:** Run MRP
- **Then:** Residual forecast 70, outstanding firm 0.

### DEM-011 — Cancellation before fulfillment releases all

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Forecast 100, matching order 60 not fulfilled
- **When:** Cancel order then run MRP
- **Then:** Residual forecast returns to 100.

### DEM-012 — Overdue outstanding demand today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order 40 due yesterday, nothing shipped
- **When:** Run MRP today
- **Then:** Demand 40 immediately due in today's planning bucket, original due date retained.

### DEM-013 — Overdue fulfillment retains original forecast mapping

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Monday forecast 100, order 60 due Monday, now Wednesday and unfulfilled
- **When:** Run MRP Wednesday
- **Then:** Order still consumes Monday forecast; overdue outstanding firm need due today.

### DEM-014 — Safety target default zero

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material/site has no safety-stock record
- **When:** Run MRP
- **Then:** Safety gap uses target zero; no fictitious safety stock created.

### DEM-015 — Safety target becomes valid from date

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Safety target M/L 100 effective January 1
- **When:** Calculate January 1 through January 15
- **Then:** Target 100 each day unless superseded.

### DEM-016 — Safety target changes over time

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Target 100 from January 1 and 150 from February 1
- **When:** Run MRP across boundary
- **Then:** January uses 100; February uses 150.

### DEM-017 — Same-day duplicate safety target forbidden

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Tenant has three active sites and valid demand at all
- **When:** Run MRP
- **Then:** All three sites included; none silently omitted.

### MRP-002 — MRP does not cross tenants

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod and Test contain coincident material IDs but different demand
- **When:** Run Prod MRP
- **Then:** Results derived solely from Prod; Test unaffected.

### MRP-003 — 90 days includes today

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Fixed today 1 October
- **When:** Run MRP
- **Then:** Daily result buckets include October 1 through December 29 inclusive; 90 dates total.

### MRP-004 — 90-day projection with separate later supply dates

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Fixed today 1 October with demand on Dec 30
- **When:** Run MRP
- **Then:** Inventory daily buckets stop on day 89 and demand on day 90 is not silently included; independently justified earliest-supply recommendations later than day 89 appear separately with Beyond Horizon warning, not credited inside buckets.

### MRP-005 — Daily granularity retained

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Demand changed but no user starts MRP
- **When:** Wait or browse UI
- **Then:** No automatic MRP run generated merely by change.

### RUN-002 — Manual run records timestamp and ID

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** New Prod tenant with no stock
- **When:** Normal user downloads opening balance XLS
- **Then:** Template documents material, location, physical desired quantity, UoM and mandatory reason; examples understandable.

### STX-002 — Opening balance creates ordinary movements

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod M/X on-hand 0, opening XLS contains 100
- **When:** Dry run and commit
- **Then:** Posts +100 stock adjustment with Opening Balance reason; signed movement and audit recorded.

### STX-003 — Actual balance not delta

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** M/X stock 100, Excel cell desired 85
- **When:** Commit validated correction
- **Then:** Only −15 movement posted, final stock 85.

### STX-004 — Increase current balance

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** M/X stock 100, target Excel balance 130
- **When:** Commit validated correction
- **Then:** Movement +30 posted, ending stock 130.

### STX-005 — Unchanged physical value no movement

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** M/X stock 100, target Excel balance 100
- **When:** Dry run and import
- **Then:** Shows No change and does not post pointless stock movement.

### STX-006 — Partial location selection

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Three sites A/B/C have stock; workbook only site A
- **When:** Commit import
- **Then:** A targeted positions updated; B/C exactly unchanged.

### STX-007 — Partial material selection

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Site A holds material M and N, file lists only M
- **When:** Commit import
- **Then:** Only M potentially changed, N unchanged.

### STX-008 — No implicit zero for missing rows

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Site A has 20 positions, workbook lists 3
- **When:** Commit import
- **Then:** Other 17 positions are not set to zero.

### STX-009 — Zero desired quantity allowed

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material/site stock 100, correction row 0
- **When:** Commit
- **Then:** Post −100, final physical stock exactly zero.

### STX-010 — Negative factual quantity rejected

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** File claims desired physical balance −1
- **When:** Dry run
- **Then:** Invalid quantity error, no import.

### STX-011 — Unknown material in correction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** File refers to nonexistent material ID
- **When:** Dry run
- **Then:** Sheet/row/material error with corrective advice; no stock change.

### STX-012 — Unknown location in correction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** File refers to unknown location ID
- **When:** Dry run
- **Then:** Reference error, no stock change.

### STX-013 — Duplicate material-location correction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Two XLS rows for same material/site with different quantities
- **When:** Dry run
- **Then:** Duplicate key flagged, import cannot commit.

### STX-014 — Mandatory reason for bulk correction

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Valid correction workbook but no correction reason
- **When:** Attempt commit
- **Then:** Rejected; movement and audit unchanged.

### STX-015 — Different existing conversion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** File quantity 2 cases, material BUoM each, defined conversion 12
- **When:** Dry run and commit
- **Then:** Desired final physical balance is 24 each, not +24 on top of current balance.

### STX-016 — Stock changed after dry run

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Dry run sees on-hand 100 and target 85; another user posts GI −10
- **When:** Commit old preview
- **Then:** Rejected due to stale physical balance; does not overwrite concurrent stock.

### STX-017 — Multiple corrections all-or-nothing

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Workbook includes two valid positions and one invalid
- **When:** Try commit
- **Then:** No position changes, error list includes offending record.

### STX-018 — Role parity for correction

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Normal user and admin have write access
- **When:** Each executes equivalent validated correction workflow
- **Then:** Both can commit, with their own account/session attribution.

### STX-019 — Tenant read-only blocks corrections

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod marked read-only
- **When:** Attempt correction XLS commit
- **Then:** No stock or audit business writes; actionable blocked message.

### STX-020 — In-transit excluded from XLS corrections

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transfer contains 10 in transit
- **When:** Try to include transit as ordinary location correction
- **Then:** Not accepted as physical location balance; dedicated transfer write-off/reversal required.

### STX-021 — Audit signed deltas from absolute input

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** API · **Status:** Partially verified

- **Evidence:** A normal user's token is refused (403) on admin-only operations, end to end: `GET /api/users` in `tests/integration/api-tokens.test.ts`; `POST /api/users`, `PATCH /api/users/{id}` and `PUT /api/users/{id}/password` in `tests/integration/api-users.test.ts`, where the same token still changes its own preferences; unit tests in `packages/app/src/app/api/users/**/route.test.ts` and `packages/app/src/auth/api-write.test.ts`. "Change master material" waits for master data (#22). E01-S03, PRs #41, #48; #52.
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

- **Evidence:** `tests/integration/tenants.test.ts` (one tenant read by its path; an unknown tenant is 404), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (one token writes Prod and Test separately, each through `/api/tenants/{tenant}/…`), `tests/tenant-entry-points.test.ts` (every tenant route sits under `api/tenants/[tenant]/`), `packages/app/src/app/api/tenants/[tenant]/route.test.ts`. E02-S01, #19.
- **Given:** One account accesses Test and Prod
- **When:** Use authorized API call selecting Test then Prod
- **Then:** Each request affects only specified tenant; no implicit cross-tenant data read/write.

### API-014 — API/UI role parity for reports

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Normal account uses report UI and API
- **When:** Read inventory and latest MRP
- **Then:** Equivalent tenant-specific report content available in both channels.

### API-015 — API/UI parity for dry run

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Admin can run master XLS dry run in UI
- **When:** Run equivalent via API
- **Then:** Same validation and preview behavior, same authorization; no API-only skip.

### API-016 — API/UI parity for reversals

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Normal user can reverse posted GI line in UI
- **When:** Use corresponding API action with authorized token
- **Then:** Same no-negative check, reason requirement, once-only rule and audit.

### API-017 — API/UI parity for admin reset

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Admin can trigger Test reset in UI
- **When:** Execute through admin bearer API
- **Then:** Same authorization, read-only safeguards and full atomic reset; normal token forbidden.

### API-018 — API error has stable code and message

**Priority:** P1 · **Channel:** API · **Status:** Partially verified

- **Evidence:** `tests/integration/materials-api.test.ts` (an incomplete material is refused with a stable code and every missing field named, and nothing is created). No mutating call references another material yet, so the unknown-reference case waits for BOMs (#26). E02-S03, #21, with #22.
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

**Priority:** P0 · **Channel:** API · **Status:** Partially verified

- **Evidence:** `tests/integration/api-idempotency.test.ts` (a keyed create makes exactly one record and answers it). Goods issues and the ledger come in slice 2. E02-S03, #21.
- **Given:** Valid token and key K in Test
- **When:** Post GI of 10
- **Then:** Exactly one GI and ledger movement created with successful response.

### API-021 — Same key same body returns cached result

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (the replay answers byte for byte and creates nothing; a token revoke replays), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (once per key). E02-S03, #21.
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

- **Evidence:** `packages/core/src/services/idempotency/idempotency.service.test.ts` ("keeps keys separate per tenant": each tenant has its own key store). Unit level; no integration test sends one key to both tenants yet. E02-S03, #21.
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

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Inventory correction XLS committed with key K
- **When:** Retry same API mutation
- **Then:** Same outcome returned; no second adjustment generated.

### API-029 — Optimistic API version conflict

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts` (users), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (a stale version is 409 `VERSION_CONFLICT` and the newer change stays), the services' and routes' unit tests. E02-S03, #21, with #22 and #23.
- **Given:** Object version 2 loaded by client A, edited to v3 by B
- **When:** Client A attempts update expecting v2
- **Then:** HTTP 409 and clear version conflict; v3 preserved.

### API-030 — API cannot bypass tenant read-only

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/read-only-api.test.ts` (an admin token's update of a Prod material is 409 `TENANT_READ_ONLY` and changes nothing). E02-S04, #25.
- **Given:** Prod read-only and admin token provided
- **When:** Try admin-originated business record update via API
- **Then:** Blocked regardless of token privilege; no write.

### API-031 — Global API actions scoped without tenant data leakage

**Priority:** P0 · **Channel:** API · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** The precondition is built: `packages/core/src/services/idempotency/idempotency.service.test.ts` (a stale generation is refused even for a key whose result is stored), `packages/core/src/domain/tenants/generation.test.ts` (409). The Test reset that makes a generation stale comes in slice 2 (D06), which must also delete Test's key records (spec `implemented/2026-10-19--1548UTC-api-idempotency`, Q8). E02-S03, #21.
- **Given:** Test generation G1 processed keyed stock operation; Test reset seeded G2 with same material ID
- **When:** Replay G1 payload with same key inside or outside 24 hours
- **Then:** Request rejected as stale generation and never returns a success affecting G2 or writes G2 stock. Global credentials remain valid for new correctly scoped requests.

### API-034 — Tenant metadata supplies current Test-generation precondition

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/tenants.test.ts` (tenant metadata gives the generation), `tests/integration/materials-api.test.ts` and `named-records-api.test.ts` (a Test write without it is 428, with the current one it succeeds), `packages/core/src/domain/tenants/generation.test.ts` and `packages/app/src/auth/api-write.test.ts` (a stale one is 409). The stale case after a real reset waits for slice 2 (D06). E02-S03, #21.
- **Given:** User bearer token can read Test and Prod tenant metadata; Test dataset generation is G1
- **When:** Make Test mutation without precondition, with G1, and after reset with old G1
- **Then:** Missing generation rejected (HTTP 428), current G1 mutation may succeed subject to ordinary rules, stale G1 after reset G2 rejected (HTTP 409). Current generation is available from tenant metadata.

## Audit, concurrency & transactional atomicity

### AUD-001 — All creates audited

**Priority:** P0 · **Channel:** Both · **Status:** Partially verified

- **Evidence:** `tests/integration/audit.test.ts` (user creation with account, session and channel), `tests/integration/materials.test.ts` and `named-records.test.ts` (creates in the tenant audit), the user, material and named-record service tests. Customer orders come in slice 2. E02-S02, #20.
- **Given:** Normal user creates customer order
- **When:** Read tenant audit
- **Then:** Create event with actor, tenant, session, channel, new values exists.

### AUD-002 — All edits audited

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials.test.ts` (an edit shows before → after in the tenant audit), `tests/integration/named-records.test.ts`, the material and named-record service tests. E02-S02, #20, with #22 and #23.
- **Given:** Admin edits material description
- **When:** Read audit
- **Then:** Before/after values of changed master record visible.

### AUD-003 — Deactivation audited not hard deletion

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/materials.test.ts` and `named-records.test.ts` (the deactivated record stays, shown Inactive, and the audit records active: yes → no), `tests/integration/audit.test.ts` (users). E02-S02, #20.
- **Given:** Admin deactivates material
- **When:** Inspect business record and audit
- **Then:** Inactive record persists and audit captures state change.

### AUD-004 — Reversal audits both original and reverse

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Original movement and linked reversal exist
- **When:** Read audit
- **Then:** Both actions remain as separate immutable events with link/reason.

### AUD-005 — Audit includes tombstone on permitted deletion

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Operation legitimately deletes or removes business object under rules
- **When:** Inspect audit
- **Then:** Tombstone snapshot retains prior identity/content; record not silently erased from history.

### AUD-006 — UI edits show source channel

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** User changes transactional record in UI
- **When:** Read audit
- **Then:** Channel UI and session/account shown.

### AUD-007 — API edits show named token

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (a revoke through the API shows channel API and the token's name, never the secret), `packages/core/src/services/audit/audit-recorder.test.ts`, the tenant routes' unit tests (`apiActor`). E02-S02, #20.
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

- **Evidence:** `tests/integration/audit.test.ts` (a normal user reads the Global audit with no controls, and opens the tenant audit), `tests/integration/read-only-api.test.ts` (a normal user's token reads Prod's audit), the audit page and route unit tests. E02-S02, #20.
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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod has historical audit entries
- **When:** Admin resets Test
- **Then:** Prod audit remains intact.

### AUD-012 — Test audit cleared on reset

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test has prior audit events
- **When:** Admin regenerates Test
- **Then:** Old Test-specific audit removed with old Test business data.

### AUD-013 — Global audit retained across resets

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Global account/reset events recorded
- **When:** Reset Test
- **Then:** Global history still readable and append-only.

### AUD-014 — Global audit covers token changes

**Priority:** P0 · **Channel:** Both · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-tokens.test.ts` (token creation and revocation in the Global audit, no secret), `packages/core/src/services/api-tokens/api-token.service.test.ts`. Tokens deleted by a reset or a deactivation are not audited yet (#44). E02-S02, #20, with #17.
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

- **Evidence:** `tests/integration/read-only-api.test.ts` (both changes, with before and after, through `GET /api/audit`), `tests/integration/read-only.test.ts` (the Global audit screen), `packages/core/src/services/tenants/tenant.service.test.ts`. E02-S04, #25.
- **Given:** Admin sets Prod read-only true then false
- **When:** Read Global audit
- **Then:** Both changes logged with before/after read-only flag values.

### AUD-017 — Atomic production completion under concurrent stock loss

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Input stock 10, production needs 10, another session issues 6 first
- **When:** Try completion concurrently
- **Then:** Completion rejected or serialized correctly; no input negative and no orphan finished stock.

### AUD-018 — Atomic multi-line goods receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** GR two lines, second fails validation while first could pass
- **When:** Attempt post
- **Then:** Neither line changes inventory or order received amounts.

### AUD-019 — Atomic transfer dispatch

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Source issue and in-transit posting paired
- **When:** Simulate failure between sub-movements
- **Then:** Both rolled back; cannot lose source stock without transit credit.

### AUD-020 — Atomic transfer receipt

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Transit decrement and destination increment paired
- **When:** Simulate failure while processing receipt
- **Then:** Neither side commits alone; invariant source+transit+destination preserved.

### AUD-021 — Atomic production reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Finished output removal and component restoration planned
- **When:** Force one stock validation failure
- **Then:** No inverse movement or order state commits.

### AUD-022 — Atomic XLS import

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

- **Evidence:** `tests/integration/api-idempotency.test.ts` (a stale edit in the UI shows the conflict and keeps the other change; users), `packages/app/src/components/materials/material-controls.test.tsx` and `named-record-actions.test.tsx` (materials and master data), the services' tests. E02-S03, #21.
- **Given:** Two sessions load same material version
- **When:** A saves edit then B saves stale edit
- **Then:** B conflict message; A modification preserved.

### AUD-025 — Optimistic locking in API

**Priority:** P0 · **Channel:** API · **Status:** Passed (automated)

- **Evidence:** `tests/integration/api-idempotency.test.ts`, `materials-api.test.ts` and `named-records-api.test.ts` (the second, stale update is 409; no last write wins). Orders come in slice 2; the version check is shared. E02-S03, #21.
- **Given:** Two API clients use same version number
- **When:** First changes order, second submits stale update
- **Then:** Second HTTP 409; no last-write-wins.

### AUD-026 — Concurrent GI on limited stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** On-hand 10, two sessions attempt GI 7 each
- **When:** Post concurrently
- **Then:** At most one succeeds and stock remains nonnegative.

### AUD-027 — Data references enforced

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Authenticated normal user opens operational maintenance
- **When:** Inspect footer
- **Then:** Exact footnote sentence and both links present.

### UX-010 — Footer present on admin/help/report page

**Priority:** P1 · **Channel:** UI · **Status:** Partially verified

- **Evidence:** The root layout renders the footer on every page (`packages/app/src/app/layout.test.tsx`); `tests/integration/footer.test.ts` asserts it on `/`, `/login`, `/help`, `/admin`, `/admin/users`, `/admin/tokens`, `/admin/audit`, `/admin/test` and `/admin/test/audit`. The MRP report doesn't exist yet. E01-S04, PR #32; #52.
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

**Priority:** P1 · **Channel:** UI · **Status:** Partially verified

- **Evidence:** Searchable help in both languages: `tests/integration/help.test.ts`, `packages/app/src/help/search-help.test.ts`; `tests/every-page-has-help.test.ts` fails the build for a page without a topic. The production completion screen doesn't exist yet. E01-S04, PR #32.
- **Given:** Normal user on production completion screen
- **When:** Open Help and search for 'completion'
- **Then:** Relevant operational help and examples found without leaving app.

### UX-014 — Contextual field tooltip

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** User edits production order or master-data quantity
- **When:** Inspect tooltip for component UoM/meaning
- **Then:** Tooltip explains expected entry/BUoM behavior appropriate to current field.

### UX-015 — Guided how-to in Polish

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** User selects Polish then opens import Help
- **When:** Follow step-by-step XLS dry-run guide
- **Then:** Instruction steps, examples and error guidance accessible in Polish.

### UX-016 — Material XLS error helpful for newcomer

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Uploaded row with unknown explicit ID
- **When:** Run dry run and view UI feedback
- **Then:** Shows offending row/key and specific action e.g. leave ID blank to create.

### UX-017 — Inventory report physical vs in-transit

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** API · **Status:** Not executed

- **Given:** Inventory and MRP reports have content in UI
- **When:** Fetch equivalent report through API
- **Then:** Equivalent tenant-scoped data returned under same role authorization.

### UX-022 — Audit readable in both languages

**Priority:** P2 · **Channel:** UI · **Status:** Not executed

- **Given:** Normal user switches between English and Polish
- **When:** View audit history
- **Then:** Field labels/action descriptions localized without changing immutable audit facts.

### UX-023 — No price or accounting workflow

**Priority:** P2 · **Channel:** Both · **Status:** Not executed

- **Given:** User browsing main screens and API help
- **When:** Inspect available functions
- **Then:** No required invoicing/pricing/payments modules; core planning works without them.

### UX-024 — No capacity/work-center scheduling

**Priority:** P2 · **Channel:** Both · **Status:** Not executed

- **Given:** Production orders share time and site
- **When:** Run planning and inspect UI
- **Then:** No machine-sequencing or resource constraint required for MVP.

### UX-025 — No SSO required

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** New runtime has valid built-in admin secret
- **When:** Sign in with local password
- **Then:** Works without Microsoft/Google single sign-on.

### UX-026 — No hard reservation required

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** New PR, PO, production order or customer order
- **When:** Create valid record
- **Then:** Document status Open; progress zero; no physical movements on creation.

### LFC-002 — Partially fulfilled document remains Open

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Purchase order 100, goods receipt 40
- **When:** Inspect status
- **Then:** Open, progress 40 of 100, outstanding 60.

### LFC-003 — Exact fulfillment becomes Completed

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order 100, total produced 100
- **When:** Inspect status
- **Then:** Completed with no outstanding production supply.

### LFC-004 — Partial document Closed Early

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order 100, produced 40
- **When:** Close Early
- **Then:** Status Closed Early; no planned output/components for remaining 60.

### LFC-005 — Cannot cancel processed PO

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO with goods receipt 1 unit
- **When:** Attempt Cancelled
- **Then:** Cancelled not permitted; may complete or Close Early consistent with processing.

### LFC-006 — Cancel never-processed PO

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO Open with zero goods receipts
- **When:** Cancel
- **Then:** PO remains retained with Cancelled state; not counted in future supply.

### LFC-007 — Cancellation of processed customer order blocked

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order with one GI posting
- **When:** Try Cancelled on whole order
- **Then:** Rejected; preserve deliveries; use early closure for undelivered remainder.

### LFC-008 — No manual reopening completed document

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** PO Completed after full receipt
- **When:** User attempts Open status change
- **Then:** Direct reopening unavailable; permitted reversal can recalculate state.

### LFC-009 — Order header status from lines

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** PO line A completed and B still Open
- **When:** Inspect header
- **Then:** Header remains Open.

### LFC-010 — All lines fully fulfilled

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer order lines A/B both completely issued
- **When:** Inspect header
- **Then:** Header Completed.

### LFC-011 — Mixed completed and abandoned lines

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer order A completed and B partially issued then Closed Early
- **When:** Inspect header
- **Then:** Header Closed Early, not Completed.

### LFC-012 — Material blocked from deactivation with stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has 1 physical unit at a site
- **When:** Admin deactivates material
- **Then:** Rejected with material/location/quantity as blocking condition.

### LFC-013 — Material blocked from deactivation with open PO

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material stock zero but has an open PO line
- **When:** Admin deactivates material
- **Then:** Rejected with outstanding document reference.

### LFC-014 — Material blocked from deactivation with open customer demand

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Material stock zero with active undelivered order
- **When:** Admin tries deactivate
- **Then:** Rejected; user shown outstanding demand blocker.

### LFC-015 — Material deactivation after cleanup

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material has zero physical/transit stock, no unfinished direct operational documents, but may appear in active/historic BOMs
- **When:** Admin deactivates material
- **Then:** Deactivation allowed despite BOM-only references; historic BOM immutable and new MRP parent creation must use eligible alternative or raise inactive-input exception.

### LFC-016 — Location blocked with physical stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Location contains nonzero stock
- **When:** Admin tries deactivate
- **Then:** Rejected and identifies nonzero balances.

### LFC-017 — Location blocked with in-transit stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Location has zero physical balance but transfer in transit from/to it
- **When:** Admin tries deactivate
- **Then:** Rejected until transfer resolved.

### LFC-018 — Location blocked with outstanding documents

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Location has unfinished production order or transfer
- **When:** Admin tries deactivate
- **Then:** Rejected with blocking document links.

### LFC-019 — Location can deactivate after clearing

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Location empty, transfers complete, no open operational documents
- **When:** Admin deactivates location
- **Then:** Inactive status stored and future selection blocked; history readable.

### LFC-020 — Customer can deactivate with open order

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Customer has outstanding order
- **When:** Admin deactivates customer
- **Then:** Allowed; existing order can still be fulfilled; new customer order blocked.

### LFC-021 — Supplier can deactivate with open PO

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Supplier has unfinished PO
- **When:** Admin deactivates supplier
- **Then:** Allowed; existing PO/GR still usable; new PO for inactive supplier blocked.

### LFC-022 — BOM deactivation doesn't strand production

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order already pins BOM revision; admin deactivates logical BOM
- **When:** Post valid production completion
- **Then:** Existing order completes against pinned recipe, while new orders exclude deactivated alternative.

### LFC-023 — Inactive supplier excluded from new PO

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Supplier inactive; new material order planned
- **When:** Attempt manual supplier assignment
- **Then:** Supplier not selectable, error shows inactive status; no PO created.

### LFC-024 — Closed Early line not counted by MRP

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Multi-line PO one line completed, one Closed Early with 20 abandoned
- **When:** Run MRP
- **Then:** Abandoned 20 not projected as planned incoming supply.

### LFC-025 — Active BOM dependency alone does not block deactivation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Raw R is referenced by currently active BOM of F but R has no stock/transit or unfinished direct document
- **When:** Admin deactivates R
- **Then:** Allowed, audited; historic BOM unchanged; new MRP must not select the recipe without active R.

### LFC-026 — No usable BOM with inactive component raises exception

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Output F has only an active BOM whose raw input R was deactivated
- **When:** Run MRP requesting F
- **Then:** Explicit parent Inactive BOM Component / Missing Usable BOM exception; no F production order, no PR for inactive R, unrelated materials still plan.

### LFC-027 — Deactivated BOM-only material risks existing parent production

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Order pinned revision 1, partially completed; admin changes recipe to revision 2
- **When:** Post next production completion
- **Then:** Uses revision 1 expected quantities; historical production and new revision remain distinct.

### E2E-005 — Demand falls after PR auto-created

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** MRP creates PR 100, customer forecast then reduced to 70
- **When:** Rerun MRP automatic
- **Then:** No new PR, no modification of old PR; excess planned supply shown.

### E2E-006 — Two simultaneous order postings against stock

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

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

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** A has 100 and B 0, transfer planned 60
- **When:** Dispatch 60, receive 55, write off lost 5, close transfer
- **Then:** A stock 40, B stock 55, transit 0; transfer Closed Early, never Completed, because 5 units written off; loss linked in audit and ledger.

### E2E-010 — Test reset while Prod operations continue

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Test has demo stock, Prod contains an open PO and MRP results
- **When:** Admin resets Test while user reads/posts valid Prod GR
- **Then:** Test fully regenerated with old Test audit cleared; Prod PO, stock, audit and global user accounts unaffected.

### E2E-011 — Read-only Prod protects production

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Prod has valid stock and open production order; admin toggles Prod read-only
- **When:** Try completion through UI and API; view latest results; switch flag off and retry
- **Then:** Writes fail while read-only with no partial movement; reads work; after writable, valid completion succeeds.

### E2E-012 — Inventory XLS correction after production variance

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Actual ingredient consumption was higher than expected; stock differs from physical count
- **When:** Upload corrected absolute stock XLS for relevant materials and locations, dry run, commit
- **Then:** Only listed positions adjusted by computed deltas, variance history preserved, next MRP starts from corrected physical stock.

### E2E-013 — Agent API retry during network failure

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Agent token issues valid GI with idempotency key, response lost
- **When:** Agent retries within 24h using same key/body then reads stock ledger
- **Then:** Only one physical issue and matching audit exists, original result returned to agent.

### E2E-014 — Normal user cannot modify master via agent

**Priority:** P0 · **Channel:** API · **Status:** Not executed

- **Given:** Normal account has valid API token and prod business access
- **When:** Attempt master BOM edit and then valid customer GI
- **Then:** BOM edit forbidden; permitted GI succeeds with account/token audit attribution.

### E2E-015 — Import full BOM into production planning

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** New logical BOM import references existing materials via temporary Import Reference
- **When:** Dry run+commit, run MRP for feasible Make, create production order
- **Then:** Permanent BOM ID and immutable revision created, MRP picks valid recipe and order pins it.

### E2E-016 — Safety target increases during horizon

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Material with target 10 today, 30 next month; demand and procurement lead time defined
- **When:** Run 90-day MRP then compare date-specific balances
- **Then:** Different daily target gaps, sensible dated supply proposals and no double counting against customer demand.

### E2E-017 — Inactivated supplier but existing procurement completes

**Priority:** P1 · **Channel:** Both · **Status:** Not executed

- **Given:** Supplier has existing PO, then admin makes supplier inactive
- **When:** Post GR against old PO; try create a new PO
- **Then:** Old PO receives normally with movement/audit; new PO rejected.

### E2E-018 — Language/theme/help survive Test reset

**Priority:** P1 · **Channel:** UI · **Status:** Not executed

- **Given:** Normal user selects Polish/dark and owns active token; Test has data
- **When:** Reset Test, revisit app with same user
- **Then:** Polish/dark preferences, token and sessions preserved; Test demo data regenerated.

### E2E-019 — Full-run integrity after stock reversal

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Production order completed and output on-hand, completed output reversed, and input restored
- **When:** Run MRP with current demand
- **Then:** Reversed production no longer counts as physical output, remaining order need/status reflected, no double-count of historical ledger.

### E2E-020 — Reused Test IDs are safe after full reset

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** Agent cached Test generation G1 with material 00000001 and an idempotent API GI request, while Prod operates
- **When:** Admin resets Test to G2 (new material 00000001), agent retries G1 request
- **Then:** G1 API precondition rejects retry; G2 material and stock unchanged, global token still valid for freshly scoped G2 API actions, Prod unaffected.

### E2E-021 — Provisional multi-level visibility without unsafe order creation

**Priority:** P0 · **Channel:** Both · **Status:** Not executed

- **Given:** F BOM uses I, I BOM uses R, all absent, R is Buy and valid
- **When:** Run automatic MRP and inspect both planning report and persisted documents
- **Then:** Report explains provisional full F/I/R hierarchy, dates and shortages; only feasible raw R PR created, zero F/I infeasible production orders; rerun after dependable supply permits higher-level executable orders.
