# Issue #27: master-data and BOM spreadsheet import (spec, then implementation)

**Date:** 2026-10-20 09:01 UTC
**Agent:** Claude Code (Opus 5.5) via cezar: `om-auto-fix-issue 27` → `om-auto-write-spec 27` → `om-auto-implement-spec`
**Spec:** to be written in this run
**Status:** in progress

## Goal

#27 (E05-S01): the admin imports master data and BOMs from a workbook — downloadable templates, a dry run that reports every error, and an all-or-nothing commit, through the UI and the API. Feature route: write the spec and open the design-only spec PR, then implement it on its own PR.

## Log

- 09:01 FR triage:
  - the issue has the `feature` label;
  - no import code exists (`packages/` has no match for xlsx, exceljs, spreadsheet or workbook);
  - no open PR references #27, nobody has claimed it, and no spec covers it;
  - `SDLC.md` has no Definition of Ready, so the ticket check is skipped;
  - dependencies #24, #25 and #26 are closed (merged in #65, #57 and #70).

  Claimed #27. Branch `spec/master-data-bom-import` from `origin/main` in the cezar worktree, then `npm ci`.
- 09:05 Context read:
  - the brief (R01, R04, R05, R07, R08, D05);
  - the PRD, decisions and data model as `pdftotext` text (§05 "Master-data XLS workflow", "BOM workbook", §06 parity, idempotency, freshness and atomicity, the data model's "Import dry run");
  - XLS-001…028, API-015 and API-028;
  - the BOMs spec and every master service;
  - `tenantApiWrite`, `tenantServerAction`, `inRequestTransaction`, `BACKWARD_COMPATIBILITY.md` §4;
  - the owner-chosen sidebar mockup 01, which already has an admin-only **Import** screen under Master data: three steps and one template with a sheet per master. That decided Q2 and Q17.
- 09:08 Spec drafted with 18 Open Questions resolved by autonomous defaults; none is ⚠.
  - No schema change: the dry run runs the real services in a savepoint that is rolled back, and the commit re-runs them and compares a SHA-256 preview token.
  - New dependencies `read-excel-file`, `write-excel-file` and `fflate`, in `app` only.
- 09:13 Booted the test env (Docker), captured today's BOMs page, and rendered three static mockups of the Import screen with agent-browser.
- 09:19 The fresh-context review returned "revise". Folded in:
  - **Critical:** the outer savepoint must be opened on the request `em` itself. The reviewer reproduced that `em.transactional()` (a fork) lets services' same-named savepoints swallow the rollback, so a dry run with a refused row kept earlier rows. The spec now defines `inRequestSavepoint` with its own tests.
  - The identity map is cleared after every refused row and after the rollback.
  - The lock-stall behaviour is stated plainly. Parsing and the pure passes (`prepareImport`) run before the first write.
  - The token covers the records rows name or write, not what services read internally. It is a fingerprint, not an HMAC: there is no server secret.
  - The zip limit counts inflated bytes; XML entities are tested.
  - Tests added for the instructions text, tab order, API-015 parity and XLS-010 through the keyed path. API-028 is marked partial (its scenario is slice 2's inventory import).
  - The size of stored replays is noted.

## Changes

## Verification

## Follow-ups
