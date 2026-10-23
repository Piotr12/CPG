# A user changes an Open shipment's plan, and cancels a shipment nothing has been issued against

**Status:** implemented (PR #182)
**Created:** 2026-10-23 20:06 UTC
**Issue:** #147 (E08-S05), epic #74 · **Builds on:** `implemented/2026-10-20--2045UTC-shipments-goods-issues.md` (#84: shipments, Q8 completion, Q10 order-line locks), `implemented/2026-10-21--0707UTC-document-lifecycle.md` (#90: Cancel versus Close Early), `implemented/2026-10-21--0706UTC-stock-reversals.md` (#91: posting history outlives a reversal) · **Design authority:** `.ai/specs/product-brief.md` (R03, R05, R07, R08, D04), `BACKWARD_COMPATIBILITY.md`

## 📝 TLDR

Once a shipment is created, its plan can't be changed: the API has no write on a shipment, and the page offers only Post goods issue. A user who mistypes a planned date or quantity, or plans a dispatch that won't happen, has two choices: leave a wrong Open shipment beside the order, or close the whole order early. This spec proposes **Edit shipment** and **Cancel shipment**, on the shipment's page and through keyed API routes. Edit changes an Open shipment's planned date and lines at the version the user loaded. Cancel ends an Open shipment that has never had a goods issue posted against it, giving it a new status, `cancelled`.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | One spec, or one each for edit and cancel? | One spec and one implementation PR. | The issue scopes them as one story. Both need the same new `version`, migration, page controls and audit subject. #90 shipped Cancel and Close Early together for the same reason. |
| Q2 | How does an edit name the lines it keeps, changes, adds and removes? | By `orderLine`, the stable customer-order line ID, exactly as create does. The body lists the whole plan: a listed `orderLine` the shipment already has keeps that line, a new one adds a line, and a line left out is removed. | A shipment has at most one line per order line (create refuses duplicates), so the order line identifies the shipment line. The body then has the same shape as create, so the schema, the form and its error mapping are reused. The customer-order `PATCH` uses the same full-list convention. |
| Q3 | What happens to a removed line's record and number? | Its row is deleted (nothing references it: a line any goods issue ever named can't be removed, Q9), and its number is never reused. A new `shipment.next_line` counter keeps the next number, so a new line is numbered after the highest number the shipment has ever had. | A goods issue names a shipment line by number, without a version. If a number were reused, a client still holding the old plan could issue against a different material. A counter keeps that guarantee with no hidden rows, so no reader of shipment lines changes, and a `kamal rollback` image never sees a line that is no longer there. A hidden `removed` row (the customer-order precedent) was rejected in review: four readers would have to skip it, and the previous release would not. |
| Q4 | What bounds a changed quantity? | Never below what the line has issued, as a field error. Raising it is bounded like create: what is left to issue (planned − issued) may not exceed what the order line still has outstanding (SAL-018). Lowering it is never refused for outstanding. | The issue's criteria, and create's rule applied to the remainder. Refusing a decrease because another shipment has since issued against the order line would block the very correction this story is for. |
| Q5 | What advances a shipment's version? | Every change to what its page shows: an edit that changes something, a cancel, completion and recalculation, a goods issue, and the reversal of one. An edit that changes nothing writes no audit and keeps the version. A writer that changes only lines touches the header's `updatedAt` so the row changes. | "The edit is made at the version the user loaded" (issue). The page shows issued and to-issue quantities, so an issue posted behind an open dialog makes it stale, as on customer orders, whose version a goods issue already advances. |
| Q6 | Which history blocks a cancel? | Any goods issue ever posted against the shipment, even one reversed since. Lines left with nothing issued are no exception. | The #91 rule: a full reversal returns quantities to zero but doesn't erase the posting. The issue's criteria and D04 split it the same way #90 does: Cancel only what was never processed, and finish a processed shipment by lowering its lines to what was issued. |
| Q7 | How does the migration add `cancelled` to the status check? | Without rebuilding the table. It adds a new checked column, copies `status` into it, drops the old column and renames the new one. The version, timestamp and line-counter columns are plain `ADD COLUMN`s with defaults. | `shipment` is referenced by `shipment_line` and the immutable `goods_issue`. A generated table rebuild is what the lesson "Verify generated SQLite additions on populated data" warns about, and the issue asks for an additive migration that keeps the enum check. |
| Q8 | What does the Edit dialog look like? | The Create shipment form, reused: the planned date, then a row per line. The shipment's lines come first, filled with their entered quantity and unit. They are followed by the order's other lines that have anything outstanding, left empty. Emptying a row removes its line, and filling an empty row adds one. | It is the form users already know from create (`LineQuantitiesForm`). The only new thing it needs is starting values per row. |
| Q9 | What if an edit leaves out a line that has had goods issued? | Refused with 409 `SHIPMENT_LINE_ISSUED`, naming the line number in `params.line`. | A line that was left out has no field in the body, so there is nowhere to attach a field error. The message points the user to lowering the line instead (lesson: name the record in `params`). |
| Q10 | Does a cancelled shipment still lock its order lines (shipments spec Q10)? | Yes. Nothing changes in `isAnyShipped`. A removed shipment line no longer exists, so it no longer locks its order line. | A replaced order line keeps its ID and takes a new material (`archiveLine`). If a cancelled shipment's lock were released, its page would start showing a material it never planned. History keeps its meaning, and the lock is the existing, conservative behaviour. A deleted line refers to nothing, so nothing is left to protect. |

