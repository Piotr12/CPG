# End-to-end tests for the partially verified E01 scenarios (#52)

**Date:** 2026-10-19 19:45 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue 52`, cezar headless)
**Spec:** none (issue #52 is the scope; follow-up of epic E01 #9, PR #51)
**Status:** done

## Goal

Add the end-to-end tests issue #52 lists (UX-003, UX-004, UX-007, R11/UX-010, TEN-005, TEN-006, TEN-008, API-002, API-010, API-032) and update their status and Evidence lines in `.ai/specs/research/CPG-acceptance.md`. Test-only: no product code changes.

## Plan

1. `tests/integration/preferences.test.ts` — UX-003: a second account (`pref-bea`) stays English while the admin is Polish, and both keep their choice after signing in again; drop the stale "#16" comment. UX-004/UX-007: the admin, in Polish and dark, switches `/admin/test` ↔ `/admin/prod` through the tenant strip and keeps both.
2. `tests/integration/footer.test.ts` — the exact footer on `/admin/users`, `/admin/tokens`, `/admin/audit`, `/admin/test`, `/admin/test/audit`.
3. New `tests/integration/api-users.test.ts` — real bearer tokens: TEN-005 (403 on the password route, own id included), API-010 (403 on `POST /api/users`, `PATCH /api/users/{id}`), TEN-008 (`DELETE /api/users/{id}` → 405), TEN-006 (admin's `PUT …/password` ends sessions and tokens; the new password works).
4. `tests/integration/api-tokens.test.ts` — `POST /api/tokens` → 405 with the admin's token (API-002, API-032).
5. Shared helpers instead of copies: `createUser` (copied in `api-tokens.test.ts` and `navigation.test.ts`), the `api()` caller (`api-idempotency.test.ts`) and `clickHydrated` (`tenants.test.ts`) move to helper modules.
6. Catalogue updates; full validation gate.

## Log

- 19:45 Classified as test-only (`refactor` label; neither a defect nor a new capability). The bug chain's "is it a real defect?" gate does not apply, so the triage gate checked instead that the gaps still exist: the catalogue lists the scenarios as Partially verified / unit-only, the stale comment is still at `preferences.test.ts:26-27`, and no PR or `main` commit references #52. Proceeded with the bug-chain mechanics (claim → implement → PR → review).
- 19:50 Claimed #52 (assignee, `in-progress`, claim comment). Branch `fix/issue-52-e2e-tests-e01-partial-scenarios` in the cezar worktree.
- 20:05 Shared helpers instead of a third copy: `createUser` → `tests/integration/users.ts` (was copied in `api-tokens.test.ts` and `navigation.test.ts`), the API caller → `tests/integration/api.ts` (from `api-idempotency.test.ts`), `clickHydrated` → `tests/integration/browser.ts` (from `tenants.test.ts`; lesson pointer updated).
- 20:10 UX-003 runs in one browser: admin → `pref-bea` → admin → `pref-bea`, so the account decides and not a cookie left from the previous one. UX-004 switches tenants from the strip and waits for the strip's sentence in Polish, which streams in the reader's language.
- 20:10 UX-004 marked Passed: the language half is end to end; "business data still isolated" rests on the tenant-isolation tests, as no business data exists yet. UX-010 and API-010 stay Partially verified (the MRP report and master data don't exist yet); their Evidence lines list the new tests.
- 20:45 Opened PR #53 (labels: refactor, skip-qa, priority-low, risk-low); lock handed from the issue to the PR. CI green on `1c6e2a6`.
- 21:00 Review (separate agent): changes requested, 1 major, 3 minor, 3 nits. Major: the tenant switch couldn't catch a lost theme, because a soft navigation keeps the root layout, whose effect (`DocumentPreferences`) alone sets `<html lang>`/`dark`. Fixed by loading Prod afresh without the `cpg_theme` cookie and asserting the account brings back Polish and dark (and rewrites `cpg_theme=dark`). Also fixed: guarded `afterAll` with an asserted revoke, a hydration-aware `signInAs`/`signedInAndHydrated` in `sign-in.ts`, the shown `h1` in `documentState`, a real allowed write (`theme: dark`) for API-010, and catalogue wording (statuses hold once merged). Declined nit 7 (helper naming follows `sign-in.ts`/`tokens.ts`; `audit.test.ts` walks the create flow on purpose).
- 21:15 Integration suite re-run after the fixes: 14 files, 91 tests passed.

## Changes

- `tests/integration/api-users.test.ts` (new): TEN-005, API-010, TEN-008, TEN-006 with real bearer tokens.
- `tests/integration/preferences.test.ts`: UX-003 (two accounts), UX-004/UX-007 (tenant switch); stale "#16" comment removed.
- `tests/integration/footer.test.ts`: `/admin/users`, `/admin/tokens`, `/admin/audit`, `/admin/test`, `/admin/test/audit`.
- `tests/integration/api-tokens.test.ts`: `POST /api/tokens` → 405 with the admin's token.
- Helpers: `tests/integration/api.ts`, `tests/integration/users.ts` (new), `clickHydrated` in `browser.ts`; callers in `api-idempotency`, `navigation`, `tenants` tests.
- `.ai/specs/research/CPG-acceptance.md`: statuses/Evidence for UX-003, UX-004, UX-007 (→ Passed), UX-010, API-010 (still partial), TEN-005, TEN-006, TEN-008, API-002, API-032.
- `.ai/lessons.md`: `clickHydrated` pointer.

## Verification

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run test:coverage` — 146 files, 888 tests passed, thresholds met (no product code changed).
- `npm run build` — succeeded.
- `npm run test:integration` (Docker image via Testcontainers) — 14 files, 91 tests passed in 111 s.

## Follow-ups

- UX-010 and API-010 move to Passed once the MRP report and master data (#22) exist.
