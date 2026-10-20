# Stock ledger and corrections — issue #80

**Date:** 2026-10-20 16:34 UTC
**Agent:** Codex
**Spec:** .ai/specs/2026-10-20--1634UTC-stock-ledger-corrections.md
**Status:** done

## Goal
Implement E07-S01: tenant physical stock balances, a signed ledger and reasoned manual corrections in the UI/API, including stock-dependent master guards and demo balances.

## Log
- 16:34 UTC — Read issue #80, pipeline config, lessons and engineering standards. No claim or open linked PR. Feature route confirmed: stock posting capability absent; no covering stock spec. Ticket defines problem, users, checks and exclusions; no blocking product question.
- 16:34 UTC — Reusing cezar's isolated worktree and branch. Broad read-only baseline investigation delegated; implementation remains one cohesive task. Design precedes source changes.

- 16:37 UTC — Found and independently verified conflicting correction semantics in the functional baseline: issue #80 / INV-006 request signed changes; decision register §03 p6 requires target physical balances. Conceptual model p6 supports signed manual input. AGENTS.md conflict gate prevents choosing silently; draft skeleton records a concrete current-2/input-5 example and recommends signed input, pending owner decision.
- 16:37 UTC — npm ci completed; known audit summary remains 10 high advisories, consistent with engineering standards. No dependency manifest/lockfile or product-source changes. Shared QA descriptor absent; no UI work or captures attempted.

- 16:38 UTC — User explicitly delegated reasonable assumptions and autonomous completion. Signed manual input chosen per #80 and INV-006; this replaces the earlier clarification gate. Design records the discrepancy and authorizes only the current manual path, leaving XLS absolute.

## Changes
- Draft spec skeleton with the blocking source conflict and both alternatives; no implementation or PR yet.

## Verification
- Read-only tracker and source checks confirm an unbuilt feature; source excerpts verified with pdftotext.
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts` — 2 files / 6 tests passed.
- Full runtime gate not run: implementation is gated on Q1 and no runtime code changed.
- Read back issue #80: `in-progress` removed; author Piotr12 retains assignee handback.

## Implementation findings for resume
- Leaf helpers: `services/materials/base-quantity.ts` converts a positive magnitude and retains entered quantity/unit/numerator/denominator. `decimal.ts` accepts/formats only nonnegative values; signed parsing and negative fractional formatting need tested handling. Bound resulting balances by MAX_QUANTITY as well as individual movements.
- Request wrappers already enforce fresh generation/read-only and retry one SQLite stale snapshot. Atomic group postings must use scoped em; an outer transaction uses `inRequestTransaction`, never a fork around existing services. A fresh read and two-real-ORM race test must prevent two withdrawals spending the same stock.
- Stock usage leaf must lock BOTH material type and BUoM after any historical movement (MAT-010/012), even at zero balance. Nonzero stock blocks material/location deactivation with pair and quantity context (LFC-012/016). MaterialService has no stock guard; LocationService delegates to NamedRecords, which needs a transactional hook or equivalent small extension.
- No shared business clock/config exists; safety-stock uses server UTC date (its spec Q10). Capture one server date per posting group; never accept a caller date. Both API/UI use the same helper.
- Cached unique material/location balance plus append-only signed movements avoids reading all history and supports future import freshness checks. No Cartesian material/location expansion needed; a missing pair reads as zero. Group/source references support later GR/GI/completions without exposing arbitrary source types to current API callers.
- `activeDemoReferences`/`isUntouchedKind` exist for repeatable startup seeds. Opening balances need real movements; consider actor attribution explicitly because existing demo seeds are unaudited and AuditActor allows only UI/API channels.
- Known next spec checks: source/line/group IDs, immutable ledger update protection compatible with later Test reset, server-only unit-factor capture, empty/loading/error/read-only/mobile UI states, both roles, tenant/API idempotency tests and migration up/down. Do not cite unimplemented GR/GI/transfer/reversal scenarios as passed.

## Follow-ups
- Owner must select signed-change or target-balance manual input; then reconcile baseline, complete spec, publish design and implementation PRs, run full gate/review/UI evidence.
- Release issue claim while waiting; resume on cez/44843974 without duplicate investigation.

## Final outcome
Design reviewed and implemented separately in PR #104. Spec moved to implemented/ after the full local gate passed (1,964 unit tests at100%; 219 browser tests); no runtime code is carried by this design PR. Owner autonomous delegation resolved signed-manual-input assumption; D07 records the normative erratum. Implementation plan and detailed verification live on PR #104. Manual QA and merge remain outside this design run.

