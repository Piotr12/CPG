# Execution plan — shipment edit and cancel (#147)

**Date:** 2026-10-23 20:17 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 147` → `om-auto-write-spec` (#180) → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** .ai/specs/2026-10-23--2006UTC-shipment-edit-cancel.md (design PR #180)
**Issue:** #147 (E08-S05)
**Status:** done

## Goal

**Edit shipment** and **Cancel shipment** for Open shipments, on `/admin/{tenant}/shipments/{id}` and as keyed API routes:
- Edit changes the planned date and the line set at the loaded version.
- Cancel ends a shipment that never had a goods issue.

## Scope

- **`db`:**
  - `Shipment.version`, `updatedAt`, `nextLine` and the `cancelled` status;
  - one hand-checked migration (the add, copy, drop and rename swap of the status column), tested on populated data.
- **`core`:**
  - `ShipmentService.update` and `cancel`;
  - `touchShipment` and `postedShipmentLineIds`;
  - the goods-issue and reversal version touch;
  - the stock reversal's `OptimisticLockError` mapping;
  - schemas and messages.
- **`app`:**
  - `PATCH …/shipments/{id}` and `POST …/shipments/{id}/cancel`;
  - two server actions;
  - `EditShipmentDialog` and `CancelShipmentButton`;
  - `LineQuantitiesForm` per-row `initial`;
  - EN/PL strings, audit labels and the help topic.
- **Integration:** `shipments.test.ts`, `shipments-api.test.ts` and `smoke.test.ts` (the migration count).
- **Docs:**
  - `BACKWARD_COMPATIBILITY.md` §1 (a named exception) and §4;
  - the engineering-standards shipments note;
  - the #84 spec's out-of-scope note;
  - lessons.

**Non-goals:**
- editing or deleting goods issues;
- moving a shipment to another order;
- customer returns;
- reopening a cancelled shipment.

## Note on the spec file

The spec ships on design PR #180 (`spec/shipment-edit-cancel`), which is not merged yet. This branch doesn't commit it, so the two PRs don't both add the file. It moves to `implemented/` once #180 is on `main`; until then that move is a named follow-up.

## Implementation Plan

### Phase 1: Schema
1.1 Entities, migration, snapshot, migration test on populated data, migration counts.

### Phase 2: Core
2.1 `touchShipment` (goods issue, reversal), reversal conflict mapping, views `version`/`posted`, create sets `nextLine`.
2.2 `shipmentUpdateSchema`, `shipmentCancelSchema`, messages.
2.3 `ShipmentService.update`.
2.4 `ShipmentService.cancel`.

### Phase 3: API
3.1 PATCH and cancel routes.

### Phase 4: Screen
4.1 EN/PL messages, audit labels, help topic.
4.2 `LineQuantitiesForm` `initial` and `shipmentEditChoices`.
4.3 Server actions.
4.4 `EditShipmentDialog`, `CancelShipmentButton`, screen wiring.

### Phase 5: Integration and docs
5.1 Integration tests.
5.2 Docs, lessons, run log.

## Risks

- **Migration.** A drop and rename of `status` on a table referenced by immutable goods issues. Tested on populated data, with `getUpdateSchemaSQL()` empty.
- **`refresh: true` in `completeFinishedShipments`.** It overwrites unflushed header changes, so the edit flushes first (spec review, critical finding).
- **Existing integration assertions.** They may read the shipment page's whole text, which the new buttons change.

## Progress

PR: #182

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema

- [x] 1.1 Entities, migration and migration tests — 7e090223

### Phase 2: Core

- [x] 2.1 Version touch, reversal mapping, view fields — 51e693b5
- [x] 2.2 Update and cancel schemas — a6b973dd
- [x] 2.3 ShipmentService.update — 433f4934
- [x] 2.4 ShipmentService.cancel — 433f4934

### Phase 3: API

- [x] 3.1 PATCH and cancel routes — a417c955

### Phase 4: Screen

- [x] 4.1 Messages, audit labels, help — 983fe80b
- [x] 4.2 Form initial values and edit choices — ef60be44
- [x] 4.3 Server actions — 61db72a6
- [x] 4.4 Edit and cancel controls on the shipment page — 11098770

### Phase 5: Integration and docs

- [x] 5.1 Integration tests — 5f53899f
- [x] 5.2 Docs and lessons — 3e706321

### Review fixes

- [x] Cancelled shipments report nothing to issue; the help states the raise limit exactly — b346485f

## Log

- 20:06 UTC: wrote spec #180. A fresh-context review found 1 critical, 1 high and 3 medium issues (refresh clobber, drift check, hidden rows, reversal mapping, a pointer to editing); all are resolved in the spec.
- 20:17 UTC: plan; draft PR #182.
- The generated migration rebuilt `shipment` and copied NULL into NOT NULL columns, so it was replaced by the in-place add/copy/drop/rename (lesson added).
- One commit (ef60be4) was first made with a test type error, then amended before any push (lesson "Gate a commit on the real typecheck").
- Docker isn't available to this account. The integration files ran on a standalone build instead (lesson 2026-10-19).
- A fresh-context code review found one medium and two low issues, fixed in the commit under "Review fixes" above. UI QA passed 9 of 9 steps (screenshots on #182).

## Verification

- `npm run lint`: 0 errors. One warning, in `bom.service.ts`, predates this branch.
- `npm run typecheck`: 0.
- `npm run test:coverage`: 3,515 tests, 100% lines, branches, functions and statements.
- `npm run build`: OK.
- Integration on a standalone build (`CPG_BASE_URL`):
  - `shipments.test.ts`, `shipments-api.test.ts` and `smoke.test.ts`: 20/20 pass;
  - `document-lifecycle.test.ts`, `stock-reversals.test.ts` and `customer-orders.test.ts`: 21/21 pass.
- The full suite runs in CI.

## Follow-ups

- Move the spec to `.ai/specs/implemented/` once #180 is on `main`.
