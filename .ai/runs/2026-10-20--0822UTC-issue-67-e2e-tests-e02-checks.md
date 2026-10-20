# End-to-end tests for E02's unit-only and one-directional checks (#67)

**Date:** 2026-10-20 08:22 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue 67`, cezar headless)
**Spec:** none (issue #67 is the scope; follow-up of epic E02 #10, PR #66)
**Status:** in progress

## Goal

Add the end-to-end tests issue #67 lists for E02 (isolation, audit, API contract, read-only), and update their **Evidence** lines in `.ai/specs/research/CPG-acceptance.md`. Test-only: no product code changes; a failing test is filed as a bug, not fixed here.

## Plan

1. New `tests/integration/tenant-isolation-api.test.ts` (prefix `isoapi`, admin token `isoapi-ops`):
   - Test → Prod through the API: a material and a location created in Test are absent from Prod.
   - TEN-012: `00000001` in both tenants (created in Prod when missing) with different descriptions, each read through the API and on its material page.
   - API-013: tenant-less paths (`/api/materials`, `/api/locations`, …) answer 404.
   - API-024: one `Idempotency-Key` sent to Test, then to Prod with another body: two writes, neither replayed.
   - API-034: a `Dataset-Generation` other than the current one answers 409 `GENERATION_STALE`, nothing created.
   - AUD-007: a material and a location changed with the token show channel API and the token's name (never the secret) in the Prod audit, through the API and on the screen.
2. `tests/integration/materials.test.ts`: Test → Prod through the UI; AUD-024 on a material page (two admin sessions, the second saves a stale edit); AUD-001 Session column in the tenant-audit assertions.
3. `tests/integration/named-records.test.ts`: AUD-024 on a location (two sessions); Session column in `auditOf`.
4. `tests/integration/navigation.test.ts`: TEN-010, the normal user switches Prod → Test at 1280 px.
5. `tests/integration/audit.test.ts`: AUD-009, the tenant audit shows the normal user no controls.
6. `tests/integration/read-only-api.test.ts`: while read-only, a location rename and deactivation, a material deactivation, a customer and a supplier create, a conversion add, change and remove are refused, nothing changed; AUD-016 true → false entry.
   `tests/integration/read-only.test.ts`: the writable-again entry on the Global audit screen.
7. Catalogue Evidence lines; full validation gate.

## Log

- 08:22 Classified as test-only (`refactor` label; neither a defect nor a new capability), as #52 was. The triage gate checked the gaps still exist: the catalogue's Evidence lines name unit tests or one direction only for each listed scenario, and no PR or `main` commit references #67. Claimed #67 (assignee, `in-progress`, claim comment). Branch `fix/issue-67-e2e-tests-e02-checks` in the cezar worktree.

- 08:45 API-034: a generation of `0` isn't well-formed (`/^[1-9]…/`), so it answers 428 `GENERATION_REQUIRED`, not 409. The test sends `current + 1` and `current + 41` to Test and `prod + 1` to Prod.
- 08:50 AUD-009: the Test audit may be empty when the file runs first, which would make "no controls" vacuous. The admin now creates a Test location (`audit-ui depot`) first, and the normal user's check waits for that row.
- 08:55 Lint, typecheck, `test:coverage` (100%) and build green. Integration run 1: 181 of 182 passed. The new Session check in `named-records.test.ts` read a "—" session from another file's API-created **location** with the supplier's ID (each kind numbers on its own, and `auditOf` filtered by ID prefix only). Fixed in the test by filtering on the supplier's own label; the product is right (API entries have no session).

- 09:00 The same ID-prefix filter in `materials.test.ts` (Session check) could match another kind's record: filtered by `${boltId} — ${BOLT}` too. Lesson recorded. Integration run 3, all files: 23 files, 182 tests passed.

## Changes

- `tests/integration/tenant-isolation-api.test.ts` (new): Test → Prod through the API, TEN-012 (API and screens), API-013, API-024, API-034, AUD-007 (API and screen).
- `tests/integration/materials.test.ts`: Test → Prod on the screens; AUD-024 on a material page (two admin sessions); Session column (AUD-001).
- `tests/integration/named-records.test.ts`: AUD-024 on a location (two admin sessions); account, channel and Session column on the supplier's audit rows (AUD-001).
- `tests/integration/navigation.test.ts`: TEN-010, a normal user switches Prod → Test and back at 1280 px.
- `tests/integration/audit.test.ts`: AUD-009, the Test audit's entries with no controls for a normal user.
- `tests/integration/read-only-api.test.ts`: refused location rename and deactivation, material deactivation, customer and supplier create, conversion add, change and remove, nothing changed; AUD-016 true → false.
- `tests/integration/read-only.test.ts`: AUD-016 writable-again entry on the Global audit screen.
- `.ai/specs/research/CPG-acceptance.md`: Evidence for TEN-010, TEN-012, TEN-016, TEN-017, API-013, API-024, API-034, AUD-001, AUD-007, AUD-009, AUD-016, AUD-024. Statuses unchanged: API-034 and AUD-001 stay Partially verified (the reset half and customer orders wait for slice 2), TEN-017 too (goods issue).
- `.ai/lessons.md`: audit subject IDs are per kind.

## Verification

- `npm run lint`: clean. `npm run typecheck`: clean.
- `npm run test:coverage`: 244 files, 1584 tests passed; 100% statements and branches (no product code changed).
- `npm run build`: succeeded.
- `npm run test:integration` (Docker image via Testcontainers): run 1, 181/182 (the test's own filter, fixed); run 3 on the final code, 23 files, 182 tests passed in 215 s.

## Follow-ups

- API-034's stale-after-reset half, AUD-001's customer order and TEN-017's goods issue wait for slice 2 (the Test reset, orders, stock).