## 📝 Problem Statement

- #84 left "shipment edits or cancellation" out of scope. Its run log's follow-up says "a plan can't be changed yet; create another shipment instead". Closing epic E08 filed that leftover as #147.
- A shipment only ever ends through goods issues or its order's closure (#90). A wrong one stays Open beside the order. A user can see it, but the Post goods issue dialog keeps offering it.
- Both roles have the need, on screen and through the API (R07).

## 📝 Proposed Solution

Two new methods on `ShipmentService`, `update` and `cancel`, under the shipment's new version. They are served by a keyed `PATCH …/shipments/{id}`, a keyed `POST …/shipments/{id}/cancel` and two server actions on the shipment page. The page gets an **Edit shipment** dialog (the create form, pre-filled) and a **Cancel shipment** confirmation.

Rules:
- **Edit** needs the shipment Open (`SHIPMENT_NOT_OPEN` otherwise). An Open shipment always has an Open order, because the order's completion, cancellation and early closure complete its shipments in the same transaction. So the edit doesn't repeat create's `CUSTOMER_ORDER_NOT_OPEN` check, which a test could never reach.
  - It replaces the planned date and the line set (Q2). It may lower a line down to what it has issued, raise it within the order line's outstanding (Q4), add lines of the same order, and remove lines nothing was ever issued against (Q9).
  - An unchanged entered quantity and unit keeps the line's stored base quantity and factor, so a conversion changed since doesn't silently re-price the plan (the customer-order precedent). "Unchanged" compares decimals, not text (`20` equals `20.000000`), and the form always offers a line's stored unit, even one whose conversion has since been removed.
  - After the change, the edit flushes, then the existing completion check runs. The flush comes first because `completeFinishedShipments` reads with `refresh: true`, which would overwrite an unflushed date or timestamp (found in review). If no line has anything left to issue, the shipment is Completed in the same transaction (issue: "lowering its lines to their issued quantity completes it").
- **Cancel** needs the shipment Open and no goods issue ever posted against it (Q6): `count(GoodsIssue, { shipment }) = 0`. Goods issues are immutable, so that count is the posting history. It sets `cancelled` and nothing else: shipments reserve no stock and fulfil nothing (SAL-009). Stock, the order's quantities and the forecast consumption stay as they are.
- A cancelled shipment is terminal. No goods issue posts against it (the existing `SHIPMENT_NOT_OPEN`), edits and a second cancel are refused, and completion and reversal recalculation skip it (they already read only Open and Completed shipments).

