# 🔍 Code Review: customer orders (#102)

## Verdict
✅ approve for code — both roles can maintain tenant-local dated customer demand, with exact conversions, aggregate version checks and atomic audit. Formal GitHub approval must come from another reviewer: this automation is authenticated as the PR author.

## Summary
Reviewed the complete diff against the design in #101, CODE_REVIEW.md, engineering standards, product R02/R03/R05/R07/R08 and the compatibility policy. Independent passes found and verified fixes for replaced-material history, unbounded collection/grouping, the cross-order demand scan and its composite index. No unresolved findings remain. Fresh review of merge8e0fa69 with main da7d72f approves both stock/order guards, structured error context, audit locales and migration adoption;83 independent focused tests pass. The snapshot changes no existing main tables.

## 🧪 Validation Gate

| Command | Status | Evidence or limitation |
|---|---|---|
| `npm run lint` | PASS | Full repository ESLint. |
| `npm run typecheck` | PASS | Root plus all four workspaces. |
| `npm run test:coverage` | PASS | 306 files / 2,051 tests; lines, statements, branches and functions all 100%. |
| `npm run build` | PASS | Next.js 16.4.2 production build, including tenant list/detail and collection/item API. |
| `npm run test:integration` | PASS | 27 files passed / 1 skipped; 221 tests passed / 1 Docker-only startup skip,236.14seconds. |

## Contracts and risk evidence
Two additive migrations create the aggregate then index its bounded demand scan; up/down and an indexed SQLite EXPLAIN plan are tested. Existing public shapes remain; the new collection is an array in fixed 100-order pages. Location deactivation composes stock and customer-order guards through the existing hook; material history and outstanding demand checks reuse tenant-scoped persistence. API/actions consume the same schemas and service, retain shared HTTP 200/envelopes, key/generation/read-only checks and audit scalar snapshots. Tests cover wrong-tenant reads, both roles, replay, conflicts, no-op/rollback, historical conversion and reference locks. The form retains its opening version across refreshes; no silent overwrite retry. Server shells and route-specific form islands remain, with no dependency added or global provider expansion.

Docker is unavailable for this macOS account. The final browser/API run uses a fresh production standalone copy with static/public assets and a disposable DATA_DIR; the Docker-only absent-admin-password startup test is skipped locally. Migration rollback and empty-database startup are otherwise exercised. `npm run dev` was attempted and reproduced Next instant-shell hydration failure on unchanged Materials as well; production behaviour is the live verification source. Audit reports the same 10 known high braces advisories already documented by the repository; no dependencies changed.

The PR remains `review` + `needs-qa`: code evidence does not grant human review or risk-high QA approval.
