# Fix #154: page the remaining lists through the shared PageLinks

**Date:** 2026-10-23 14:06 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (refactor)
**Status:** done

## Goal

The customer-order, transfer and production-order lists and the completion history render their own Previous/Next markup. Page them through `components/layout/page-links.tsx` (`PageLinks`), keeping every URL (`?page=`, `?completions=`) and label unchanged.

## Log

- 14:06 — Triage: no open or merged PR and no commit on `main` (`8adea42`) references #154. The duplicated `<nav>` lives in `transfers/transfers-screen.tsx`, `customer-orders/order-screen.tsx`, `production-orders/production-screen.tsx` and `production-orders/completion-history.tsx`. The issue named `orders-content.tsx` and `production-content.tsx`, but those only load data and render the screens. Claimed the issue.
- Plan: swap each `<nav>` for `PageLinks` with the same `href`s and labels. The completion history doesn't count its completions; it only knows whether a full page means an older one exists. Pass `pages = older ? page + 1 : page`. Its label is `Page {page}`, and `fill` ignores the unused `{pages}`, so `PageLinks` needs no extension. The markup `PageLinks` renders matches what each list had (same `nav` aria-label, classes and outline buttons), so the integration tests need no change.

- 14:20 — Swapped the four `<nav>`s for `PageLinks`. Added a PL paging test per list, a past-the-end check on the completion history (Newer link to the previous page, no Older), and `tests/page-links.test.ts`. That test fails when a `.tsx` under `packages/app/src` other than `page-links.tsx` renders `.previous}`/`.next}` labels. It failed with the old transfers screen restored and passes with the change.
- Not moved: the audit view (`components/audit/audit-view.tsx`). Its cursor paging (Newest / Older, no page numbers) is a different control, and the issue doesn't list it. Moving it would change what it shows.
- 14:40 — PR #175 opened. A fresh-context review approved it with two minors and two nits: this log's status, the audit view against the issue's "no other paging markup" criterion, and the guard's regex and test name. The guard now matches only a `….previous}`/`….next}` label closing a `<Link>`. It still matches all four screens as they are on `main`.
- 16:15 — Browser check (`om-auto-qa-pr`, evidence only). Docker was unavailable, so it ran on a standalone copy of `npm run build` on port 3154, with a `DATA_DIR` from `mktemp -d /tmp/…`. Test was reset to the realistic dataset (the Dataset control is a Radix select: use its hidden native `[data-test-reset] select`). That dataset has no transfers and at most 2 completions per order, so 101 transfers and 21 completions on 00000376 were added through the API. All four pagers matched in EN, PL and at 390 px, past-the-end completion page included: [evidence](https://github.com/Piotr12/CPG/pull/175#issuecomment-6367035881).

## Changes

- `components/transfers/transfers-screen.tsx`, `components/customer-orders/order-screen.tsx`, `components/production-orders/production-screen.tsx`, `components/production-orders/completion-history.tsx`: page through `PageLinks`.
- Tests: `app/admin/[tenant]/transfers/page.test.tsx`, `components/customer-orders/orders-content.test.tsx`, `components/production-orders/production-content.test.tsx`, `components/production-orders/completion-history.test.tsx`, `tests/page-links.test.ts`.

## Verification

- `npm run lint` → 0 errors, 1 warning (`lineError` in `bom.service.ts`, already on `main`).
- `npm run typecheck` → clean. `npm run test:coverage` → 100% statements/branches/functions/lines, "605 files fully covered". `npm run build` → succeeded.
- Integration: Docker unavailable on this machine, and no integration file changed. The rendered markup is unchanged (same `nav` aria-label, classes, buttons, hrefs), so CI's suite is the check.

## Follow-ups

- The audit view's cursor paging (Newest / Older) is still its own markup. Moving it to a shared control would need a cursor variant of `PageLinks`; file that only if consistency there matters.
