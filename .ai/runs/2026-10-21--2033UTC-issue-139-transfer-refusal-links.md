# Issue #139: link transfer refusals, prove the stock import's remaining scenarios

**Date:** 2026-10-21 20:33 UTC
**Agent:** Claude Code (claude-opus-5-5), cezar headless, `/om-auto-fix-issue 139`
**Spec:** `.ai/specs/2026-10-21--2035UTC-transfer-refusal-links.md`
**Status:** in progress

## Goal

Issue #139 (E07-S04): a deactivation refused by an Open transfer links to that transfer, as production-order refusals do (LFC-018); tests for STX-006 and STX-018 (and the optional LFC-016 assertion); the acceptance doc updated.

## Log

- 20:33 Classified as a feature (`feature` label): feature route. FR triage: not built (the refusal sends `params.transfer`, the dialog formatter links only `*_HAS_PRODUCTION_ORDERS`), no spec covers it, no open PR references #139. `SDLC.md` has no Definition of Ready, so the ticket-level gate is skipped. Claimed #139.
- 20:35 `om-auto-write-spec`: branch `spec/transfer-refusal-links`, spec written with autonomous defaults (Q1–Q6). Current-state screenshot from a throwaway dev server (an Open transfer of an unstocked material), plus one static mockup.
- 20:45 Fresh-context review: 1 High (the planned integration test would hit `STOCK_NOT_EMPTY` first, because deactivation checks physical stock before transfers), 3 Medium (the STX-018 UI test's helper and audit-filter work, the API channel of STX-018, a service test that proves nothing new), 4 Low. All folded into the spec.

## Changes

- `.ai/specs/2026-10-21--2035UTC-transfer-refusal-links.md`, `.ai/specs/assets/transfer-refusal-links/`

## Verification

## Follow-ups
