# PR #161 merge-ready after #151: link the blocking purchase order

**Date:** 2026-10-23 08:06 UTC
**Agent:** Claude Code (claude-opus-5-5), `om-auto-fix-pr 161`, dispatched by cezar
**Spec:** `.ai/specs/implemented/2026-10-20--1636UTC-purchase-requisitions-orders.md` (via #141)
**Status:** done

## Goal

Bring #161 (refuse location deactivation while Open purchasing needs it, #141) back to merge-ready. `main` advanced to 83dd1cb (#151, which fixes #139: deactivation refusals link their blocking document), and the PR became `CONFLICTING`.

## Log

- 08:00 — Claimed #161. Checked the head out as local `pr-161-f75`, because both `fix/issue-141-location-purchasing-guard` and `pr-161` are checked out in other (finished) cezar worktrees. Pushes go to `HEAD:fix/issue-141-location-purchasing-guard`.
- 08:01 — Merged `origin/main` 83dd1cb. One conflict, the LFC-018 Evidence line in `CPG-acceptance.md`. Kept main's status (Passed (automated)) and its #139 evidence, and appended this PR's purchase-order/requisition evidence.
- 08:03 — Re-review of the seam. #151 made the location's Deactivate dialog link the blocking production order or transfer through `deactivationBlockerError`. This PR's `LOCATION_HAS_PURCHASE_ORDERS` refusal still showed the order as plain text, although `/admin/{tenant}/purchase-orders/{id}` exists, and LFC-018's Then asks for "blocking document links". Fixed it by mapping the code to the purchase-order page. A requisition has no page of its own, so `LOCATION_HAS_REQUISITIONS` stays unlinked. A negative unit case pins that.
- 08:05 — Gate green. The unit test fails without the mapping (checked by removing it). The touched integration files pass on a fresh standalone copy.

## Changes

- `packages/app/src/components/master-data/deactivation-blocker-error.tsx` — `LOCATION_HAS_PURCHASE_ORDERS` → `/admin/{tenant}/purchase-orders/{order}`.
- `deactivation-blocker-error.test.tsx` — the PO link (EN/PL), plus the unlinked requisition case.
- `tests/integration/purchasing.test.ts` — the location's Deactivate refusal links the Open PO.
- `.ai/specs/research/CPG-acceptance.md` — LFC-018 evidence (merge and the PO link).
- Merge of `origin/main` 83dd1cb.

## Verification

- `npm run lint` — exit 0. One warning in `bom.service.ts` (`lineError` unused), already on `main`.
- `npm run typecheck` — exit 0.
- `npm run test:coverage` — 485 files, 3314 tests passed, 100%.
- `npm run build` — exit 0.
- `purchasing.test.ts`, `purchasing-api.test.ts`, `transfers.test.ts` against a fresh standalone copy (no Docker here) — 3 files, 24 tests passed.

## Follow-ups

- None new. The open ones are #162 (index), #166 (app-icons flake) and #167 (integration job timeout headroom). The customer-order refusal (`LOCATION_HAS_CUSTOMER_ORDERS`) also names its order without a link. That's on `main` and outside this PR; filed as a follow-up from the review.