Alternatives rejected:
- **Line numbers in the edit body.** That would mean a second line identity, and new lines would still need `orderLine`, so one form couldn't serve both create and edit (Q2).
- **Keeping a removed line as a hidden row.** Every reader would have to skip it, and the previous release wouldn't (Q3).
- **Cancel by setting every line to its issued quantity.** For a shipment with nothing issued, that is a zero quantity, which create refuses. "Completed" would also misreport a dispatch that never happened.
- **A generated table rebuild for the status check** (Q7).

Research: in Odoo, an un-validated delivery order can be edited or cancelled. Once part of it is validated, the remainder becomes a backorder, which can then be cancelled. ERPNext cancels a draft Delivery Note but amends a submitted one. Both separate "never processed" (cancel) from "partly processed" (finish the remainder), which D04 and #90 already do. Neither offers a stock-reversing cancel of a posted delivery. Here that stays the E11-S02 reversal.

## 📝 Architecture

- **`core/services/shipments/shipment.service.ts`**: `update(id, input, version, actor)` and `cancel(id, version, actor)`, each in one transaction. The version is compared against a fresh read, and `OptimisticLockError` maps to `versionConflict()` (the `UserService` reference). Line resolution shares create's checks (`resolveLines`) and adds Q4's bounds for kept lines.
- **`core/services/shipments/shipment-usage.ts`**: a new leaf, `touchShipment(shipment, at)`, sets `updatedAt` monotonically (lesson "A version bumped through a timestamp needs a monotonic timestamp"). Every writer that changes only a shipment's lines calls it, so the header row changes and its version advances:
  - the edit, before its flush;
  - the goods issue, in `issueShipment`;
  - the issue reversal, before `recalculateReversedShipments` (which flushes, then clears the identity map).
  Completion and recalculation change `status`, which advances the version by itself.
- **`core/services/stock/stock-reversal.service.ts`** maps `OptimisticLockError` to `versionConflict()`, as the goods-issue service does. Today it has no mapping, and the shipment touch adds a versioned row to the reversal.
- **`core/services/shipments/shipment-records.ts`**: `postedShipmentLineIds(em, lines)`, the shipment lines any goods issue line has ever referenced. It is bounded like `postedOrderLineIds` and feeds each line view's `posted` flag and the removal check (Q9).
- **Views** (additive): `ShipmentView.version`, and `ShipmentLineView.posted`.
- **`app`**:
  - the two route handlers, through `tenantApiWrite`;
  - two server actions in `shipments/[id]/actions.ts`, through `tenantServerAction`;
  - `components/shipments/edit-shipment-dialog.tsx` and `cancel-shipment-button.tsx`;
  - `shipmentEditChoices` in `line-choices.ts` (server side, as `shipmentLineChoices` is);
  - `LineQuantitiesForm` gains an optional `initial` per choice.

No new concept, service or cradle entry.

```mermaid
flowchart LR
  page[Shipment page: Edit / Cancel - new] --> actions[server actions - new]
  api[PATCH /shipments/id, POST /shipments/id/cancel - new] --> svc
  actions --> svc[ShipmentService.update / cancel - new]
  svc --> usage[shipment-usage: completion, touch - changed]
  issue[GoodsIssueService - changed: touch] --> usage
  rev[issue reversal - changed: touch, conflict mapping] --> usage
```

Takeaway: everything that changes a shipment funnels into `shipment-usage`, which completes it and advances its version. The order service is untouched. The stock reversal service gains only its conflict mapping.

## 📝 Data Model

One migration, `shipment_edit_cancel`, with no table rebuild (Q7):

```sql
alter table shipment add column version integer not null default 1;
alter table shipment add column updated_at datetime not null default 0;  -- default matching the entity's, see below
update shipment set updated_at = created_at;
alter table shipment add column next_line integer not null default 0;
update shipment set next_line = (select coalesce(max(position), -1) + 1 from shipment_line where shipment_id = shipment.id);
alter table shipment add column status_next text check (status_next in ('open', 'completed', 'cancelled')) not null default 'open';
update shipment set status_next = status;
alter table shipment drop column status;
alter table shipment rename column status_next to status;
```

