# Copy: UNIT_NOT_CONVERTIBLE screen texts mention that SU can't be entered (#243)

**Date:** 2026-10-25 11:58 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 243`, dispatched by cezar)
**Spec:** none (copy follow-up from the #242 review; the statistical-unit spec is already implemented)
**Status:** done

## Goal

Since #242, `convertToBaseQuantity` refuses a quantity entered in `SU` with `UNIT_NOT_CONVERTIBLE`. Screen copy that names "configured conversions / alternate units" still suggests SU, which is a configured conversion, would be accepted. Reword it to say *physical* units and "not SU", in EN and PL, with a test per touched screen. No behaviour change.

## Log

- 11:58 — Concurrency check: issue open, unassigned, no `in-progress`, no claim comment, no PR or commit references #243 (`gh pr list --search 243`, `git log origin/main --grep '#243'`).
- Classification: labelled `enhancement`, but it describes misleading existing copy with "no behaviour change", not a new capability. Took the bug (corrective) route instead of the feature route's spec-then-build, which would be out of proportion for a copy nit.
- Triage: real and unfixed. `en.ts` `productionOrders.unitHint` ("…or a configured alternate unit") and `productionOrders.errors.UNIT_NOT_CONVERTIBLE` ("…or one of its configured conversions"), PL the same.
- Root cause / scope decisions:
  - The texts that name conversions and that a user can reach with SU (free-text unit fields, imports): production-order unit hint and `UNIT_NOT_CONVERTIBLE` error (production dialog and completion), forecast unit hint (free-text field), stock `UNIT_NOT_CONVERTIBLE` error (stock corrections and the stock import, which keep the raw code).
  - The message-keyed `fieldErrors.unitNotConvertible` texts are **not** changed: their EN text must equal the API's `UNIT_NOT_CONVERTIBLE_MESSAGE` (`forecasts/labels.test.ts` "keeps English equal to the schemas' messages"), and the API's English messages stay stable (lesson 2026-10-24, BACKWARD_COMPATIBILITY.md). Changing them would mean changing the API contract.
  - Help topics that say "any unit the material converts" are left alone: the SU help topic already says quantities are never entered in SU, and the issue is about the error/hint copy.
- Also reworded the import templates' Unit column prose ("a unit it converts", `workbook-layout.ts` BOM lines and `stock-layout.ts`), since import rows reach the SU refusal too.
- 12:05 — Claimed the issue (assignee, `in-progress`, claim comment).
- 12:10 — PR #246 opened; labels `review`, `bug`, `needs-qa`, `priority-low`, `risk-low`; lock moved to the PR.
- 12:15 — UI evidence: the standalone build on a fresh `DATA_DIR`, driven by agent-browser at 1280×800. Both hints are shown and screenshots are posted on the PR (`qa-evidence/pr-246`).
- 12:20 — Independent review (fresh agent): approve, nits only. Applied them:
  - the stock text no longer contradicts itself when SU is the cause ("can't be entered: no conversion, or SU");
  - the stock-import help lists SU among the dry-run problems;
  - full PL strings are asserted with `toBe`;
  - both production-order texts are read through `productionLabels`.

  Not applied: relabelling the issue from `enhancement` to `bug`, which is the owner's call.
- Branch: worked on the cezar branch `cez/000633d8` (a linked worktree, reused per the skill); pushed as `fix/issue-243-su-unit-copy`.

## Changes

- `packages/app/src/i18n/messages/en.ts`, `pl.ts`: `forecasts.form.unitHint`, `productionOrders.unitHint`, `productionOrders.errors.UNIT_NOT_CONVERTIBLE`, `stock.errors.UNIT_NOT_CONVERTIBLE` say physical units / not SU / SU is for reports only.
- `packages/app/src/help/topics.ts`: the stock-import topic lists SU among the dry-run problems (EN/PL).
- `packages/core/src/domain/imports/workbook-layout.ts`, `stock-layout.ts`: the Unit column's meaning says "physical unit … (not SU)" in EN and PL.
- Tests: `production-orders/labels.test.ts`, `production-orders/production-dialog.test.tsx`, `forecasts/add-forecast-dialog.test.tsx`, `stock/labels.test.ts`, `domain/imports/stock-layout.test.ts`, `domain/imports/workbook-layout.test.ts`, `help/topics.test.ts`.
- `.ai/lessons.md`: extended the 2026-10-25 SU choke-point lesson with where SU copy can and can't go.

## Verification

- The 8 new tests fail with the copy reverted (`git checkout` of the four source files) and pass with it.
- `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run test:coverage` exit 0 (569 files, 4329 tests, 100% thresholds held); `npm run build` exit 0.
- No integration test asserts the changed texts (grep of `tests/` for the old phrases found none), so no integration file was run locally; CI runs the suite.
- After the review fixes: lint, typecheck and test:coverage exit 0 (569 files, 4331 tests), and build exit 0.
- Browser: the forecast and production-order dialogs show the new hints (local standalone build, agent-browser). Screenshots are on PR #246.

## Follow-ups

- None filed. Other help topics still say "any unit the material converts" for forecasts, BOMs, receipts and transfers; the Statistical unit topic already says quantities are never entered in SU, so they were left as they are.
