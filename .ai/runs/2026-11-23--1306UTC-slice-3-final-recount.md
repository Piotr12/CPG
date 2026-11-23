# Slice 3 closing pass: final recount (#292, E20-S03)

**Date:** 2026-11-23 13:06 UTC
**Agent:** Claude Code (`om-auto-fix-issue`) / Claude Opus 5.5
**Spec:** none. The issue's acceptance criteria serve as the spec, as in the first pass (`.ai/runs/2026-11-05--0744UTC-close-slice-3-epics.md`).
**Status:** done

## Goal

The first pass (PR #383) left #292 open: 516 of 535 rows were Passed and the gaps were filed as #378–#382. This run checks the catalogue against `main` again now that those stories have merged. It dates the Execution status against `main`'s commit and closes #292, E20 (#272) and E06 (#14).

## Log

- 13:06 — `main` at `94818b1c`. #378–#382 are closed, through PRs #385, #389, #387, #388 and #384. Epics E14–E19 (#266–#271) are closed. E20 (#272) and E06 (#14) are open, and #292 is the only open story in E20. Claimed #292.
- Counted the catalogue: 535 `### ` rows, and all 535 read `**Status:** Passed (automated)`. The header reads "every scenario Passed (automated)". The latest Execution status entry (#381, 2026-11-05) gave the same counts but named no commit.
- Checked every backticked path in every Evidence line against `git ls-files`, matching short names such as `mrp-report.test.ts` by suffix: none is missing.
- Checked that each scenario ID an Evidence line quotes from a test title (`` `file` ("MRP-024": …) ``) is still in the file it cites: all 294 are. The script's one hit, MRP-050's "LFC-025", was a false positive. The quote belongs to `plan-mrp.test.ts`, the second of two paths, and that file has it.
- Read every removed line in the test files changed since #381's merge (`6197d68d..94818b1c`: #390, #391, #396, #397, #400 and the MCP work). No cited assertion was removed. #396 rewrote MRP-036's BOM-line text to name the BOM, revision and line from 1, and it is still asserted as "Unit not convertible".
- No row says "slice 3 (#14)". DEM-007 keeps its D08 erratum. `.ai/specs/` holds no active spec, only `README.md`, `backlog.md` and `product-brief.md`.
- Decision: rows are not rechecked clause by clause again. The first pass did that for every slice 3 row, each of #378–#382 rechecked the rows it moved in its own reviewed PR, and the checks above show that no later commit broke a citation.
- Owner decisions: none new. #382 recorded the four errata (MRP-004, RUN-018, PRD-002, E2E-010) the run decided on the specs' recommended answers. No exception was needed.
- Tracker: E20's checklist ticked for #292 and #382. The PR closes #292, #272 and #14, and #14 gets a comment linking the epics and this update. No new gap was found, so no story was filed.

## Changes

- `.ai/specs/research/CPG-acceptance.md`: a new Execution status entry dated 2026-11-23 against `94818b1c`. The counts are unchanged: 535 Passed (automated), 0 Partially verified, 0 Not executed.
- This run log.

## Verification

- Catalogue counts, path check and quoted-ID check, as logged above.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 6 tests passed. No other test reads `.ai/` or the catalogue, and ESLint doesn't lint markdown. The change is docs-only, so lint, typecheck, coverage and build are left to CI.

## Follow-ups

- The owner's `om-discover --refresh` of `.ai/specs/product-brief.md`: mark slices 2 and 3 done, and set the primary metric's baseline to 535 of 535. That edit is the owner's, so this PR doesn't touch the brief.
