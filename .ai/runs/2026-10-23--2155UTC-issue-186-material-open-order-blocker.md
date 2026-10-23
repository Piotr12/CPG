# Issue #186: name and link the Open PO that blocks a material's deactivation, and prove E2E-017

**Date:** 2026-10-23 21:55 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-issue 186`, dispatched by cezar
**Spec:** none (E09-S05; LFC-013 and E2E-017 in `.ai/specs/research/CPG-acceptance.md`)
**Status:** done

## Goal

`MATERIAL_IN_OPEN_ORDER` is the one master-deactivation blocker that sends no `params`, has no EN/PL text and isn't linked. Make it carry `{ order }`, translate it, link the order from the material's Deactivate dialog, and add the integration test for E2E-017 (receive on an old PO after its supplier is deactivated; a new PO refused).

## Log

- 21:55 — Triage: proceed. `assertNoOpenOrder` (`material.service.ts:355`) throws without params; `BLOCKERS` and both message files lack the code. No open or merged PR, and no commit on `origin/main`, fixes #186 (#193 only lists it in a docs table). Claimed the issue.
- 21:56 — Root cause: the guard predates the `params` convention that #139/#161/#168 brought to the other blockers. Minimal change: pass `{ order }`, add EN/PL messages, add one `BLOCKERS` entry, and note the additive field in `BACKWARD_COMPATIBILITY.md` §4. Same shape as `LOCATION_HAS_PURCHASE_ORDERS`.
- 21:58 — Kept the cezar branch (`cez/6ba83fce`) instead of `fix/issue-186-…`: the cockpit tracks this worktree's branch, as the earlier #168 run did.
- 22:05 — Tests: the service test asserts `messageParams`; `error-message.test.ts` checks EN and PL; the component test gets the row; `purchasing-api.test.ts` asserts `params.order` and adds E2E-017 (receipt, completed PO, movement, audit entry, `SUPPLIER_INACTIVE` for a new PO); `purchasing.test.ts` checks the material's Deactivate dialog and follows the link. Catalogue: LFC-013 evidence, E2E-017 → Passed (automated).

- 22:20 — Gate green. Docker isn't available here, so the two changed integration files ran against a fresh standalone copy of the build (`CPG_BASE_URL`); CI runs the image.

## Changes

- `packages/core/src/services/materials/material.service.ts` — `MATERIAL_IN_OPEN_ORDER` carries `{ order }`.
- `packages/app/src/i18n/messages/en.ts`, `pl.ts` — the message, with `{order}`.
- `packages/app/src/components/master-data/deactivation-blocker-error.tsx` — `MATERIAL_IN_OPEN_ORDER` → `/admin/{tenant}/purchase-orders/{order}`.
- Tests: `purchase-order.service.test.ts` (`messageParams`), `error-message.test.ts` (EN/PL), `deactivation-blocker-error.test.tsx` (link row), `tests/integration/purchasing-api.test.ts` (`params.order`; E2E-017), `tests/integration/purchasing.test.ts` (the dialog's link opens the PO; the material stays Active).
- `BACKWARD_COMPATIBILITY.md` §4 — the additive `params.order`.
- `.ai/specs/research/CPG-acceptance.md` — LFC-013 evidence; E2E-017 → Passed (automated).

## Verification

- The three new unit assertions fail with the fix reverted (3 failed / 60 passed) and pass with it (63/63).
- `npm run lint` — exit 0 (one warning, `lineError` in `bom.service.ts`, already on `main`).
- `npm run typecheck` — exit 0.
- `npm run test:coverage` — 496 files, 3546 tests passed; 100% statements, branches, functions, lines.
- `npm run build` — exit 0.
- `tests/integration/purchasing-api.test.ts` and `purchasing.test.ts` against a fresh standalone copy — 2 files, 21 tests passed.

## Follow-ups

- None. Out of scope per the issue: whether Open requisitions should also block material deactivation (spec Q10 says no; raised on #75).
