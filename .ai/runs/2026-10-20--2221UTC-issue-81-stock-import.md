# Stock import — issue #81

**Date:** 2026-10-20 22:21 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 81` via cezar
**Spec:** .ai/specs/implemented/2026-10-20--2225UTC-stock-import.md
**Status:** done

## Goal
Deliver E07-S02: a user imports desired physical stock from a workbook, with a dry run and an atomic commit, in the UI and the API (STX-001…021).

## Log
- 22:21 UTC: Read the handoff, issue #81, the pipeline config, lessons and the engineering standards. Current user Piotr12. The issue is open and unassigned, with no claim comment and no PR referencing it. It is labelled `feature`, so it takes the feature route. A code search (`packages/`) and a spec search (`.ai/specs/`) found no stock import and no covering spec. `SDLC.md` has no Definition of Ready, so the ticket counts as ready. Claimed the issue (assignee, `in-progress`, claim comment).
- 22:25 UTC: Reused the linked worktree; branch `spec/stock-import` from `origin/main` (ce24740). Wrote the spec autonomously (13 defaults, none gated). Main call (Q1): a separate stock workbook and screen on the master import's engine, generalized over a layout. The reasons: both roles (STX-018), and the owner's menu mockup puts Stock import under Inventory, for everyone. Read-only dry run, one reason at commit, one `correction` posting, and a token over balance versions for STX-016.
- 22:28 UTC: Rendered three static mockups with agent-browser under `.ai/specs/assets/stock-import/`. No current-app screenshot: no shared test env was running. Started the fresh-context spec review.
- 22:32 UTC: The fresh-context review said proceed after small revisions (1 High, 4 Medium, 5 Low; no blockers). All of them are applied in the spec:
  - Phase 1 measures a 2,000-row dry run and commit. The fallback is a chunked posting with a position offset; a lower cap is the last resort.
  - `postStockMovements`' contract is documented, and a test pins that no zero line reaches it.
  - The stock screen's labels override the `IMPORT_MISSING_REFERENCE` text.
  - A 0 still needs a valid unit.
  - The refactor's touch points are listed; the stock import keeps its own error order and summary.
  - The dry run's lock and limit wording is corrected.
  - The display label is left out of the token, and the refused transit headers are named exactly.

- 22:40 UTC: Opened spec PR #116 with labels, the defaults comment, the evidence and the run summary. Handed the issue lock to the implementation.
- 23:15 UTC: Implementation PR #118 is ready. Its plan, `.ai/pipeline/runs/2026-10-20--2234UTC-stock-import.md`, is the run log from here on. The issue lock is released.

## Changes
- `.ai/specs/implemented/2026-10-20--2225UTC-stock-import.md`, `.ai/specs/assets/stock-import/*`, this log.

## Verification
- `tests/ai-filenames.test.ts` (4) and `tests/spec-images.test.ts` (2) pass.

## Follow-ups
- Merge #116 first, then #118 after its QA. Then move the spec to `implemented/`, with the implementation notes from #118's plan.
