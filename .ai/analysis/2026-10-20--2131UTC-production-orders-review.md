# Code review — production orders #88

## Verdict
Request changes for the publication/CI gate only. No unresolved source finding remains. CODE_REVIEW.md requires green PR CI before approval; shared publication is awaiting the user's Guard approval.

## Summary
Both roles can create one-output Make orders, choose/pin an immutable recipe and edit target/date. Exact requirement arithmetic, captured conversion/lead time, tenant isolation, keyed writes and master guards retain the existing protected contracts. The migration adds only the new table and indexes; production rollback keeps the additive schema.

## Findings
### Blocker
- Full PR CI is NOT RUN because the user Guard prohibits a shared push before approval. Publish the prepared spec/implementation PRs, run om-auto-review-pr and verify the full integration CI gate before marking the implementation complete.

The independent audit's draft-loss, unbounded recipe-history read and missing audit-label findings were fixed in aeeabfe. The final QA/review pass corrected blank page fallbacks in 8115321. Fresh re-reviews report no remaining source finding; they did not execute suites. The root agent executed the checks below.

## Validation gate
| Command | Result | Evidence |
|---|---|---|
| npm run lint | PASS | /tmp/cpg-88-lint.log; existing unused BOM import warning |
| npm run typecheck | PASS | /tmp/cpg-88-typecheck.log |
| npm run test:coverage | PASS | 372 files, 2,431 tests; all four metrics 100%; /tmp/cpg-88-coverage.log |
| npm run build | PASS | /tmp/cpg-88-build.log; new pages and API routes compiled |
| Focused production-image integrations | PASS | 4 files / 29 tests; /tmp/cpg-88-integration-final.log |
| Full PR CI | NOT RUN | Awaiting publication approval; full suite intentionally reserved for CI |

## Coverage and compatibility
Real SQLite tests cover additive migration up/down and adoption, rollback/no partial writes, pinned history, stale versions, default/explicit recipes, decimal/date boundaries and bounded reads. Browser/API integration covers normal-user access, wrong-tenant references, read-only writes, idempotent retry, Test generation/reset and no stock mutation. Shared form error and GET-envelope consumers have regression coverage. UI evidence is in .ai/qa/artifacts_production-orders-88/report.md. No dependencies, coverage exclusions or thresholds changed. npm audit reports the ten known advisories documented in engineering standards.

## Development limitation
A clean dev server reproduces Next’s URL-data Insight on both production-order routes and the unchanged customer-order detail route present at 8685bdf. The new routes already use the documented Suspense-child pattern. Reordering reads did not resolve it and was reverted. This shared development prefetch diagnostic is a separate follow-up; no validation configuration was disabled. Production browser checks and the build pass. Diagnostic log: /tmp/cpg-88-dev-final.log.
