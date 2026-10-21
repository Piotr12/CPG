# Execution plan — purchasing date edits on screen (#142)

**Date:** 2026-10-21 20:44 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 142` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** .ai/specs/2026-10-21--2036UTC-purchasing-date-edits.md (design PR #157)
**Issue:** #142 (E09-S04)
**Status:** in progress

## Goal

A **Change date** action on screen for each Open requisition row and each Open line of an Open purchase order. It saves through the existing `setRequiredDate` and `setPlannedDates` at the version the user loaded, so the screen reaches what the API already offers (BUY-024, R07).

## Scope

- `core`:
  - two form schemas;
  - the monotonic `updatedAt` guard in `PurchaseOrderService.setPlannedDates`.
- `app`:
  - two server actions;
  - `components/purchasing/change-date-dialog.tsx`;
  - the dialog wired into `RequisitionsTable` and `OrderScreen`;
  - EN/PL messages and help topics.
- Integration: `tests/integration/purchasing.test.ts`, plus the existing files whose Actions-cell text changes.
- Docs:
  - BUY-024 in `CPG-acceptance.md`;
  - the #86 spec's "API-only" note;
  - the spec moves to `implemented/` once design PR #157 has merged.

**Non-goals:**
- quantity, supplier or location edits;
- a page-level multi-line dialog;
- a requisition detail page;
- any API or schema change.

## Note on the spec file

The spec ships on design PR #157 (`spec/purchasing-date-edits`), which is not merged yet. This branch doesn't commit the spec, so the two PRs don't both add it. Moving it to `implemented/` waits until #157 is on `main`: then this branch merges `main` and runs `git mv`. If #157 is still open at the end of this run, the move is left as a named follow-up.

## Implementation Plan

### Phase 1: Validators, server actions, version guard
1.1 `requisitionDateSchema` and `orderLineDateSchema`, with tests.
1.2 `setPlannedDates` monotonic `updatedAt` guard, with a fake-timer regression test.
1.3 `setRequisitionRequiredDate` and `setPurchaseOrderLineDate` server actions, with tests.

### Phase 2: Dialog and messages
2.1 EN/PL `changeDate` message blocks.
2.2 `ChangeDateDialog`, with jsdom tests.

### Phase 3: Screens and help
3.1 Wire the dialog into `RequisitionsTable` and `OrderScreen`, with tests.
3.2 Help topics `purchase-requisitions` and `purchase-order` (EN/PL).

### Phase 4: Integration and docs
4.1 Integration journeys in `purchasing.test.ts`, and existing Actions-cell assertions updated.
4.2 Acceptance BUY-024, the #86 spec note, lessons, and the spec move (or a follow-up).

## Risks

- **Actions-cell text.** Existing integration assertions may read the whole Actions cell, and the extra button changes its text (lesson "Update existing browser assertions when row actions change").
- **Server-to-client props.** A non-plain prop passed from the server-component screens only fails at runtime or build time. The dialog takes plain data only, and the build plus an integration run guard this.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Validators, server actions, version guard

- [ ] 1.1 Form schemas with tests
- [ ] 1.2 setPlannedDates monotonic updatedAt guard
- [ ] 1.3 Server actions with tests

### Phase 2: Dialog and messages

- [ ] 2.1 EN/PL changeDate messages
- [ ] 2.2 ChangeDateDialog with jsdom tests

### Phase 3: Screens and help

- [ ] 3.1 Wire the dialog into RequisitionsTable and OrderScreen
- [ ] 3.2 Help topics EN/PL

### Phase 4: Integration and docs

- [ ] 4.1 Integration journeys and existing assertions
- [ ] 4.2 Acceptance, spec notes, lessons, spec move

## Log

- 20:44 UTC — Plan drafted with 10 Steps, under the loop threshold of 20, so the engine is `om-auto-create-pr`.
