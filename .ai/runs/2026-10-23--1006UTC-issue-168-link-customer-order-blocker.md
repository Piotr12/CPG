# Issue #168: link the Open customer order that blocks a location's deactivation

**Date:** 2026-10-23 10:06 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 168`, dispatched by cezar
**Spec:** none (follow-up of #161; LFC-018 in `.ai/specs/research/CPG-acceptance.md`)
**Status:** in progress

## Goal

The location's Deactivate dialog names the Open customer order that blocks it (`LOCATION_HAS_CUSTOMER_ORDERS`, `params.order`) as plain text, although `/admin/{tenant}/customer-orders/{id}` exists. Link it, as #151 and #161 did for production orders, transfers and purchase orders.

## Log

- 10:06 — Triage: proceed. `deactivation-blocker-error.tsx`'s `BLOCKERS` map has no `LOCATION_HAS_CUSTOMER_ORDERS` entry. No open or merged PR references #168, and no commit on `origin/main` does. The guard sends `params.order` as the order's eight-digit code (`customer-order-usage.ts`). Claimed the issue.
- 10:10 — Scope decision: the material's Deactivate dialog has the same gap for `MATERIAL_HAS_CUSTOMER_DEMAND` (`params.order`, LFC-014), through the same `BLOCKERS` map. Linking it too is one more entry and keeps the two dialogs consistent, so this PR covers both rather than filing another follow-up. Reversible: drop the entry.
- 10:12 — Added both `BLOCKERS` entries, their unit rows, a browser test in `customer-orders.test.ts`, and the LFC-018/LFC-014 evidence. The unit test fails without the map entries (checked by stashing the component change: "Unable to find … link … 00000009").
- 10:40 — Gate green. The changed integration file passes on a fresh standalone copy, since Docker isn't available here.

## Changes

- `packages/app/src/components/master-data/deactivation-blocker-error.tsx` — `LOCATION_HAS_CUSTOMER_ORDERS` and `MATERIAL_HAS_CUSTOMER_DEMAND` → `/admin/{tenant}/customer-orders/{order}`.
- `deactivation-blocker-error.test.tsx` — both links, in EN and PL.
- `tests/integration/customer-orders.test.ts` — the material's and the location's Deactivate dialogs link the Open customer order. The location's link opens the order, and neither record is deactivated.
- `.ai/specs/research/CPG-acceptance.md` — LFC-018 and LFC-014 evidence.

## Verification

- `npm run lint` — exit 0. One warning (`lineError` unused in `bom.service.ts`), already on `main`.
- `npm run typecheck` — exit 0.
- `npm run test:coverage` — 485 files, 3314 tests passed, 100% statements/branches/functions/lines.
- `npm run build` — exit 0.
- `tests/integration/customer-orders.test.ts` against a fresh standalone copy (`CPG_BASE_URL`) — 8 tests passed.

## Follow-ups

- None. The full integration suite runs in CI on the PR.
