# Execution plan — MRP proposal acceptance (E19-S01, #287)

**Date:** 2026-11-01 07:51 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-write-spec` (#318) → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-01--0737UTC-mrp-proposal-acceptance.md` (spec PR #318)
**Issue:** #287
**Status:** done

## Goal

Accepting a Buy proposal of the tenant's latest MRP run, after a confirmation, creates one Open purchase requisition tagged with the run's ID. The proposal is planned again first and refused as stale when it no longer holds, refused when already accepted, and never changes an existing document. Make proposals stay listed but not acceptable; their half is a follow-up story blocked on #282.

## Scope

The spec's Implementation Plan, as written: the two columns and their migration, the requisition's run link, the proposal view fields, `MrpAcceptanceService`, the API route, `refreshAfterWrite`'s extra codes, the server action and the screen (Proposals table, dialog, counts, requisitions column), the benchmark, two integration files, copy, compatibility, standards, catalogue, the Make follow-up issue and the spec move.

**Non-goals:** accepting Make proposals (follow-up, blocked on #282); late-supply dates (E16-S02); exceptions (E16-S03); reruns netting accepted documents (E19-S02); automatic mode (E19-S03); explaining proposals (E18).

## Implementation Plan

Phase 1, storage and documents (spec steps 1–3): migration, requisition run link, proposal view.
Phase 2, acceptance (spec steps 4–5): the service with its tests and race test, the API route.
Phase 3, screen (spec step 6): `refreshAfterWrite`, the action, the Proposals table and dialog, the columns, messages and help.
Phase 4, proof and paperwork (spec steps 7–9): benchmark, integration tests, docs, catalogue, follow-up issue, spec move.

## Risks

- Planning again on every accept under the write gate: measure it against the run's budgets (spec Risks).
- A new migration moves every migration count (lesson 2026-10-23); the generator may rebuild a table, so check the SQL.
- Docker may be unavailable; then run the integration files on a local standalone build (lesson 2026-10-23).

## Log

- 07:51 The implementation branch was cut from `main`, not stacked on the spec PR, and carries the spec in. It also deletes #278's stale active spec copy, as #318 does.

- Phase 1: the generator wrote two `add column`s, no rebuild. `mrp-acceptance-migration.test.ts` checks the populated upgrade, in place, and old-style inserts. The migration counts, lists and rollback-by-count tests take it. Core and app suites: 533 files, 4,065 tests green.
- Phase 2: `MrpAcceptanceService` at 100% on its own tests (15, plus a two-ORM race: one requisition, the loser refused `MRP_PROPOSAL_ACCEPTED` after 2 plannings in all). Test fixes, not code fixes: a same-pair order line a day *earlier* than the need leaves the proposal unchanged (planned again it gets its own), so RUN-017's line goes on the need date; a material with open demand can't be deactivated, so Q11's test sets the flag directly.
- Phase 3: QA screenshots showed the new MRP run column past the table's visible edge at 1280 px, so the run moved under the requisition's ID. The integration files caught three seams, all fixed: `purchasing.test.ts` read requisition cells by position, `mrp-run-api.test.ts` compared #278's proposals exactly, and `mrp-report.test.ts` read the first `main h3`. The seam lesson was extended.
- Phase 4: the benchmark, run alone, takes 135 ms realistic and 1,394 ms at ten times to accept (stalls of 26 and 83 ms), against budgets of 1 s, 5 s and 250 ms. The Make half was filed as #320. The spec moved to `implemented/`.
- Review: a fresh-context code review asked for changes, with no Critical or High findings. Medium: the refresh on `MRP_PROPOSAL_ACCEPTED` hid the refusal, so the dialog now refreshes the page on close; untranslated `MATERIAL_INACTIVE`, `LOCATION_INACTIVE` and `VALIDATION_FAILED` texts were added. Low: test gaps, the midnight guard and help fields, all fixed in bfdee3ea. One point is not addressed: focus after a successful accept goes to the page, since the trigger is replaced.
- Gate on bfdee3ea: lint 0, typecheck 0, coverage 637 files and 5,045 tests at 100% on every measure, build 0. Integration on a local standalone build (no Docker here): 10 files and 80 tests, then 6 files and 39 tests after the fixes.
- Process slip: `git stash` was used once, briefly, despite the worktree note; the entry was applied by its SHA and dropped by its tag at once.

## Progress

PR: #319

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Storage and documents

- [x] 1.1 Columns and migration — 8433e688
- [x] 1.2 Requisition run link — a9561430
- [x] 1.3 Proposal view fields — 717c2704

### Phase 2: Acceptance

- [x] 2.1 Acceptance service — 20fca54d
- [x] 2.2 Accept route — d3fc8476

### Phase 3: Screen

- [x] 3.1 refreshAfterWrite extra codes and the accept action — 6ce9ac8b
- [x] 3.2 Proposals table, dialog and columns — 51656ab7
- [x] 3.3 Messages and help — 50bc7eda

### Phase 4: Proof and paperwork

- [x] 4.1 Benchmark — e2555d0a
- [x] 4.2 Integration tests — 7ef63df0
- [x] 4.3 Docs, catalogue, follow-up issue and spec move — ef1fecd0
