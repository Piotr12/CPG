# Issue #24: planning parameters and safety-stock targets (spec, then implementation)

**Date:** 2026-10-20 05:27 UTC
**Agent:** Claude Code (Opus 5.5) via cezar: `om-auto-fix-issue 24` → `om-auto-write-spec 24` → `om-spec-writing --autonomous`
**Spec:** to be written in this run
**Status:** in progress

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

## Changes

## Verification

## Follow-ups
