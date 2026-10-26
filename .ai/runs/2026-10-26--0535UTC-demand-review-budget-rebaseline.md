# Demand review budget: re-baseline at ten times the single-site realistic dataset (#262)

**Date:** 2026-10-26 05:35 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, om-auto-fix-issue)
**Spec:** `.ai/specs/implemented/2026-10-25--0913UTC-demand-review.md` (Performance, Implementation notes)
**Status:** done

## Goal

#262 asks the owner to choose: restate the 300 ms budget for #237's dataset and re-baseline the benchmark at 10× its volumes (optimising the month read if needed), or keep #240's absolute volumes as the contract and record that in the spec.

## Log

- 05:30 Classified: neither a bug nor a feature. It's a decision the issue leaves to the owner, so the bug chain's triage gate doesn't apply. Nothing claimed.
- 05:34 Profiled the month read at 10× #237's volumes (82,770 issue lines, 78,170 order lines, 31,320 daily forecasts, 10 products, 2 locations) using a throwaway copy of `demand-review-reads.test.ts`. The copy was deleted afterwards.
  - Fastest of three reads: day 410 ms, week 740 ms, month 1,247 ms. This matches the issue.
  - Month split by `em.find`: StockMovement 54,990 rows in about 400 ms, CustomerOrderLine 55,589 rows in about 725 ms, Forecast 4,240 rows in about 32 ms, reversals 12 ms.
  - The same SQL run through `execute`: movements 28 ms, order lines 68 ms. Every query starts from its #240 index. **About 90% of the month read is MikroORM hydrating about 110k partial entities, not SQLite.**
  - So getting under 300 ms at that size means reading plain or pre-aggregated rows. ESLint bans the QueryBuilder and raw SQL in `core` (tenant isolation), so that needs a new tenant-scoped read exported from `@cpg/db`. That's a new persistence surface for the owner to approve.
- 05:40 Put the three options to the owner and recommended keeping #240's volumes. The owner then told the run to continue autonomously without asking, so I went with the recommended option. The others either accept a slower read or add a persistence surface without approval.
  - **Decision:** #240's absolute volumes (10,530 / 9,880 / 1,200) are the budget's contract.
  - It's recorded in the demand review spec's Implementation notes, together with the 10× #237 figures and the path to take if real volumes grow.
  - The owner can still overturn it on the PR.

## Changes

- `.ai/specs/implemented/2026-10-25--0913UTC-demand-review.md`: new implementation note, "The budget's volumes are absolute (#262)".
- `packages/core/src/services/reports/demand-review-reads.test.ts`: the header comment, the describe name and the printed label now say these are #240's volumes and the contract. Seeds and assertions are unchanged.
- `.ai/docs/engineering-standards.md`: the demand review entry names #240's absolute volumes.
- `.ai/lessons.md`: the 2026-10-25 hydration lesson now says to state budgets in absolute rows and gives the hydration cost per row.

## Verification

- `npx vitest run packages/core/src/services/reports/demand-review-reads.test.ts`: 6 passed. Day 49 ms, week 86 ms, month 147 ms. All inside 300 ms at the contract volumes.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm run test:coverage`: 594 files, 4,580 tests passed, thresholds met (exit 0).
- `npm run build`: exit 0.
- No integration tests: no page, route or migration changed.

## Follow-ups

- If real volumes approach the benchmark's, add a tenant-scoped plain or aggregated read in `@cpg/db`, restate the budget and re-baseline. That needs the owner's approval for the new persistence surface.
