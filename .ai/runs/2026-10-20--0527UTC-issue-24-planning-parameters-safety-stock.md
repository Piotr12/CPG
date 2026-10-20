# Issue #24: planning parameters and safety-stock targets (spec, then implementation)

**Date:** 2026-10-20 05:27 UTC
**Agent:** Claude Code (Opus 5.5) via cezar: `om-auto-fix-issue 24` → `om-auto-write-spec 24` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/implemented/2026-10-20--0532UTC-planning-parameters-safety-stock.md` (written in this run on #64; moved to `implemented/` on #65 once #64 merged)
**Status:** done (spec PR #64 and implementation PR #65 ready for review; no assumption needs confirmation)

## Goal

#24 (E03-S03): the admin sets each material's planning parameters per location (Make/Buy, lead time, minimum quantity, lot multiple) and its effective-dated safety-stock targets. Feature route: write the spec and open the design-only spec PR, then implement it on its own PR.

## Log

- 05:27 FR triage:
  - the issue has the `feature` label;
  - no planning-parameter or safety-stock code exists (`packages/*/src` has no match for lead time, lot multiple or safety stock);
  - no PR references #24 and no spec covers it (the locations and sidebar specs only name it as a later story);
  - `SDLC.md` has no Definition of Ready.

  Claimed #24. Created the branch `spec/planning-parameters-safety-stock` from `origin/main` in the cezar worktree, and ran `npm ci`.
- Context read:
  - the brief;
  - the PRD, data model and decision register as `pdftotext` text: "Material × location: make or buy · lead time · minimum lot · lot multiple", "Safety stock: material × location × effective-from date, persists until next target, zero default";
  - MAT-014…018, MAT-029, DEM-014…023 and LFC-019…021;
  - the materials and locations specs and code, `NamedRecords`, `tenantServerAction`, the read-only gate, `seedDemoData`, `nav-tree.ts`;
  - the owner-chosen sidebar mockup 01, which already has dedicated **Planning parameters** and **Safety stock** screens under Master data. That decided Q2: two list pages, not sections on the material page.
- 05:32 Spec drafted with 13 Open Questions resolved by autonomous defaults. None is ⚠: each is reversible, and each one either enforces an existing rule (R02, R03, locations Q5) or follows the owner's mockup.
- 05:36 Built `main` and ran the standalone server on port 3318 with a temp `DATA_DIR`. Captured the current Test Master data, then rendered three static mockups in the sidebar layout with agent-browser.
- 05:40 The fresh-context review returned "revise". Folded in:
  - the demo seed would bring back rows an admin removed. It now runs only when Test has no row **and no audit entry** of the kind;
  - base-unit quantities are stored with six decimals, the `toBaseQuantity` format;
  - cross-concept lookups and usage checks go in leaf files (no circular imports);
  - `findNamedRecord` is moved out of `NamedRecords`;
  - pages join the material and location lists; ordering is in memory;
  - `BASE_UNIT_HAS_CONVERSIONS` wins over the generic `BASE_UNIT_IN_USE`;
  - audit labels use the `code — name` style;
  - fixed the LFC citations;
  - added an Out of scope section;
  - the phases are checkpoints of one PR;
  - a `kamal rollback` note, and `risk-high`;
  - the material option shows its base unit.

- 05:45 Opened the spec PR #64 as ready, with:
  - its labels;
  - the defaults table (also posted on #24);
  - the visual evidence;
  - the run summary.
- 05:43–06:40 Implemented on `feat/planning-parameters-safety-stock` (#65). The plan, its deviations and the verification are in `.ai/pipeline/runs/2026-10-20--0543UTC-planning-parameters-safety-stock.md`.
  - The integration suite found two shared-layer bugs, both fixed with tests and recorded in `.ai/lessons.md`:
    - `serverAction` dropped a service's field errors;
    - the shadcn dialog doesn't scroll.
  - agent-browser can't fill date inputs, so the tests use a new `fillDate` helper.
  - A fresh-context code review asked for more browser tests, the 404 codes in the contract doc, and a neutral home for the shared references. All are done.
- 06:45 Marked #65 ready with its full labels, the review, the UI evidence and the summary. Released the issue lock.

## Changes

- `.ai/specs/2026-10-20--0532UTC-planning-parameters-safety-stock.md` (now in `implemented/`) and `.ai/specs/assets/planning-parameters-safety-stock/` (one current screenshot, three mockups with their HTML), on #64.
- The implementation, on #65 (see its tracking plan).

## Verification
- On #64: `npx vitest run tests/ai-filenames.test.ts` passes.
- On #65, the full gate:
  - lint and typecheck are clean;
  - unit tests: 1556, at 100% coverage;
  - the build passes;
  - Docker integration: 22 files, 156 tests.

## Follow-ups
- #64 is merged; #65 merged `main` and moved the spec to `implemented/`. Merge #65 after its review and QA.
- #65 needs human QA (`needs-qa`) and a human approval: the pipeline account can't approve its own PR.
- Only the status label depends on "today" being the UTC date (spec Q10). MRP (slice 3) must decide its business date.
- #27 (import) must reuse `create`/`update` and the error codes of both services.
