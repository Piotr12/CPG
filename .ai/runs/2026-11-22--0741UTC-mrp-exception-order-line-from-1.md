# MRP Explanations name a customer-order line from 1 in Invalid UoM Conversion (#390)

**Date:** 2026-11-22 07:41 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (bug #390)
**Status:** in progress

## Goal

The Invalid UoM Conversion text in the MRP Explanations named the first line of customer order 00000012 as `00000012/0`, while the order screens call it Line 1. Name it from 1 in English and Polish, and leave the stored `document` param and the API unchanged (`BACKWARD_COMPATIBILITY.md`: "with the position as stored").

## Log

- 07:41 Triage: `snapshot/order-lines.ts:35` writes `document` as `order/position` with the 0-based stored position (`customer-order.service.ts`), and `components/mrp/mrp-exception-text.ts` filled `{document}` verbatim. No open or merged PR covers #390. Claimed the issue.
- 07:44 Fix in the app's text layer, the rule #387 uses on the report (`mrp-shortages.tsx`, `position + 1`): a `customer-order-line` record whose document is `order/position` gets the new `orderLine` text, `customer order {order}, line {line}`, with `line` = position + 1. A document without a position falls back to the existing texts. Purchase-order lines already count from 1 and keep their document as stored.
- The new test fails on `main`'s `mrp-exception-text.ts` (1 failed, 7 passed) and passes with the fix.

## Changes

- `packages/app/src/components/mrp/mrp-exception-text.ts`: the customer-order-line case.
- `packages/app/src/i18n/messages/en.ts`, `pl.ts`: `INVALID_UOM_CONVERSION.orderLine`.
- `packages/app/src/components/mrp/mrp-exception-text.test.ts`: regression test (EN, PL, line 10, the fallbacks, a purchase-order line).

## Verification

- `npx vitest run packages/app/src/components/mrp/mrp-exception-text.test.ts packages/app/src/i18n`: 38 passed.
- `npm run lint`, `npm run typecheck`: clean.
- `npm run test:coverage`: 681 files, 5,716 passed (2 skipped); 100% statements, branches, functions and lines.
- `npm run build`: the first run compiled and generated all 113 pages, then `next build` exited 1 with a `SecurityFatalError` upgrade nudge (an npm advisory against `next@16.4.2`, telling the agent to retry). The retry exited 0. The upgrade is out of scope here and was not run.
- No integration test covers this text: it needs a row corrupted around the services (MRP-036 writes it with SQL), which the image-driven suite can't do. The unit test checks the screen's text in both languages.

## Follow-ups

- BOM lines are stored from 0 too (`bom.service.ts`, `insertRevision`), so a BOM line's Invalid UoM Conversion document `BOM/revision/position` names its first line `/0`. Not in #390's scope.
