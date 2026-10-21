# Stabilize document lifecycle PR #123

**Date:** 2026-10-21 08:56 UTC
**Agent:** Codex
**Spec:** .ai/specs/implemented/2026-10-21--0707UTC-document-lifecycle.md
**Status:** done

## Goal
Continue issue #90 through om-auto-fix-pr #123: incorporate latest main, clear review findings, validate CI and UI, and hand off without merging.

## Plan
1. Resolve base merge preserving lifecycle and stock-reversal contracts, translation/help additions, migration ordering and counts.
2. Review the merged boundary: receipt/issue reversals must retain explicit closure and abandonment; automatic progress may reopen. Add regression coverage for interactions uncovered by the merge.
3. Run lint, typecheck, 100% coverage, build, affected integrations and migration smoke; independently review the merged diff and refresh production UI evidence.
4. Push, report and normalize labels before bounded CI monitoring; track the confirmed unrelated password-reset flake, release locks, and hand off external review/QA sign-off.

## Log
- 2026-10-21 09:18 UTC — Implementation and local verification complete. Independent static re-review approves the lifecycle/reversal changes; no outstanding actionable findings. Refreshed four production-browser screenshots as a normal user, including the actual Close Early submission at 390px. Fixed narrow material cells and confirmation-title overlap, covered by browser geometry assertions. Publishing the merge and evidence before monitoring its new full CI run; exact head/run/result will be recorded in the PR completion comment.
- 2026-10-21 09:07 UTC — Resolved base conflicts and five lifecycle/reversal boundary defects. Eight initial regression cases failed before fixes; 36 focused tests passed after. Independent review identified older-writer reversal usage filtering; its new regression fails before correction. Prior merged gate passed 2951 tests at 100%, lint/typecheck/build. Revalidating the additional usage fix. Confirmed prior-head CI flake tracked in #128.
- 2026-10-21 08:56 UTC — Prior head 4fd5d68 passed CI attempt 2. Attempt 1 timed out signing in after password reset; fresh local users suite passed 8 tests. Latest base 62b6b1a brings stock reversals and a Test dataset design. Merge conflicts are present in shared docs/help/translations, migration registration and migration count fixtures. Existing isolated worktree reused; primary checkout untouched.

## Changes
Merged base 62b6b1a while preserving both features, help/i18n additions and the sorted 27-migration registry. Reversal adapters now persist authoritative line states and derive headers; explicitly closed lines retain zero outstanding and their original abandonment; immutable receipt/issue history prevents cancellation after a full inverse. Material usage also handles stale Completed status from an older deployment writer. Added real-SQLite and browser regressions, backward-compatibility notes and spec implementation notes. Mobile order material names remain legible and dialog titles clear the close button.

## Verification
- Regression evidence: eight lifecycle/reversal cases failed before correction; the older-writer material-use regression also failed before its query fix.
- `npm run lint`: pass, with one pre-existing unused `lineError` warning in the unchanged BOM service.
- `npm run typecheck`: pass in all workspaces.
- `npm run test:coverage`: 462 files / 2952 tests pass; 100% lines, branches, functions and statements (587 source files fully covered).
- `npm run build`: pass.
- `CPG_BASE_URL=<fresh local production runtime> npm run test:integration -- tests/integration/document-lifecycle.test.ts tests/integration/stock-reversals.test.ts tests/integration/goods-receipts.test.ts tests/integration/goods-issues.test.ts tests/integration/api-tokens.test.ts tests/integration/smoke.test.ts`: six files / 29 tests pass, including 27 migrations and mobile geometry checks.
- Real-browser supplement: PO full inverse followed by close, mixed CO closed/open lines after inverse, mobile historical-posting confirmation and completed submission; four inspected screenshots. The configured Docker launcher failed with ENOSPC; built standalone output with a fresh SQLite directory provided local production verification. No shared Docker data was removed.
- The full integration suite runs in PR CI. Prior-head CI 39569232051 attempt 2 passed; the merged head's check results are published in the PR completion comment after push. Local results do not substitute for CI or independent approval.

## Follow-ups
Confirmed unrelated password-reset sign-in flake tracked in [#128](https://github.com/Piotr12/CPG/issues/128). Independent GitHub review and high-risk QA approval remain external gates; no merge or self-approval is performed. Final CI and delivery state: [PR completion record](https://github.com/Piotr12/CPG/pull/123#issuecomment-6311833800).
