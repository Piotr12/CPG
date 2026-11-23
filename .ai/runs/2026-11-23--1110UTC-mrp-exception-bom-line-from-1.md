# MRP Explanations name a BOM line from 1 in Invalid UoM Conversion (#396)

**Date:** 2026-11-23 11:10 UTC
**Agent:** Claude Code / Opus 5.5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none (bug #396)
**Status:** done

## Goal

The Invalid UoM Conversion text in the MRP Explanations names a BOM's first line `…/0`, while the BOM form counts its lines from 1 ("Line 1"). Name it from 1 in English and Polish. Leave the stored `document` param and the API unchanged (`BACKWARD_COMPATIBILITY.md`: "with the position as stored", "`BOM/revision/position` for a BOM line").

## Log

- 11:10 Triage: no open or merged PR covers #396. `components/mrp/mrp-exception-text.ts` handles only `customer-order-line` (#395), so a `bom-line` document is filled in as stored. Both snapshot paths write `BOM/revision/position`: `snapshot/boms.ts:69` directly, and `snapshot/production-orders.ts:71` through `unreadableBoms`, which names a revision `code/number`. The issue's `BOM/position` shape for production orders doesn't exist (`mrp-snapshot.service.test.ts:1163` pins `00000001/1/2`). One parser covers both. The BOM form numbers lines `index + 1` (`recipe-form.tsx:239`, "Line {number}" / "Wiersz {number}"). Claimed the issue.
- 11:14 Fix in the app's text layer, beside #395's order-line case: a `bom-line` record whose document is `BOM/revision/position` gets the new `bomLine` text, `BOM {bom}, revision {revision}, line {line}`, with `line` = position + 1. A document of another shape, or none, falls back to the existing texts. Polish says "pozycja", like #395's `orderLine` and the record's own label "pozycja BOM-u", so the panel names lines one way. The BOM form says "Wiersz"; the number is what the issue asks to match.
- The new test fails on `main`'s `mrp-exception-text.ts` (1 failed, 8 passed) and passes with the fix. The old "with its document" example used a BOM line, so it now uses a production order.

## Changes

- `packages/app/src/components/mrp/mrp-exception-text.ts`: the BOM-line case.
- `packages/app/src/i18n/messages/en.ts`, `pl.ts`: `INVALID_UOM_CONVERSION.bomLine`.
- `packages/app/src/components/mrp/mrp-exception-text.test.ts`: regression test (EN, PL, line 10, the fallbacks, another record with the same shape).
- `.ai/lessons.md`: fix every line kind stored from 0 in the same PR.

## Verification

- `npx vitest run packages/app/src/components/mrp/mrp-exception-text.test.ts packages/app/src/i18n`: 41 passed.
- `npm run lint`, `npm run typecheck`: clean.
- `npm run test:coverage`: 698 files, 5,840 passed (2 skipped); 100% statements, branches, functions and lines.
- `npm run build`: the first run generated every page, then exited 1 on the Next.js `SecurityFatalError` upgrade nudge (as in #390's run). The retry exited 0. The upgrade is out of scope and was not run.
- No integration file changed: the exception needs a row corrupted around the services, which the image-driven suite can't write (as in #390).
- PR #409. An independent review (`om-auto-review-pr`) approves, posted as a comment because the account can't approve its own PR: no actionable findings.
- UI ([evidence](https://github.com/Piotr12/CPG/pull/409#issuecomment-7099692213)): the PR head's `next start` on a throwaway `DATA_DIR` (Docker wasn't running). BOM 00000005 was saved once to make revision 2, and its first line was corrupted to `'3,5'`, then Run MRP. The Explanations read "BOM 00000005, revision 2, line 1" and "(BOM 00000005, rewizja 2, pozycja 1)". After the restore, the edit form names that row "Line 1" / "Wiersz 1". Screenshots are on the `qa-evidence` branch under `pr-409/`.
- CI: watched on the PR after this commit (see the PR's CI result comment).

## Follow-ups

- None for the code. Polish says "pozycja" in the Explanations and "Wiersz" in the BOM form, as #395 left it for order lines. Aligning the wording would be a separate copy decision.
