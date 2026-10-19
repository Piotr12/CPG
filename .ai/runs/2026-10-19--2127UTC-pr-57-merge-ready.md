# PR #57 — read-only tenants: merge-ready after main moved

**Date:** 2026-10-19 (UTC)
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-pr 57`
**Spec:** `.ai/specs/2026-10-19--2018UTC-read-only-tenants.md`
**Status:** done (PR ready for human review and QA; CI result in the PR comments)

## Goal

Drive #57 to merge-ready: merge the latest `main`, run review-autofix, CI and UI verification. Never merge.

## Log

- Claimed #57. CI was green on `5aa387a`, but the PR conflicted with `main`, which had gained #54, #55, #56 and #59.
- A local, unpushed `cezar autosave` commit held copies of the spec and the run log, byte-identical to `main` (#55). Dropped it.
- Merged `origin/main` and resolved the conflicts:
  - **Migration:** this PR's migration was older than main's deployed `…202843_locations_customers_suppliers`. It existed only on the PR branch, so it was regenerated as `Migration20261019211303_tenant_read_only`, and the history is linear again.
  - **Materials actions:** took main's `refreshAfterWrite`, which already doesn't refresh after `TENANT_READ_ONLY`.
  - **i18n:** kept both sides.
  - **Tests:** merged the migration lists, the rollback order and the counts.
  - **New masters screens and seeds (#56):** they now follow the flag. `NamedRecordsScreen` hides its controls, and the seeds go through a shared `isScopeReadOnly`.
  - **Engineering standards:** gained a read-only rule.
- A fresh-context re-review of the merge delta approved it. Its three Low points are fixed in `232aae0`:
  - the refresh helper documents and tests `TENANT_READ_ONLY`;
  - `isScopeReadOnly` refuses an EntityManager with no tenant scope;
  - a location write in read-only Prod is covered by an API integration test.
- UI evidence of the new head (screenshots 07–08) is on #57.

## Verification

At `232aae0`:
- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 201 files, 1314 tests, 100%.
- `npm run build`: pass.
- `npm run test:integration` (Docker): 20 files, 139 tests pass.

`npm audit` was not re-run, because no dependency changed. GitHub CI on the final head is reported on the PR.

## Follow-ups

- A human approves #57 and adds `qa-approved` (it is `risk-high`). Then `om-approve-merge-pr 57`.
- After the merge, move the spec to `.ai/specs/implemented/`.
