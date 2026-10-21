# Audit history filters — issue #96

**Date:** 2026-10-21 09:42 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar)
**Spec:** .ai/specs/2026-10-21--0944UTC-audit-history-filters.md
**Status:** in progress

## Goal
Run `om-auto-fix-issue 96` (E13-S03): filters on the tenant and Global audit by record, account, channel and date range, the business date beside the audit timestamp, linked original and reversal entries, localised labels, and the same filters through the API.

## Log
- 09:42 UTC — Read handoff, lessons, AGENTS.md, pipeline config. Issue #96 open, unassigned, `feature`/`priority-medium`/`risk-high`, no referencing PR, no covering spec (E02-S02 spec Q9 deferred filters to slice 2). `SDLC.md` has no Definition of Ready, so the readiness check is skipped. Classified as a feature → feature route: `om-auto-write-spec 96`, then `om-auto-implement-spec`.
- 09:42 UTC — Claimed #96 (assignee, `in-progress`, claim comment). The first attempt to source the descriptor's label guards extracted the wrong code block and ran its prerequisite `brew upgrade gh` (2.102.0 → 2.102.1); the `sudo apt` line failed harmlessly. Guards are now sourced from the exact line range.
- 09:44 UTC — Branch `spec/audit-history-filters` off `origin/main` (860d421) in the existing cezar worktree; `npm ci`.
- Survey: the audit already stores `businessDate` in stock, transfer and reversal snapshots, and `stock.movement.reversed` names both movements and the reason. `StockReversal` links original → inverse. Action labels are already translated (EN/PL); a few snapshot fields (`original`, `reversal`, `reversed`, `balance`, …) and the subject types have no labels yet.

- 09:47 UTC — Dev server on a throwaway `DATA_DIR` (port 3240); posted a 25 kg correction on Test and reversed it to give the audit real entries. Captured current tenant and Global audit screenshots. Found a live layout defect: at 1280 × 800 the Subject label doesn't wrap and pushes Changes off-screen. Added wrapping to the spec's scope. Rendered two static mockups (EN filtered movement, PL filtered by account and channel) and inspected all four images.
- 09:51 UTC — Fresh-context spec review: "revise, minor". Applied every finding:
  - the account select uses a new names-only `UserService.usernames()`, not the admin-only `list()`;
  - the five unlabelled `transfers.transfer.*` actions, plus a repo test for action labels;
  - API responses keep their shape, as the issue requires. The business date is derived from the snapshot in `app`, and reversal links come from `AuditService.reversalLinks`; the API already exposes both facts;
  - corrected the JSON-query rationale;
  - the `filters` key lint trap;
  - six business-date producers, not three; the AUD-030 test now uses a goods receipt;
  - the newly validated parameters' 400s are recorded in compat;
  - `account` lowercased;
  - the API parity check uses a normal user's own token.
- 09:52 UTC — `tests/ai-filenames.test.ts` and `tests/spec-images.test.ts` pass. Lessons added (guard extraction; caller contract on reuse).

## Plan
1. Spec (design-only PR): filters as query parameters on the four existing audit routes, keyset paging kept; business date read from the snapshot; reversal links from `StockReversal` for the page's movements; subject-history link on every row; one additive index migration for the record filter.
2. Implementation PR off `main` per the spec's plan, full gate, touched integration files plus smoke (migration), review, UI QA evidence.

## Changes
## Verification
## Follow-ups
