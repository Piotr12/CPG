# E17-S04: MRP-020 through the API, MRP-029 against a dependable receipt (#379)

**Date:** 2026-11-05 10:52 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` through cezar
**Spec:** none (the issue is the scope; rows in `.ai/specs/research/CPG-acceptance.md`)
**Status:** done

## Goal

Close the two multilevel acceptance gaps #292's closing pass left open, with tests only:

- MRP-020: −30 and a shortage of 30 on C's day, and one proposal of 30, read through the latest run's API (and the MRP page's day table);
- MRP-029: the two parents' 70 R netted once against 50 on hand **and** a purchase-order receipt;
- no test title names MRP-031 without asserting its recommendation;
- MRP-020 and MRP-029 move to Passed (automated).

## Plan

1. `packages/core/src/domain/mrp/plan-mrp.test.ts`: add a purchase-order line of 15 R before the need day to the MRP-029 case; assert one shortfall of 5 and one requisition of 5. Rename "BOM-006, MRP-031" to "BOM-006".
2. `tests/integration/mrp-run-api.test.ts`: a new MRP-020 test. 100 C at its own site, an open production order of X pinning 80 C (10 × 8) on its start, a customer order for Q whose Make proposal needs 50 C (10 × 5) two days later. Assert C's buckets and proposal through `GET …/mrp/runs/latest`, then the day's figures on the MRP page.
3. Drop MRP-031 from two more titles that assert only provisional actions: `mrp-run-api.test.ts` ("lists F's and I's provisional plan…") and `mrp-run.service.test.ts` ("MRP-027, MRP-031, MRP-047"). Update the acceptance rows that cite the old titles (BOM-006, MRP-027).
4. Acceptance doc: MRP-020 and MRP-029 to Passed (automated), counts in the header (516 → 518, 19 → 17).
5. Gate: lint, typecheck, test:coverage, build; `npm run test:integration -- tests/integration/mrp-run-api.test.ts`.

## Log

- 10:52 Triage: the issue is open, unclaimed, no PR or commit fixes it (#383 only filed it). Claimed (assignee, `in-progress`, claim comment). Branch `fix/issue-379-mrp-020-mrp-029-netting-tests` off `origin/main` 22ee5703, `npm ci` in the worktree.
- Decision: the issue names only the engine title, but its acceptance criterion is "no test title names MRP-031 without asserting it", and two more tests (service and API) name MRP-031 while asserting only provisional actions. They are renamed too.

- 10:58 Engine MRP-029 case: a first "one shortfall" check listed every day from day 4, because `shortage` is the projection before proposals. Now asserts the first short day and that no day's `projectedAfter` is negative (lesson added).
- 10:58 Scratch print of the MRP-020 engine case: Q is provisional (`no-feasible-bom`, 20 C available, 30 short) and C's requisition is 30. The API test asserts both.
- Deviation: the issue scopes MRP-029 to the engine. The catalogue's header says a planning figure passes on the engine, the stored run and the API, so an API test of MRP-029 was added as well. The MRP page has no proposed-receipts column, so the page check reads the balance, shortage and dependent demand only.
- 11:00 Docker isn't running on this machine, so the integration file ran against a local standalone server (lesson 2026-10-23).

## Changes

- `packages/core/src/domain/mrp/plan-mrp.test.ts`: MRP-029 with a purchase order of 15; "BOM-006, MRP-031" renamed "BOM-006".
- `packages/core/src/services/mrp/mrp-run.service.test.ts`: "MRP-027, MRP-031, MRP-047" renamed "MRP-027, MRP-047".
- `tests/integration/mrp-run-api.test.ts`: new MRP-020 test (API and MRP page) and MRP-029 test (API); MRP-031 dropped from the provisional-chain title.
- `.ai/specs/research/CPG-acceptance.md`: MRP-020 and MRP-029 to Passed (automated), BOM-006 and MRP-027 cite the new titles, header updated (518 Passed, 17 Partially verified).
- `.ai/lessons.md`: the `shortage` lesson.

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0, 678 files, 5,667 tests passed, 100% statements, branches, functions and lines.
- `npm run build`: exit 0.
- `npm run test:integration -- tests/integration/mrp-run-api.test.ts` against a fresh standalone server (`CPG_BASE_URL`): 18 of 18 passed, the two new tests included. The Docker image path is left to CI.

## Follow-ups

- None. The 17 rows still Partially verified are tracked by #378, #380, #381 and #382.
