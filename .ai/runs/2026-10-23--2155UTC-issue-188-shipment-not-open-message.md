# Issue #188: goods-issue dialog says "completed" for a cancelled shipment; E08 test titles; INV-007

**Date:** 2026-10-23 21:55 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue 188`, cezar task 7bded8bb)
**Spec:** none (issue #188, E08-S06)
**Status:** done

## Goal

Fix #188: (1) the goods-issue dialog's `SHIPMENT_NOT_OPEN` text no longer calls every refused shipment "completed", in EN and PL; (2) no E08 test title cites a scenario its assertions don't cover; (3) a goods issue that empties a position is asserted at 0.000000 in unit and integration tests, and INV-007 becomes Passed (automated).

## Log

- 21:55 Triage (`om-verify-in-repo`): open, unassigned, no lock. The only PR mentioning #188 is #193, the docs PR that filed it. No commit on `main` references it. Defect confirmed: `en.ts:1423` / `pl.ts:1384` hard-code "completed", while `assertShipmentOpen` (`shipment-records.ts:55`) refuses Completed and Cancelled shipments alike with one code.
- Root cause (`om-root-cause`): the goods-issue dialog translates `SHIPMENT_NOT_OPEN` by code alone (`issuesLabels` merges `goodsIssues.errors` over the shared errors), and the text was written before #147 added `cancelled`. Fix: a status-neutral text, in the same wording as the shipments dialog's "isn't Open any more". A status parameter would add `params` to a core error for no gain, so I didn't add one.
- Test titles: besides the eight the issue lists, the same scan found four more E08 titles with the same problem: `orders-content.test.tsx` (SAL-006, mocked shipments), `goods-issues/route.test.ts` (INV-011, mocked service), and `issue-quantity.test.ts` (SAL-012 and SAL-013 on pure helpers that don't refuse or complete anything). All twelve get retitled; R07 stays on the route tests because they assert the token's actor. `seed-demo-data.test.ts` (SAL-006…009) belongs to the dataset epic, not E08, so it is left alone.

- 22:10 Claimed #188 (assignee, `in-progress`, claim comment). Edits made. Targeted tests green. With the old EN/PL text put back, the new dialog test and the PL label assertion both fail, so they guard the fix.
- 00:20 Fresh-context review (subagent, `om-code-review` checklist) found no blocker and three more over-claiming E08 titles: forecasts `route.test.ts` (DEM-001 on a mocked service → R07), forecasts `actions.test.ts` (TEN-030 on a mocked rejection) and the shipment page's not-found test (TEN-014 on mocked lookups). It also noted INV-020 belongs on the forecasts-api test that asserts `LOCATION_INACTIVE`, which the catalogue cites. All four were applied.
- 00:02 Full gate green. Docker isn't available on this machine, so the touched integration files ran against a standalone build (fresh copy, fresh `DATA_DIR`, lessons 2026-10-19/20).

## Changes

- `packages/app/src/i18n/messages/{en,pl}.ts`: the goods-issue `SHIPMENT_NOT_OPEN` now reads "This shipment isn't Open any more, so nothing more is issued against it." / "Ta wysyłka nie jest już otwarta, więc nic więcej w jej ramach nie wydajesz."
- `components/goods-issues/issue-dialog.test.tsx`: a refusal of a shipment cancelled meanwhile shows the neutral text and no "completed". `labels.test.ts`: the PL text for the same code.
- Retitled 15 test titles (12 in the first commit, 3 after review) and moved INV-020 onto the forecasts-api test that asserts it. The first 12 are the 8 the issue lists, plus `orders-content.test.tsx` SAL-006, `goods-issues/route.test.ts` INV-011, and `issue-quantity.test.ts` SAL-012/SAL-013. No catalogue row cites any of these files.
- INV-007: `goods-issue.service.test.ts` (10 from 10 leaves 0.000000; movement balance 10 → 0) and `tests/integration/shipments-api.test.ts` (API issue of 10 from 10, stock reads 0.000000). The catalogue row is now Passed (automated).

## Verification

- `npm run lint`: exit 0 (0 errors; 1 warning that already existed in `bom.service.ts`, not touched here).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0. 496 files, 3,547 tests, "No files with missing coverage".
- `npm run build`: exit 0.
- `CPG_BASE_URL=… npm run test:integration -- tests/integration/shipments-api.test.ts tests/integration/forecasts-api.test.ts` on a standalone server: 2 files, 23 tests passed.
- Regression check: with the old messages restored, 2 tests fail (`issue-dialog.test.tsx` #188 and `labels.test.ts`).

## Follow-ups

- `services/demo/seed-demo-data.test.ts` cites SAL-006…009 and INV-012 in a seed test. That is outside E08's scope and was left as is.
- Merging #193 (which also edits `CPG-acceptance.md`) may need a trivial rebase of the INV-007 row.
