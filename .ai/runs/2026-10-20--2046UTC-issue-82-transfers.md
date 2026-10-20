# Issue #82 (E07-S03): transfers between two locations, with transit and write-offs

**Date:** 2026-10-20 20:46 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 82`
**Spec:** `.ai/specs/implemented/2026-10-20--2046UTC-transfers.md`
**Status:** done

## Goal
Single-material transfers between two locations with planned dates: partial dispatches into transit, partial receipts out of it, reasoned write-offs, all atomic, in the ledger, the audit, the UI and the API (issue #82).

## Log
- 20:46 Feature route (label `feature`). FR triage: no transfer code in `packages/`, no PR references #82, `SDLC.md` has no Definition of Ready section, no spec covers transfers. Dependency #80 (E07-S01) is closed. Claimed the issue (assignee, `in-progress`, claim comment).
- 20:46 No spec existed: written on this branch, with the implementation on one PR (the cezar task owns one branch), as for #86 and #87.
- Plan (spec Implementation Plan): db entities + migration → core rules/schema/service/guards → app routes/actions/pages/components → integration tests and docs → gate.
- 20:53 db: `Transfer`, `TransferPosting` (update-abort trigger), migration `Migration20261020205226_transfers`; migration counts bumped in db/core/smoke tests.
- 21:00 core: `domain/transfers/transfer-quantity.ts`, `validators/transfers/transfer.schema.ts`, `services/transfers/transfer-usage.ts` (location/material guards, transit per pair), `TransferService`. The rollback tests (AUD-019/020) first spied on `em.create`/`em.flush`, which MikroORM's transaction fork never calls (known lesson); they now crash the posting through a mocked `recordTenantAudit` after the physical leg is flushed. Core + db at 100% coverage.

- 21:10 app: five route files, two pages with actions, `components/transfers/` (create form, posting and dates dialogs, ledger), transit on the stock page, sidebar entry, EN/PL strings and help. Coverage 100%.
- 21:30 Integration (Docker image): first run 5 failures, none in the product. `navigation.test.ts` keeps its own entry lists (now with Transfers). Zod skips an object refinement once a field fails, so the arrival check and the refused `quantity` needed separate requests. "Transfer dispatch" sits in a collapsed `<details>`, which `wait --text` doesn't see. Fixed the tests; re-run green.
- 21:45 Independent review (subagent): no blockers, four minor issues, all fixed. (1) A date edit on a Completed transfer now answers `TRANSFER_NOT_OPEN` before the version check, so the refused dialog isn't refreshed away. (2) The down migration drops the postings before the transfers. (3) The spec's page size now matches the code (100). (4) The stock page links each transfer holding transit (`transitTransfers`).

## Changes
- db: `Transfer`, `TransferPosting`, migration `Migration20261020205226_transfers` (+ snapshot, index), entity and migration tests; migration counts in db/core/smoke tests.
- core: `domain/transfers/transfer-quantity.ts`, `validators/transfers/transfer.schema.ts`, `services/transfers/{transfer.service,transfer-usage}.ts`, the location/material deactivation and base-unit guards, `StockView` transit (`inTransitFrom`, `inTransitTo`, `transitTransfers`), `stockCorrectionSchema` refuses `transfer`, DI registration.
- app: `/api/tenants/{tenant}/transfers…` (GET/POST, GET/PATCH, dispatches, receipts, write-offs), `/admin/[tenant]/transfers` and `/[id]`, `components/transfers/`, the stock screen, the sidebar, EN/PL, help topics `transfers` and `transfer`.
- Integration: `transfers-api.test.ts` (13), `transfers.test.ts` (4); `navigation.test.ts` lists.
- Docs: `BACKWARD_COMPATIBILITY.md` §4, engineering standards §5, the lesson on `em` spies extended, spec moved to `implemented/`.

## Verification
- `npm run lint`: 0 errors (the warning in `bom.service.ts` predates this run).
- `npm run typecheck`: clean.
- `npm run test:coverage`: 380 files, 2484 tests passed, 100% on all four metrics.
- `npm run build`: succeeded.
- `npm run test:integration` on the Docker production image: `transfers-api`, `transfers`, `stock`, `smoke` (25 tests) and `navigation` (in the run before) all passed. The full suite is left to CI.
- `npm audit`: not run, because no dependencies changed.

## Follow-ups
- Close Early and Cancel (E11-S01). Until then, a transfer with a write-off stays Open.
- Reversals of transfer postings (E11-S03). MRP's view of transfers (slice 3).
- Acceptance catalogue statuses for TRF-*, which the epic E07 closure updates.
