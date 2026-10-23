# Execution plan — purchasing date edits on screen (#142)

**Date:** 2026-10-21 20:44 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 142` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** .ai/specs/2026-10-21--2036UTC-purchasing-date-edits.md (design PR #157)
**Issue:** #142 (E09-S04)
**Status:** done

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

PR: #159

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Validators, server actions, version guard

- [x] 1.1 Form schemas with tests — 9edbec4
- [x] 1.2 setPlannedDates monotonic updatedAt guard — 5ccf1d2
- [x] 1.3 Server actions with tests — 5d107c3

### Phase 2: Dialog and messages

- [x] 2.1 EN/PL changeDate messages — 7c084e2
- [x] 2.2 ChangeDateDialog with jsdom tests — 6469a15

### Phase 3: Screens and help

- [x] 3.1 Wire the dialog into RequisitionsTable and OrderScreen — 1ac0957
- [x] 3.2 Help topics EN/PL — 4816a66

### Phase 4: Integration and docs

- [x] 4.1 Integration journeys and existing assertions — 4ce059a
- [x] 4.2 Acceptance, spec notes, lessons, spec move — a08abec (spec move pending #157, see Log)

## Log

- 20:44 UTC — Plan drafted with 10 Steps, under the loop threshold of 20, so the engine is `om-auto-create-pr`.
- 20:47 UTC — Phase 1 is done. The new service test failed before the guard: version 1, where 2 was expected.
- 20:55 UTC — Deviation: the PO-line journey went into `goods-receipts.test.ts` rather than `purchasing.test.ts`, because that file already has a token, an order and a partly received Open line. Its existing Actions-cell assertion now reads "Change date Close Early".
- 20:58 UTC — Layout: the extra button squeezed the PO Material column until IDs broke mid-number at 1280 px. `min-w-40` and `min-w-24` pushed the table past its container (by 75 px and 11 px). Fix: stacked row actions plus `whitespace-nowrap` IDs, which fit unscrolled at 1280×800 (cbbd40c). At 390 px the page doesn't overflow, and the actions stay within the table's own horizontal scroll, as Cancel already did.
- 21:05 UTC — Gate: lint 0 errors (1 warning in `bom.service.ts`, already on main), typecheck 0, `test:coverage` 484 files / 3279 tests at 100%, build 0. No Docker here (lesson 2026-10-19), so the integration files ran against a fresh standalone copy on :3418: `purchasing.test.ts` + `goods-receipts.test.ts` 7/7, `document-lifecycle.test.ts` 10/10.
- 21:07 UTC — BUY-024 stays "Partially verified": the catalogue reserves Passed (automated) for a whole scenario, and SAL-019 is the precedent. Its evidence now says the non-MRP half passes automated on UI and API. The spec move to `implemented/` waits for design PR #157 to merge, because this branch must not add the spec file too.
- 21:10 UTC — Fresh-context code review: approve, with 0 blockers, 0 majors, 2 minors and 3 nits. Four fixed in 5eea7f7 (recursive labels tests, read-only Change date check, stronger 390 px check) and in the spec's Implementation notes on #157 (2f9ca2c). One nit declined: the requisition dialog uses the screen's merged error map, which gives the same wording. The review went up as a PR comment, because GitHub refuses self-approval.
- 21:12 UTC — UI evidence on the production build found the requisition Location column breaking IDs and words at 1280 px. Fixed in c5064ce by keeping location IDs whole. Rebuilt; the three touched integration files pass 17/17 on a fresh standalone copy. Evidence with 8 screenshots is posted on #159.
