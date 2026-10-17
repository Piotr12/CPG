# Spec for mammoth app icons (issue #4)

**Date:** 2026-10-17 13:21 UTC
**Agent:** Claude Code / claude-opus-5-5 — `om-auto-fix-issue 4` → feature route → `om-auto-write-spec 4`
**Spec:** .ai/specs/2026-10-17--1321UTC-mammoth-app-icons.md
**Status:** done

## Goal

Write the spec for issue #4 (replace the Next.js favicon with a 🦣 mammoth icon set in every size current browsers use) and land it on a design-only PR. Implementation follows on its own PR (`om-auto-implement-spec`).

## Log

- 13:18 FR triage: issue #4 is open and unclaimed, with no open PRs. The only icon is the stock `packages/app/src/app/favicon.ico`. `SDLC.md` has no Definition of Ready, so the ready check was skipped. No covering spec, so the route is `om-auto-write-spec`.
- 13:19 Claimed #4. Worktree `.ai/tmp/om-auto-write-spec/mammoth-app-icons-…` on `spec/mammoth-app-icons`.
- 13:20 Artwork research. Noto Emoji has `2D/svg/emoji_u1f9a3.svg`, but its README says the images are Apache-2.0 while the root `LICENSE` is now OFL-1.1, so the licence is ambiguous. Deviated from the issue's suggested default to Fluent Emoji Flat (MIT, pinned `d51fb3c`). Rendered previews at 256 px and 16 px: Flat stays legible at 16 px, Color turns to mush.
- 13:21 Checked the current build output: Next.js 16 emits `<link rel="icon" href="/favicon.ico?favicon.<hash>.ico" sizes="48x48" type="image/x-icon"/>`. Fixed the spec's edge cases to match.
- 13:22 No `om-prepare-test-env` descriptor exists (`.ai/scripts/` is empty), so the current-app screenshots and mockups were skipped. Committed the artwork preview instead.
- 13:25 Fresh-context spec review (scope cohesion confirmed as one PR). Applied: dropped the old-favicon hash check, pinned the emitted `sizes`/`type` attributes in the integration test, clarified that the OFL `LICENSE` is Noto's, marked Firefox/Safari/dark mode as human QA, and named the six-file set as an explicit decision.

## Changes

- `.ai/specs/2026-10-17--1321UTC-mammoth-app-icons.md`
- `.ai/specs/assets/mammoth-app-icons/artwork-preview.png`

## Verification

- `npx vitest run tests/ai-filenames.test.ts` — 4 passed (new spec, run log and assets folder follow the naming rule).
- Spec reviewed by a fresh-context subagent; findings applied (see Log 13:25).

## Follow-ups

- Implementation: `om-auto-implement-spec .ai/specs/2026-10-17--1321UTC-mammoth-app-icons.md`.
- `om-prepare-test-env` has never run in this repo. Screenshot evidence for spec PRs needs it.
