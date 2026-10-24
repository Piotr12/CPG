# Second closing pass over the slice 2 epics E07–E12

**Date:** 2026-10-23 21:23 UTC
**Agent:** Claude Code (claude-opus-5-5), dispatched by cezar
**Spec:** none (epics #73–#78; their story specs are in `.ai/specs/implemented/`)
**Status:** done

## Goal

Every story of epics E07 (#73) to E12 (#78) is closed. The first closing pass is `2026-10-21--1237UTC-close-slice-2-epics.md`; the leftovers it filed (#139–#147, #152–#155) are closed too. Review the epics again for anything still left, with one subagent analysing only the test surface of the implemented scope (all but E06). Then, at the owner's request, open the closing PR:
- file every functional and test leftover as a story in its epic (the first pass's rule);
- fix the paperwork in this PR.

## Log

- 21:23 — Analysis done, read-only. Five subagents ran: test surface; E07+E12; E08; E09+E10; E11 plus cross-cutting paperwork.
  - Their reports and my verdict went to the owner in the session.
  - I checked the four functional gaps in the code myself: `material.service.ts:355-362`, `purchase-requisition.service.ts:59-66`, `en.ts:1423`, and `config/deploy.yml` having no `proxy.response_timeout`.
  - The owner answered "create a closing PR, ok with the decision you made".
- 21:30 — Filed:
  - #185 (E12-S03): realistic reset vs. the proxy timeout on production.
  - #186 (E09-S05): `MATERIAL_IN_OPEN_ORDER` linked and translated, plus E2E-017.
  - #187 (E09-S06): requisition list paging.
  - #188 (E08-S06): cancelled-shipment message, honest E08 test titles, INV-007.
  - #189 (E12-S04): reset proofs.
  - #190 (E07-S05): ledger and transfer proofs.
  - #191 (E10-S05): recipe, revision and BOM-only deactivation proofs.
  - #192: close-early API tests, customers in the browser, integration hardening, and six catalogue rows outside the slice 2 epics.

  The three close-early routes went to #192 rather than an E11 story. E11 has no functional gap, so it closes with this PR.
- 21:35 — A subagent is updating `CPG-acceptance.md`: stale statuses, overclaims, dead evidence paths, citations of the latest PRs, and pointers to #185–#192. Meanwhile I'm doing the other paperwork:
  - the specs for #4 and #43 move to `implemented/`. Both were implemented (PRs #6 and #46). #58's sidebar spec superseded only #43's layout answers;
  - `BACKWARD_COMPATIBILITY.md` §4:
    - the requisition and PO statuses gain `cancelled` / `closed-early`;
    - the Versions list adds customer orders, shipments and production orders;
  - help copy, EN and PL:
    - a fresh Test holds two months, not two years;
    - the line-based header sentence is dropped from the production-order, requisition and transfer topics, which have no lines;
    - the PO page's reversal paragraph now speaks of receipts, not issues;
  - run logs:
    - #90 and #91: their merges noted;
    - #143: its CI status;
    - two-datasets: its spec path.
- 23:40 — The catalogue pass changed these rows:
  - **to Passed (automated):** TEN-009, MAT-009, MAT-029, INV-023, LFC-019, API-034, AUD-001, UX-025;
  - **back to Partially verified:** TRF-012 and BUY-017, both overclaims;
  - **Not executed → Partially verified:** SAL-015, E2E-004, E2E-006, E2E-009, E2E-013, E2E-017, E2E-018, E2E-020.

  Stale notes and dead evidence paths are fixed. The counts are now 353 Passed, 40 Partially verified and 142 Not executed (535 rows). The subagent found two more things:
  - the E2E-006 and E2E-013 gaps had no issue, so I added them to #192;
  - the MAT-009 movement lock is already asserted, so I dropped it from #190.
- Not done here, by decision: unifying Polish "Zakończone" / "Zrealizowane" across status labels. It touches labels, errors, help and tests in four namespaces and is a wording choice for the owner; the new PO help sentence uses the PO page's own label, "Zrealizowane".

## Changes

- `.ai/specs/implemented/2026-10-17--1321UTC-mammoth-app-icons.md`, `.ai/specs/implemented/2026-10-19--1312UTC-navigation-menu.md`: moved, `Status: implemented`, implementation notes, asset links `../assets/`
- `tests/app-icons.test.ts`: the comment's spec path
- `BACKWARD_COMPATIBILITY.md`
- `packages/app/src/help/topics.ts`
- `.ai/specs/research/CPG-acceptance.md`
- run logs for #90, #91, #143 and the two Test datasets
- GitHub: #185–#192 filed; epic checklists #73–#78 ticked and extended

## Verification

- `npm run lint`: 0 errors, 1 warning. The warning predates this branch: the unused `lineError` at `packages/core/src/services/boms/bom.service.ts:29`.
- `npm run typecheck`: clean.
- `npm run test:coverage`: 496 files, 3,545 tests pass. Coverage is 100% on all four metrics: statements 10206/10206, branches 4348/4348, functions 3381/3381, lines 8868/8868. That run includes the `ai-filenames`, `spec-images` and help tests.
- `npm run build`: passed.
- No integration test was touched, so none ran locally. The only runtime change is help copy, which the help unit tests cover. CI runs the full suite on the PR.

## Follow-ups

- Stories: #185 (priority-high), #186, #187, #188, #189, #190, #191, #192.
- Owner decisions, raised in the session and in the PR:
  - the `needs-qa` / `review` / `merge-queue` labels on about 30 merged slice 2 PRs;
  - the #153 Q1 default and five unconfirmed completion deviations;
  - #182's backward-compatibility §1 exception;
  - cancelling a customer order marks its unissued shipments `completed`, not `cancelled`;
  - whether open requisitions should block material deactivation, as they block a location's;
  - UX-014 tooltips;
  - the unit-test mocking of the app's own auth modules;
  - one Polish term for Completed.