- `SHIPMENT_STATUSES` becomes `["open", "completed", "cancelled"]`. `Shipment` gains:
  - `version: p.integer().version()`;
  - `updatedAt: p.datetime()`, set on create as `createdAt` is (the seed's `at` for seeded ones), with the column default the entity declares;
  - `nextLine: p.integer().default(0)`: the 0-based position the next added line takes. Create sets it to the line count.
  A new line takes `max(nextLine, highest current position + 1)`, so a shipment created by the previous release during the deploy overlap (`next_line` 0) still numbers correctly.
- `down()` is the reverse, with the same add, copy, drop and rename for the status. A cancelled row maps back to `open`, because the old check has no other value for it. The test documents that loss.
- **The schema must equal the entities.** The migration test runs `orm.schema.getUpdateSchemaSQL()` on the migrated database and asserts it doesn't mention `shipment` (the precedent is `document-lifecycle-migration.test.ts`). That compares the SQL that actually ran, not just the snapshot. The default each column gets in SQL is the one the entity declares, so the diff stays empty.
- Tested on a **populated** database (lesson): Open and Completed shipments keep their status, lines keep `issued`, goods issues still reference their shipments and lines (foreign keys checked with `pragma foreign_key_check`), the check refuses an unknown status, and `down()` restores the old check.
- Every migration count moves (lesson "A new migration moves every migration count"): `orm.test.ts`, `core/src/database.test.ts`, `system-status.service.test.ts`, `smoke.test.ts`, and the rollback-by-count tests.

## 📝 API Contracts

Both routes are keyed writes (`tenantApiWrite`): bearer token, `Idempotency-Key`, JSON body, and in Test the current `Dataset-Generation`. Read-only tenants answer 409 `TENANT_READ_ONLY`, as every tenant write does, and a same-key retry replays the first answer with no second audit entry. Both answer 200 with the `ShipmentView`.

**`PATCH /api/tenants/{tenant}/shipments/{id}`**:

```json
{ "version": 3, "plannedDate": "2026-11-02",
  "lines": [{ "orderLine": "<uuid>", "quantity": "20", "unit": "PC", "customerOrder": "00000004" }] }
```

- `lines` has 1 to 100 entries, each for a different `orderLine` (create's schema). `customerOrder` on a line is optional, as on create. The body's top level refuses `customerOrder` (`z.never`: a shipment doesn't move to another order, issue Out of scope) and `status`.
- Field errors (400 `VALIDATION_FAILED`, `lines.N.<field>`):
  - `quantity` below the line's issued ("This is less than this line has already issued.");
  - `quantity` above the outstanding (Q4, existing message);
  - `orderLine` not of this order (existing);
  - `customerOrder` of another order (SAL-008, existing);
  - `unit` not convertible (existing).
- 404 `SHIPMENT_NOT_FOUND`.
- 409:
  - `VERSION_CONFLICT`;
  - `SHIPMENT_NOT_OPEN`;
  - `CUSTOMER_ORDER_NOT_OPEN`;
  - `SHIPMENT_LINE_ISSUED` (`params.line`).

**`POST /api/tenants/{tenant}/shipments/{id}/cancel`** takes `{ "version": 3 }`, a strict body like the other lifecycle routes. Refusals: 404 `SHIPMENT_NOT_FOUND`; 409 `VERSION_CONFLICT`, `SHIPMENT_NOT_OPEN` or `SHIPMENT_ISSUED`.

**Reads (additive)**: every shipment adds `version`, and every line `posted`. `status` may now be `cancelled`, and a cancelled shipment's lines report `toIssue` 0: it plans nothing more. A removed line no longer appears, and the remaining lines keep their numbers, so numbering can have gaps. Messages:
- `SHIPMENT_NOT_OPEN` reads "Shipment N is completed, so it can't be changed." or "…cancelled…", depending on the action. The goods issue keeps its existing text.
- `SHIPMENT_ISSUED` reads "Goods have been issued against shipment N, so it can't be cancelled. To finish it, lower its lines to what was issued."
- `SHIPMENT_LINE_ISSUED` reads "Line N has goods issued against it, so it stays on the shipment. Lower it to what was issued instead." 

**Audit (R08)**, subject `Shipment`:
- `shipments.shipment.updated`, before and after `{ plannedDate, status, lines }`. `lines` is the readable line list create already writes (`N: material quantity unit`), so a removal, an addition and a quantity change all show.
- `shipments.shipment.cancelled`, from `{ status: "open" }` to `{ status: "cancelled" }`.

When an edit completes the shipment, the existing `shipments.shipment.completed` entry follows. Both new action IDs get EN/PL labels (`tests/audit-labels.test.ts`).

## 📝 UI/UX

On `/admin/{tenant}/shipments/{id}`, below the details and above the lines, while the shipment is Open and the tenant writable:

- **Edit shipment**, any Open shipment. The dialog is described in Q8, using `TALL_DIALOG`. Each kept line's hint reads "Planned 50 PC, issued 30 PC, at least 30 PC". An added line's hint is the order line's outstanding, as on create. The dialog captures the version when it opens (lesson "Bind an aggregate edit to the version it opened with").
  - Success closes the dialog, and the page refreshes.
  - A `VERSION_CONFLICT` keeps the dialog open with the shared text.
  - `SHIPMENT_LINE_ISSUED` shows above the buttons and names the line.
- **Cancel shipment**, only while no line is `posted`. When a line is posted, the button is replaced by a note: "Goods have been issued against this shipment, so it can't be cancelled. To finish it, edit its lines down to what was issued." This is how the screen points the user to editing (issue criteria). It uses the shared `ConfirmDialog`: "Cancel shipment 00000012? It will plan nothing more. Stock and the order are not changed." Afterwards the status badge reads Cancelled, and neither control nor Post goods issue is shown.
- A read-only tenant hides both. A submit from a form that was already open is refused by the server action (`TENANT_READ_ONLY`), and the dialog shows it.
- The order page's shipment list and the shipment page show the Cancelled state (EN "Cancelled", PL "Anulowana").
- The help topic `shipment` gains a paragraph on editing and cancelling, in both languages.

Prototype: `.ai/specs/assets/shipment-edit-cancel/` (static mockups, illustrative; `current-*` are today's screens).

| Today | Proposed |
|---|---|
| ![Shipment page today](../assets/shipment-edit-cancel/current-01-shipment.png) | ![Edit shipment dialog](../assets/shipment-edit-cancel/mockup-01-edit-dialog.png) |
| ![Customer order with its shipments](../assets/shipment-edit-cancel/current-02-customer-order.png) | ![Cancel confirmation](../assets/shipment-edit-cancel/mockup-02-cancel-confirm.png) |
| | ![A cancelled shipment](../assets/shipment-edit-cancel/mockup-03-cancelled.png) |

## 📝 Edge Cases & Failure Scenarios

- **A goods issue posts while the Edit dialog is open.** The shipment's version advanced (Q5), so the save is refused with `VERSION_CONFLICT`. Reopening shows the new issued quantities.
- **A line lowered to exactly its issued quantity.** It has nothing left to issue. If every line is the same, the shipment completes in the edit's transaction, and the audit holds `updated` then `completed`.
- **Every line lowered to its issued quantity while one line never issued anything.** That line can't be lowered to zero (quantities are positive). The user removes it, and the shipment completes.
- **A line removed, then the same order line added again in a later edit.** The new line gets a new number (Q3): `next_line` has already moved past the old one.
- **A goods issue naming a removed line's number** is refused on that line as "no such line" (existing `lines.N.line` message): the row is gone, and the number is never handed out again.
- **A date-only edit.** No line changes, so nothing cascades a flush. The edit flushes before the completion check, and a test proves that the date and the version persist.
- **The order closes early, or its lines are cancelled, while a shipment is Open.** The existing closure completes the shipment, so a later edit gets `SHIPMENT_NOT_OPEN`.
- **A reversal returns a Completed shipment to Open** (#91 recalculation). It can be edited again. It can't be cancelled, because its issue history remains (Q6).
- **An edit that changes nothing** (same date, same entries) answers 200 with the unchanged view, no audit entry and the same version.
- **Two edits race.** The second gets `VERSION_CONFLICT` (or a stale-snapshot retry that then conflicts). A unit test covers the repeated and the concurrent case.
- **Deploy overlap.** The previous release reads `cancelled` as an unknown status. Its Post goods issue already refuses a non-Open shipment. Its shipment screens would render the badge empty during the overlap window only. Its writes don't set `version`, `updated_at` or `next_line` and get their defaults: a later `touchShipment` moves `updated_at` forward (the monotonic `max`), and line numbering takes `max(nextLine, highest + 1)`. After a `kamal rollback`, the old image sees only real lines, because removed ones are deleted.

## 📝 Risks & Impact Review

- **Schema (risk-high).** The migration drops and renames a column, which `BACKWARD_COMPATIBILITY.md` §1 lists as breaking when done "in the same release that stops using it". Here no release stops using `status`: the drop and the rename happen in one transaction, so the previous release still finds a `status` column, with the same values and a wider check. The implementation PR records this in §1 as a named exception, for the reviewer to approve.
  - Rollback note: `kamal rollback` runs the old image against the migrated schema, which it can read. It shows a cancelled shipment's badge empty, and refuses goods issues against it.
  - Running `down()` turns cancelled shipments back into Open ones (documented loss).
  - Tested on populated data.
- **Shared contract.** New routes and additive fields on `GET` shipments. A client that switches on `status` meets a new value, `cancelled`. `BACKWARD_COMPATIBILITY.md` §4 records all of it.
- **Deleted lines.** A line is deleted only when no goods issue line ever referenced it (checked in the same transaction), so no foreign key or posting history is lost. Its before/after stays in the audit.
- **Version bumps on goods issues** add a refusal path to concurrent issues on the same shipment. SQLite's single writer already serialises them, and the existing `OptimisticLockError` mapping in the goods-issue service covers them. The stock reversal service gains the same mapping, with a test.

## 📝 Decisions in play

R03 (exact decimals), R05 (read-only blocks every business write), R07 (API twin, keyed writes, generation), R08 (append-only audit with before/after), D04 (simplest consistent behaviour: cancel only the unprocessed). Nothing is superseded.

## 📋 Implementation Plan

### Phase 1: Schema
1.1 Entity changes (`Shipment.version`, `updatedAt`, `nextLine`, `cancelled`) and the hand-checked migration with snapshot and index. Migration test on populated data: up, `foreign_key_check`, the enum check, the `next_line` backfill, an empty `getUpdateSchemaSQL()` for `shipment`, and down. Every migration count updated.

### Phase 2: Core
2.1 `touchShipment`, called from goods issues and their reversal; the reversal's `OptimisticLockError` mapping; views add `version` and `posted`; create sets `nextLine`. Tests for the version advancing on each path.
2.2 `shipmentUpdateSchema`, `shipmentCancelSchema` and the new messages, with schema tests.
2.3 `ShipmentService.update`: rules Q2–Q4 and Q9, no-op, completion, audit, version conflict. Service tests on a real SQLite file.
2.4 `ShipmentService.cancel`: rule Q6, audit, the terminal state (refused issue, refused edit). Service tests.

### Phase 3: API
3.1 `PATCH …/shipments/{id}` and `POST …/shipments/{id}/cancel` through `tenantApiWrite`, with route tests (key replay, read-only, generation).

### Phase 4: Screen
4.1 EN/PL messages (`cancelled` state, edit and cancel strings, error codes, audit labels) and the `shipment` help topic.
4.2 `LineQuantitiesForm` per-row `initial`, and `shipmentEditChoices`, with tests.
4.3 Server actions `updateShipment` and `cancelShipment`, with tests.
4.4 `EditShipmentDialog`, `CancelShipmentButton` and the screen wiring, with jsdom tests.

### Phase 5: Integration and docs
5.1 Integration: edit and cancel journeys in `shipments.test.ts`, the API contract in `shipments-api.test.ts`, and the migration count in `smoke.test.ts`.
5.2 `BACKWARD_COMPATIBILITY.md` §1 and §4, the engineering-standards shipments note, the #84 spec's out-of-scope note, and the run log.
