# 🔍 Code Review: customer orders (#102)

## Verdict
✅ approve for code — both roles can maintain tenant-local dated customer demand, with exact conversions, aggregate version checks and atomic audit. Formal GitHub approval must come from another reviewer: this automation is authenticated as the PR author.

## Summary
Reviewed the complete diff against the design in #101, CODE_REVIEW.md, engineering standards, product R02/R03/R05/R07/R08 and the compatibility policy. Independent passes found and verified fixes for replaced-material history, unbounded collection/grouping, the cross-order demand scan and its composite index. No unresolved findings remain. Fresh review of merge `8e0fa69` with main `da7d72f` approves both stock/order guards, structured error context, audit locales and migration adoption; 83 independent focused tests pass. The snapshot changes no existing main tables. Independent reset re-review: 35 focused tests PASS and no remaining findings. Final merge `09bbbce` also integrates atomic Test reset `d8d6093`: its shared seed registry and transaction include customer orders; regression tests verify replacement, rollback and Prod preservation.

## 🧪 Validation Gate

| Command | Status | Evidence or limitation |
|---|---|---|
| `npm run lint` | PASS | Full repository ESLint. |
| `npm run typecheck` | PASS | Root plus all four workspaces. |
| `npm run test:coverage` | PASS | 313 files / 2,083 tests; lines, statements, branches and functions all 100%. |
| `npm run build` | PASS | Next.js 16.4.2 production build, including tenant list/detail and collection/item API. |
| `npm run test:integration` | PASS | 30 files passed / 1 skipped; 233 tests passed / 1 Docker-only startup skip (fresh production standalone). |

## Contracts and risk evidence
Two additive migrations create the aggregate then index its bounded demand scan; up/down and an indexed SQLite EXPLAIN plan are tested. Existing public shapes remain; the new collection is an array in fixed 100-order pages. Location deactivation composes stock and customer-order guards through the existing hook; material history and outstanding demand checks reuse tenant-scoped persistence. API/actions consume the same schemas and service, retain shared HTTP 200/envelopes, key/generation/read-only checks and audit scalar snapshots. Tests cover wrong-tenant reads, both roles, replay, conflicts, no-op/rollback, historical conversion and reference locks. The form retains its opening version across refreshes; no silent overwrite retry. Server shells and route-specific form islands remain, with no dependency added or global provider expansion.

Docker is unavailable for this macOS account. The final browser/API run uses a fresh production standalone copy with static/public assets and a disposable DATA_DIR; the Docker-only absent-admin-password startup test is skipped locally. Migration rollback, adoption on the existing main schema and empty-database startup are otherwise exercised. The browser click helper centers a target inside the longer sidebar before clicking; destination and active-entry assertions are unchanged. `npm run dev` was attempted and reproduced Next instant-shell hydration failure on unchanged Materials as well; production behaviour is the live verification source. Audit reports the same 10 known high braces advisories already documented by the repository; no dependencies changed.

The PR remains `review` + `needs-qa`: code evidence does not grant human review or risk-high QA approval.
