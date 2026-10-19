# Issue #23: locations, customers and suppliers (spec, then implementation)

**Date:** 2026-10-19 20:14 UTC
**Agent:** Claude Code (Opus 5.5) via cezar: `om-auto-fix-issue 23` → `om-auto-write-spec 23` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/2026-10-19--2014UTC-locations-customers-suppliers.md` (written in this run)
**Status:** in progress

## Goal

#23 (E03-S02): the admin maintains tenant-local locations, customers and suppliers, each with an ID, a name and an active flag; every user views them. Feature route: write the spec and open the design-only spec PR, then implement it on its own PR.

## Log

- 20:14 FR triage:
  - the issue has the `feature` label;
  - no location, customer or supplier code exists (only a help-topic mention);
  - no PR references #23 and no spec covers it;
  - `SDLC.md` has no Definition of Ready.

  Claimed #23. Created the branch `spec/locations-customers-suppliers` from `origin/main` in the cezar worktree, and ran `npm ci` (the worktree had no `node_modules`).
- Context read:
  - the brief;
  - the PRD, data model and decision register, as text extracted with `pdftotext`. Location: "site with active flag". Customer/supplier: "tenant-unique ID/name and active flag". The Test reset "restarts all Test business IDs from 00000001", and the master import treats a blank ID as a create;
  - the TEN, LFC and MAT-029 scenarios;
  - the materials spec and its implementation: `MaterialService`, `material-code.ts`, `demo-data.ts`, the routes, the page and the actions;
  - `tests/tenant-entry-points.test.ts`: only tenant entry points may call `tenantScope`, so routes, pages and actions stay per kind.
- 20:16 Spec drafted with 9 Open Questions resolved by autonomous defaults. Q2 (server-assigned eight-digit IDs for all three kinds) is marked ⚠: it fixes API paths and the import format.
- 20:19 Built `main`, ran the standalone server on port 3318 with a temp `DATA_DIR` and captured the current Test home. Rendered three static mockups with agent-browser.

- 20:24 The fresh-context review returned "revise". Folded in:
  - composition instead of a base class (standards: "composition over inheritance"): a `NamedRecords` helper, a kind descriptor and three delegating services. The `db` side exports the row and entity types, and a typecheck spike in step 2;
  - `requireActive` dropped (YAGNI, materials Q7 precedent). The rule ships with the first story that stores a reference. Q5 is now ⚠, because it narrows an acceptance criterion;
  - Q2 must be confirmed before **any** phase merges, because the Phase 1 seed writes IDs on deploy;
  - the seed handles failures per kind;
  - `businessIdSchema` moves to `validators/business-ids/`;
  - BACKWARD_COMPATIBILITY: §4 pages, help topic IDs and Versions; the migration's up/down test; a `risk-high` rollback note;
  - shared `fill`/`errorFormatter` instead of a copy; the 12 audit action labels; users-table row actions as the reference; no not-found test against a mock.

## Changes

- `.ai/specs/2026-10-19--2014UTC-locations-customers-suppliers.md` (the spec) and `.ai/specs/assets/locations-customers-suppliers/` (one current screenshot, three mockups with their HTML).

## Verification

## Follow-ups
