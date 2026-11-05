# Slice 3 closing pass: the acceptance catalogue, epics E14–E20 and E06 (#292)

**Date:** 2026-11-05 07:44 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 292`, dispatched by cezar
**Spec:** none. Design authority: issue #292's acceptance criteria, `.ai/specs/product-brief.md` and `.ai/specs/research/` (as for the slice 2 closing passes).
**Status:** done

## Goal

E20-S03 (#292): recheck every catalogue row that is not Passed (automated), and every row a slice 3 story moved, against the tests on `main`. Promote a row only when its tests' `expect`s cover every clause of its Then; file every gap as a story in its epic; fix dead Evidence paths and "slice 3 (#14)" notes; date the Execution status paragraph against `main`'s commit; tick and close the epics that have no gap left, and close E06 (#14) once they all are. No product code, no new tests, no brief edit.

## Plan

1. Claim #292, branch `fix/issue-292-slice-3-closing-pass` off `origin/main` (`59409518`), `npm ci`.
2. Count the catalogue on `main`: 436 Passed (automated), 80 Partially verified, 19 Not executed (535).
3. Recheck by area, one read-only subagent each, as the slice 2 second pass did: TEN/MAT/BOM, SAL/PRD/REV/TRF, DEM, MRP, RUN/UX/LFC/E2E. Each covers its not-passed rows and the Passed rows that slice 3 stories (#273–#291, #304, #310, #320, #321, #327, #336, #369, #376) moved, and writes per-row verdicts with the replacement Status and Evidence text to a scratch file.
4. Spot-check the verdicts myself (every promotion: its `expect`s), apply them to `CPG-acceptance.md`, and check every cited path with `git ls-files`.
5. File each gap as a story in its epic (Backlog ids from `.ai/specs/backlog.md`), cite it in the row, the epic checklist and this log.
6. Tick the epic checklists; close the epics with no open story; close E06 (#14) only if E14–E20 all close.
7. `npm test` (naming and spec-image checks), lint, typecheck, `test:coverage`, build; PR with `Refs`/`Closes` chosen by what ships.

Classification: #292 is labelled `documentation` and is neither a defect nor a new capability, so neither the bug chain's triage gate nor the feature route's spec-then-build fits. It follows the slice 2 closing passes (`2026-10-21--1237UTC-close-slice-2-epics.md`, `2026-10-23--2123UTC-close-slice-2-epics-second-pass.md`), which ran with no spec; the issue's own criteria serve as the spec.

## Log

- 07:44 — Claimed #292. `main` at `59409518`. Counts on `main`: 436 / 80 / 19. Every slice 3 story (#273–#291) is closed; their specs are in `.ai/specs/implemented/`. The only active spec, `2026-10-25--0747UTC-list-quantity-and-po-date-sort.md`, is not slice 3, but #224 shipped in PR #228 and left it there: moved to `implemented/` with notes.
- 07:50 — Seven read-only subagents rechecked by area: TEN/MAT/BOM/API/AUD/INV; SAL/BUY/PRD/REV/TRF; DEM; MRP-001…025; MRP-026…051; RUN; UX/LFC/E2E. Each wrote per-row clause mappings and replacement lines to a scratch file. A dead-path check (`git ls-files` against every backticked path in every Evidence line) found none. A grep for "slice 3 (#14)" found six Passed rows outside those areas that still deferred an MRP clause (BOM-009, BOM-027, TRF-003, LFC-004, LFC-006, LFC-015). An eighth subagent checked them, plus every Passed row outside MRP/RUN/DEM whose Given/When/Then mentions planning (34 rows). All their MRP clauses are now asserted, so ten Evidence lines were rewritten and none was demoted.
- 08:55 — Spot-checked promotions in the test source myself (`plan-mrp.test.ts` "MRP-007", "DEM-002", "MRP-011, MRP-021", "MRP-017", "MRP-023", "UX-024", "DEM-023"): the `expect`s match each clause. Applied the verdicts with a script that replaces only the Status and Evidence lines of the rows named.
- Decision: a row passes when every clause of its Then is asserted through the channel the Then names. Planning figures pass on the engine, the stored run and the API; a "user sees" clause needs a component or browser test. That is the catalogue's own definition, read literally. Most of the 81 promotions were rows that slice 3 specs held at Partially verified "until the screen ships" although their Then names no screen. The rule is stated in the Execution status entry, so the owner can overrule it there.
- Decision: MRP-044 goes to Partially verified, not left Not executed, to match DEM-018…022. All six have their priority rule asserted in the engine, and all six lack a channel that shows the outcome.
- Decision: the gaps go to stories in their own epics: #378 (E15-S04), #379 (E17-S04), #380 (E18-S04, behaviour), #381 (E19-S04). The four rows that need an owner decision (MRP-004 / #279 Q2, RUN-018 / #289 Q3, PRD-002 / the production dialog's physical-stock feasibility, E2E-010 / no overlap in one process) go to one decision story, #382 (E20-S04). No exception was recorded as accepted: the owner hasn't accepted any.
- Tracker: epic checklists #266–#272 ticked for #273–#291, with the new stories added. E14 (#266) and E16 (#268) have no open story, so the PR closes them. E15, E17, E18, E19 and E20 stay open on their new stories, and E06 (#14) stays open until they close. #292 stays open too: its "all 535 Passed" and "E06 closes" criteria wait on #378–#382.
- Not done here, by scope: renaming `plan-mrp.test.ts`'s "BOM-006, MRP-031" title, which no longer asserts MRP-031 (test code; it is in #379). The brief edit is the owner's (`om-discover --refresh`); slices 2 and 3 can be marked done once #378–#382 close.

## Changes

- `.ai/specs/research/CPG-acceptance.md`: 89 statuses and 25 more Evidence lines; Execution status dated against `59409518`. Counts: 516 Passed (automated), 19 Partially verified, 0 Not executed (535).
- `.ai/specs/backlog.md`: E15-S04, E17-S04, E18-S04, E19-S04, E20-S04.
- `.ai/specs/implemented/2026-10-25--0747UTC-list-quantity-and-po-date-sort.md`: moved, `Status: implemented`, implementation notes.
- `.ai/lessons.md`: the scenario-citing lesson now also says to read a Then literally and to carry a deferred clause into the later story's issue.
- GitHub: #378–#382 filed; epic checklists #266–#272 updated.

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0; 678 files, 5,667 tests passed (2 skipped); 100% statements (13,840), branches (6,412), functions (4,388) and lines (11,846). This includes `tests/ai-filenames.test.ts` and `tests/spec-images.test.ts` after the spec move.
- `npm run build`: exit 0.
- Catalogue: 516 + 19 + 0 = 535 by status; every backticked path in every Evidence line resolves in `git ls-files`; no row says "slice 3 (#14)"; every Partially verified row names its story, and no Passed row names a gap.
- No integration test was touched, so none ran locally.

## Follow-ups

- #378, #379, #380, #381, #382; then a final recount that closes #292, E15, E17–E20 and E06 (#14), and the owner's `om-discover --refresh` of the brief.
