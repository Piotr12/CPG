# The owner's decisions on MRP-004, RUN-018, PRD-002 and E2E-010 (#382)

**Date:** 2026-11-05 10:51 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 382`, dispatched by cezar
**Spec:** none. #382's scope and acceptance criteria, with the specs it names: `implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md` (Q2), `implemented/2026-11-02--1031UTC-mrp-automatic-mode.md` (Q3), `implemented/2026-10-20--2047UTC-production-orders.md` (Q1), `implemented/2026-11-01--1918UTC-mrp-bom-choice.md` (Q8).
**Status:** done

## Goal

E20-S04 (#382): for each of the four catalogue rows the slice 3 closing pass couldn't settle, record the owner's decision: either an erratum with the row Passed (automated) on its other clauses, or a linked story in the row's epic. Say in #279's spec (Q2) and #289's spec (Q3) how those questions were answered. No behaviour change.

## Log

- 10:40: read #382 (no assignee, no lock, no comments) and checked each row in `research/CPG-acceptance.md` and each spec question. They match the issue's description.
- Classification: `documentation`, neither a defect nor a new capability. Like #292, this skips both the bug chain's triage gate and the feature route, and the issue's own criteria serve as its spec.
- 10:45: asked the owner the four questions as option chips, with the erratum recommended for each.
- 10:50: the owner answered "continue autonomously, make reasonable assumptions, don't ask". **Decision:** apply the recommended option for all four (erratum, row Passed). Each matches a decision already in a spec or the platform, and choosing a story later only adds work. Every erratum says the owner left the call to the run, so this isn't recorded as an explicit confirmation, and it names the story that would ask for the other behaviour (E16 #268, E19 #271, E17 #269).
- Branch `docs/issue-382-owner-decisions-catalogue-rows` off `main` at `22ee5703`.
- Errata follow DEM-007's shape: the Evidence line opens "Asserted as the erratum below restates it", the "Missing:" sentence goes, and an `Erratum (#382, …)` bullet follows the Then. The Given/When/Then text stays as exported.
- No decision record (`research/decisions/D09`) was written. These are spec answers the owner left to the run, not new product decisions, and the errata and spec cells carry them.
- The epic #272's checklist is ticked when #382 closes on merge, not before.

## Changes

- `.ai/specs/research/CPG-acceptance.md`: MRP-004, RUN-018, PRD-002 and E2E-010 move to Passed (automated), each with an erratum. The Execution status gets a #382 entry, and the counts go from 516 / 19 / 0 to 520 / 15 / 0 (535).
- `.ai/specs/implemented/2026-11-01--0738UTC-mrp-proposal-timing-demand-priority.md`: Q2 is marked answered on #382, plus a note in the BC paragraph.
- `.ai/specs/implemented/2026-11-02--1031UTC-mrp-automatic-mode.md`: Q3's answer, plus a note in its Implementation notes.

## Verification

- Status counts from grep: 520 Passed (automated) and 15 Partially verified.
- Every path the errata cite exists (`git ls-files`).
- `npm test`, `npm run lint`, `npm run typecheck`: results under the PR's validation section. Docs only: no code, tests, migrations or UI change, so coverage, build and the integration files don't change, and CI runs them all.

## Follow-ups

- If the owner wants the other behaviour for any row, file it in the epic its erratum names and move the row back to Partially verified.
