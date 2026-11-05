# Automatic runs and reruns tested over six scenarios (#381)

**Date:** 2026-11-05 10:50 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue`)
**Spec:** none (issue #381, E19-S04; catalogue rows in `.ai/specs/research/CPG-acceptance.md`)
**Status:** done

## Goal

Add the tests #381 lists, so TEN-019, DEM-024, RUN-013, RUN-015, LFC-027 and MRP-051 can move to Passed (automated). Tests only: a test that exposes a defect gets a bug filed, not a fix here.

## Plan

- TEN-019 → `mrp-run-gate.test.ts`: executable Buy and Make needs in a read-only Prod, with a requisition and a production order already there; the page's and the API's automatic run are refused, and both tables read exactly as before.
- DEM-024 → `mrp-run.service.test.ts`: forecast 100, line 60 → run 1 stores 40 forecast; line edited to 80 → run 2 stores 20 and firm 80; line cancelled → run 3 stores 100 and firm 0; earlier runs' rows gone.
- RUN-013 → `mrp-batch.service.test.ts`: automatic counterpart of the manual test in `mrp-acceptance.service.test.ts` (Open PO line of 40, production order of 100, new demand of 70 and 130 earlier).
- RUN-015 → `mrp-batch.service.test.ts`: failed batch (inactive Buy candidate) beside a Make pair with no BOM; `MISSING_BOM` still stored and listed.
- LFC-027, MRP-051 → `mrp-batch.service.test.ts`: automatic run with the at-risk F order creates no F order and no R requisition and leaves the order unchanged; after cancelling it, an automatic rerun creates F through the priority-2 BOM.
- Then the six catalogue rows → Passed (automated), counts in the header updated.

## Log

- 10:50 — Issue read; classified as tests-only (`refactor`), run on the bug chain's fix branch `fix/issue-381-automatic-rerun-tests` off `origin/main` (`22ee5703`). No claim conflict. Triage (`om-verify-in-repo`) and root cause (`om-root-cause`) folded into this log: the gaps are exactly the "Missing" clauses of the six Evidence lines on `main`, and no product code changes.
- 10:52 — Claimed #381 (assignee, `in-progress`, claim comment).
- 10:55 — All six tests pass on first run; no defect found, so no bug to file. The at-risk test keeps a usable priority-2 BOM in the first run, so "no replacement" can't be explained by F having no usable BOM.
- 10:55 — TEN-019's first draft deleted its documents at the end of the test, so a failing assertion leaked them into RUN-024's test. Moved the deletes into the file's `afterEach` (and dropped RUN-024's own delete).
- 10:56 — Mutation checks: with `assertWritable`'s read-only refusal disabled, TEN-019 fails; with at-risk supply left out of `sizing-balance.ts`, the LFC-027 batch test fails (`documents: 1`). Both sources restored (`git diff` clean).
- 11:01 — Gate green; committed and opened the PR.

## Changes

- `packages/core/src/services/mrp/mrp-run-gate.test.ts`: TEN-019 test, `needsWithDocuments` / `prodDocuments` helpers, documents cleared in `afterEach`.
- `packages/core/src/services/mrp/mrp-run.service.test.ts`: DEM-024 test.
- `packages/core/src/services/mrp/mrp-batch.service.test.ts`: RUN-013, RUN-015 (exceptions kept), LFC-027/MRP-051 automatic tests.
- `.ai/specs/research/CPG-acceptance.md`: the six rows → Passed (automated) with their evidence; header now 522 Passed (automated), 13 Partially verified.

## Verification

- `npm run lint`, `npm run typecheck`: pass.
- `npm run test:coverage`: 678 files, 5,672 passed (2 skipped), 100% lines/branches/functions/statements.
- `npm run build`: pass.
- Mutation checks (above) for TEN-019 and LFC-027/MRP-051.
- No integration test run: no page, route, API or migration changes; the new tests are unit tests over the real services and SQLite.

## Follow-ups

- None. No test exposed a defect, so no bug was filed.
