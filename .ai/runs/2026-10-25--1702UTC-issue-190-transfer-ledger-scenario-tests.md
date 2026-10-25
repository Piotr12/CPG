# Issue #190: prove TRF-012, E2E-009, MAT-024, LFC-012 and STX-011 by tests

**Date:** 2026-10-25 17:02 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue 190`, dispatched by cezar)
**Spec:** none (the acceptance catalogue `.ai/specs/research/CPG-acceptance.md` holds the rows)
**Status:** done

## Goal

Issue #190 (E07-S05) is tests only: each of the five catalogue rows gets a test that asserts its whole Then, and the catalogue says so. Posting behaviour is out of scope; a defect a test exposes is filed as a bug.

## Plan

| Row | Gap | Test |
| --- | --- | --- |
| TRF-012 | Nothing refuses Close Early at 60 dispatched / 50 received / 10 in transit | Unit: `transfer.service.test.ts`, a 60/50/10 refusal naming 10 kg. UI: `document-lifecycle.test.ts`'s transfer test becomes a 60 kg plan, dispatch 60, receive 50, and the dialog refuses with 10 kg in transit |
| E2E-009 | No 60-plan, 55/5 run; destination balance and audit link unasserted end to end | The same lifecycle test continues: receive 5 more (55), write off 5, Close Early in the UI; A 40, B 55, transit 0, Closed Early; the write-off audit entry names the write-off posting, which the transfer's postings list. Unit: a 60/55/5 service test with the same assertions |
| MAT-024 | 0.123456 never posted through the ledger | Unit: `stock.service.test.ts` posts 0.123456 twice and −0.123455, reads movements, balance, audit and the stored text. API: `stock.test.ts` posts ±0.123456 |
| LFC-012 | The integration test checks only the code | `stock.test.ts`: 409 and `params` (material, location, 24.000000 each) for material and location deactivation |
| STX-011 | No UI test | `stock-import.test.ts`: an unknown material's dry run shows the row's problem with its advice, offers no commit, and changes no stock |

Verification: lint, typecheck, test:coverage, build, and the touched integration files against a local standalone server.

Deviation from the plan: E2E-009's API half lives in `document-lifecycle.test.ts` with TRF-012 (one 60 kg transfer covers both: 50 received refuses, 5 more and a 5 kg write-off close it), so `transfers-api.test.ts` is untouched. LFC-012 also got the material's Deactivate dialog, the "Both" channel's screen half.

## Log

- 17:02 Triage: #190 open, unassigned; only #193 (which filed it) mentions it; no commit on `main` addresses it. Claimed (assignee, `in-progress`, claim comment). Branch `fix/issue-190-transfer-ledger-scenario-tests` off `main` at `79ecf0b6`.

- 17:05 Unit tests written; my first floating-point example for MAT-024 (0.246912 − 0.123455) is exact in binary too, so the test uses 0.370368 − 0.2 (0.17036799999999996 in floats), checked with `node -e`.
- 17:20 Gate green; integration files green on a standalone server (Docker unavailable on this machine). Catalogue rows updated, plus TRF-025's evidence, which cited the replaced 10/8/2 lifecycle test.
- 18:14 Review (`om-auto-review-pr --autofix`): the TRF-012 unit test checked only that no closed-early entry was written, while the catalogue says the audit doesn't change; it now also counts every audit entry before and after the refusal. Lint, typecheck and the transfer test file pass.

## Changes

- `packages/core/src/services/transfers/transfer.service.test.ts`: TRF-012 (60/50/10 refusal) and E2E-009 (60/55/5 to Closed Early, write-off posting and audit link).
- `packages/core/src/services/stock/stock.service.test.ts`: MAT-024 through the ledger, with the stored SQLite type.
- `tests/integration/document-lifecycle.test.ts`: the transfer test is now TRF-012 + E2E-009 (60 kg plan).
- `tests/integration/stock.test.ts`: MAT-024 through the API; LFC-012's 409, `params`, message and Deactivate dialog.
- `tests/integration/stock-import.test.ts`: STX-011 on the Stock import screen.
- `.ai/specs/research/CPG-acceptance.md`: TRF-012, E2E-009, MAT-024 → Passed (automated); LFC-012, STX-011, TRF-025 evidence.

## Verification

- `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run build` → exit 0.
- `npm run test:coverage` → exit 0, 588 files, 4518 tests, thresholds met.
- `CPG_BASE_URL=http://127.0.0.1:3190 npm run test:integration -- tests/integration/stock.test.ts tests/integration/stock-import.test.ts tests/integration/document-lifecycle.test.ts` against a fresh standalone copy and `DATA_DIR` → 3 files, 22 tests passed. The full suite runs in CI.

## Follow-ups

None: every row the issue lists now carries a test asserting its Then.
