# Look up three production field messages by exported constant (#251)

**Date:** 2026-10-25 16:59 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 251`)
**Spec:** none
**Status:** done

## Goal

`productionFieldError` translated three server field messages by hard-coded English text. Export them as constants from `@cpg/core/validators/production-orders/production-order.schema`, and use them at both the core throw sites and the screen lookup, without changing any message text.

## Log

- 16:59 — Triage: issue open, unclaimed, no PR or commit references #251; the three literals are at `production-planning.ts:8,19`, `production-order.service.ts:95` and `labels.ts:42-44`. Classified as the bug route (refactor, no feature). Claimed #251.
- 17:01 — Added `PLANNED_START_YEAR_MESSAGE`, `REQUIREMENT_OVERFLOW_MESSAGE` and `TARGET_BELOW_PRODUCED_MESSAGE` beside the schemas, and used them in planning, the service and `productionFieldError`. Tests now assert the field errors by constant. A schema test pins the three English texts (the API contract), and a label test checks both languages translate each constant through `productionFieldError` and `completionFieldError`.

## Changes

- `packages/core/src/validators/production-orders/production-order.schema.ts` (+ test)
- `packages/core/src/domain/production-orders/production-planning.ts` (+ test)
- `packages/core/src/services/production-orders/production-order.service.ts` (+ test)
- `packages/app/src/components/production-orders/labels.ts` (+ test)

## Verification

- `npx vitest run` on the four touched test files: 38 passed.
- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (588 files, 4,517 tests, thresholds met), `npm run build`: all exit 0.
- No integration test touched and no screen behaviour changed (same texts, same translations), so no local integration run; CI runs the suite on the PR.

## Follow-ups

None. No lesson added: the glossary lesson (#214) already says to keep exact-text lookups on exported constants.
