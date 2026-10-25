# E10-S05: prove the default recipe choice, completions across a revision, an imported BOM on an order and BOM-only deactivation (#191)

**Date:** 2026-10-25 17:01 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue 191`)
**Spec:** none (issue #191; catalogue `.ai/specs/research/CPG-acceptance.md`)
**Status:** done

## Goal

Close the test gaps #191 lists, reword the extra-input validation message to say "extra", and update the catalogue rows (BOM-009, BOM-027, E2E-004, E2E-015, LFC-015, the non-MRP halves of LFC-025 and LFC-027).

## Log

- 17:01 — Issue unclaimed, no open PR, labelled `refactor`. It is neither a bug nor a feature, so per the skill the bug chain runs. Triage proceeds: each row's Evidence names #191 as the owner of the missing assertion, and `EXTRA_INPUT_QUANTITY_MESSAGE` still says "an added input" while `en.ts` says "an extra input".
- Plan (one test per gap, next to the code it exercises):
  - BOM-009: `production-order.service.test.ts`, both alternatives feasible → priority 1 preselected and pinned.
  - BOM-027: `planning-parameter.service.test.ts`, an intermediate material and its Make set saved with no BOM.
  - E2E-004: `production-completion.service.test.ts`, a partial completion, then a revision, then a second completion: both expect revision 1, revision 2 stays distinct.
  - E2E-015: `import-boms.test.ts`, a BOM created by import pinned on a production order, which keeps revision 1 after a re-import makes revision 2.
  - LFC-015/025/027: `production-order.service.test.ts`, a raw component referenced only by BOMs and a pinned Open order is deactivated, audited, BOMs and order unchanged.
  - Wording: `production-completion.schema.ts`, BACKWARD_COMPATIBILITY.md row.

- 17:03 — Claimed #191 (assignee, `in-progress`, claim comment).
- 17:05 — Five tests added and passing in isolation. The BOM-027 audit assertion compares entries sorted: three writes can land in one millisecond (lessons, 2026-10-19).
- 17:06 — Message reworded to "an extra input" (the exported constant, so the screens' lookup follows); `labels.test.ts` pins it equal to the English form text. BACKWARD_COMPATIBILITY.md lists it beside #214's rewordings, under a renamed heading (no links pointed at the old one).
- 17:07 — Catalogue: BOM-009, BOM-027, E2E-004, LFC-015 → Passed (automated), each naming its MRP remainder (#14) where the Then has one, as the issue's acceptance criteria ask; LFC-025, LFC-027 → Partially verified; E2E-015 stays Partially verified with only the MRP remainder.
- 17:15 — PR #255 opened (labels `review`, `refactor`, `skip-qa`, `priority-low`, `risk-low`; lock moved to the PR). An independent review found the BOM-009 fixture's priority order equal to creation and code order: with the priority sort removed from `production-recipes.ts` the test still passed. The test now builds a second output whose priority 1 BOM is created after, and numbered above, its priority 2 one; with the sort removed it fails (checked, then restored). Also: the BACKWARD_COMPATIBILITY.md row no longer mentions `params` (the error carries none).
- Decision: BOM-027 and LFC-015 stay Passed (automated) with their MRP remainder named in the Evidence, as #191's acceptance criteria ask and as LFC-004 already does; LFC-025/027 are Partially verified because #191 scopes only their non-MRP halves and doesn't ask for Passed. The catalogue's precedent is mixed (BUY-017 was demoted for an MRP remainder in #223). Recorded on the PR for the owner to override.

## Changes
- `production-order.service.test.ts` (BOM-009; LFC-015/025/027), `production-completion.service.test.ts` (E2E-004), `planning-parameter.service.test.ts` (BOM-027), `import-boms.test.ts` (E2E-015), `labels.test.ts` (wording)
- `production-completion.schema.ts` (`EXTRA_INPUT_QUANTITY_MESSAGE`), `BACKWARD_COMPATIBILITY.md`, `.ai/specs/research/CPG-acceptance.md`

## Verification
- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (588 files, 4,520 tests, 100% statements/branches/functions/lines), `npm run build`: all exit 0.
- No integration file is touched and no integration test asserts the old message text (grep), so none ran locally; CI runs the full suite on the PR.
- CI on 988d6d2a (run 40215616842): lint, typecheck, unit tests with coverage, build and integration shards 1–4 all green.

## Follow-ups
- None new: the MRP halves stay with slice 3 (#14), as the catalogue rows say.
