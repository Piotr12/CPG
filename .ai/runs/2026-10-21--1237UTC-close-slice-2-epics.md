# Close slice 2 epics E07, E08, E09, E10, E11 and E13

**Date:** 2026-10-21 12:37 UTC
**Agent:** Claude Code (claude-opus-5-5), dispatched by cezar
**Spec:** none (epics #73, #74, #75, #76, #77, #79; their story specs are in `.ai/specs/implemented/`)
**Status:** done

## Goal

Every story of epics #73 (E07), #74 (E08), #75 (E09), #76 (E10), #77 (E11) and #79 (E13) is closed. Assess, one read-only subagent per epic, what is left: spec and run-log paperwork, acceptance catalogue statuses, and any criterion that was missed. Do cosmetic cleanup in one closing PR; file a new user story inside the epic for anything functional that was missed.

## Log

- 12:37 — Start. All 16 stories (#80–#92, #94–#96) are closed. All their specs are already in `.ai/specs/implemented/` with `Status: implemented`. The epics are open with unticked checklists. `CPG-acceptance.md` has 366 `Not executed` lines. Plan: six read-only analysis subagents in parallel, then the doc fixes here, then new stories for real gaps.

- 12:50–13:20 — Six reports in (saved outside the repo; summaries below). Verdicts: E07, E08 and E10 have no functional gap, only test gaps. E09, E11 and E13 each have a real gap. Every spec was already `implemented` with notes; the paperwork left was stale paths, stale notes, the catalogue and the epic checklists.
  - **E07 (#73):** the transfer refusals of LFC-018 name the transfer but don't link it. STX-006 and STX-018 have no asserting test. The transfer help still said Close Early "comes with a later release" (EN and PL).
  - **E08 (#74):** the forecast list is unpaged (`forecast.service.ts:72`). SAL-024, SAL-025/LFC-020 and the AUD-001 account have no asserting test. PR #108 had deleted the §4 bullet listing the admin page URLs from `BACKWARD_COMPATIBILITY.md`.
  - **E09 (#75):** a location can be deactivated under an Open PO or requisition, after which its receipts are refused (`location.service.ts:28`). It was flagged in PR #109 and never filed. Date edits are API-only (BUY-024 "Both"). The help said "under Procurement", but the sidebar group is Transactions. Test gaps: BUY-009, LFC-021, MAT-029, and the PO dialog flow end to end.
  - **E10 (#76):** test gaps only: completions after a BOM revision or deactivation, the read-only no-write check, an expired explicit pair, help search, and an overclaimed title. The production-order compat sections sat under "Changing this document".
  - **E11 (#77):** a resolved production order still lists components and a shortage for its whole target (`production-order.service.ts:144`; LFC-004, PRD-029). Test gaps: stock after a PO closure (BUY-017), a browser receipt reversal, imported and seeded correction reversals.
  - **E13 (#79):** completion and transfer reversal audit fields have no EN/PL label (UX-022). The variance report was never tested against a real completion reversal (handed to #92, dropped). The write-off audit entry lacks its posting ID.
- 13:20 — I verified the E09, E11, E13 and E07 gaps in the code myself. Decision, following the owner's rule (cosmetic → closing PR; missed → new story in the epic): the help-copy and doc fixes go in this PR. Every functional gap and every test gap becomes a story, so none of the six epics closes yet. Filed #139 (E07-S04), #140 (E08-S04), #141 (E09-S03), #142 (E09-S04), #143 (E10-S03), #144 (E11-S04) and #145 (E13-S04), and added them to the epic checklists with the closed stories ticked. I filed no shipment-edit story: the #84 spec excludes it, so that is the owner's call.
- 13:25 — A subagent is applying the six reports' catalogue tables to `CPG-acceptance.md`, citing #139–#145 for the open halves.

- 13:40 — The catalogue pass changed 238 rows: 196 `Passed (automated)` and 42 `Partially verified`. Each open half cites #139–#145 or slice 3 (#14). Where reports conflicted, the more conservative status won: LFC-018 is partial because of #139. REV-011/014 are Passed: their Given/When/Then are asserted by the E11 tests, and the variance-report half is noted against #145.

## Changes

- `.ai/specs/research/CPG-acceptance.md`: the E07–E11 and E13 rows, and the "Last updated" paragraph.
- `packages/app/src/help/topics.ts`: the purchasing topics say "under Transactions" (EN and PL; the sidebar has no Procurement group). The transfer topic no longer says Close Early "comes with a later release".
- `BACKWARD_COMPATIBILITY.md`, §4:
  - restored the admin page URL list that PR #108 deleted, now covering every current page;
  - removed the duplicated physical-stock API block;
  - moved the customer-order, production, lifecycle and reversal sections out of "Changing this document";
  - added forecasts to the `BASE_UNIT_IN_USE` causes.
- Spec implementation notes:
  - stock ledger: the merge facts;
  - customer orders: typos, the merge;
  - shipments: #115, the E11-S01 resolution, the PR;
  - purchasing: error-code and sidebar deviations, #141, #142;
  - goods receipts: #141;
  - transfers: closure update, #139;
  - production orders: QA evidence;
  - variance report: the dropped #92 handoff, #145.
- Stale spec paths:
  - the run logs for #80, #86 and #92, and the PR #108 merge log;
  - the #92 plan, which also gets `Status: complete`.
- Customer-orders run log: the misplaced 17:47 entry moved into Log, and its follow-up marked done. Production-orders plan: the handoff marked superseded.
- GitHub: new stories #139–#145. The epics #73, #74, #75, #76, #77 and #79 have their closed stories ticked and the new ones added.

## Verification

- `npm run lint`: 0 errors (1 warning that predates this branch). `npm run typecheck`: clean.
- `npm run test:coverage`: 479 files, 3,137 tests pass, 100% statements (9102/9102), branches (3913/3913), functions (3025/3025) and lines (7992/7992). This includes `tests/ai-filenames.test.ts` and `tests/spec-images.test.ts`.
- `npm run build`: passed.
- No integration test was touched, so none was run locally; CI runs the suite. The only runtime change is help copy, covered by the help unit tests.
- The `main` Deploy run on `d2300ef` was still in progress when this was written. PRs #133 and #135 merged 24 seconds apart, so that run is the first CI of the two together. The new Passed rows assume it goes green.

## Follow-ups

- None of the six epics closes until its new story ships: #139 (E07), #140 (E08), #141 and #142 (E09), #143 (E10), #144 (E11), #145 (E13). E09 also has the open follow-ups #115 and #138.
- Owner decisions:
  - shipment edit and cancel (out of scope in the #84 spec, never filed);
  - the QA labels on the merged story PRs. Most still carry `review`/`needs-qa` with no human QA recorded.
- No issue tracks the development-mode hydration limitation noted in #90/PR #123.
