# API messages say BOM, never recipe (#214)

**Date:** 2026-10-25 12:01 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, cezar headless)
**Spec:** none (follow-up issue #214 to #210 / #206)
**Status:** done

## Goal

#214 asked the owner to choose: reword the API's English error messages that still say "recipe", or declare them stable. Record the decision and, if rewording, update the messages, the tests that pin them and BACKWARD_COMPATIBILITY.md.

## Log

- 12:01 Triage: the six messages listed in the issue still say "recipe" on `main` (acf55945). No open PR references #214. The issue was assigned to Piotr12, with no `in-progress` lock.
- 12:01 Decision: **reword**, posted on the issue. The owner ran the fix skill, and a message change is the reversible option: the screens translate by code or by the exported constants (`components/{boms,production-orders,imports}/labels.ts`), so the lookups follow the text automatically.
- 12:02 Claimed #214 (assignee, `in-progress`, claim comment).
- The new wording matches the screens' own English dictionary entries (`en.ts`: `BOM_CYCLE`, `fieldErrors.duplicate`, `completion.fieldErrors.missingComponent`, `IMPORT_*`).
- Added `tests/api-messages-glossary.test.ts`. It parses every non-test `.ts` in `packages/core/src` and `packages/app/src/app/api` with the TypeScript compiler, and fails on any string or template text containing "recipe". Module paths and property paths (`"recipe.bom"` populate hints) are skipped. The test found one more message outside the issue's list, the Test-dataset config check "Material X's recipe doesn't use Y" (`test-tenant-config.schema.ts`), which is now "Material X's priority-1 BOM doesn't use Y". Checked that the guard fails when one of the old messages is put back.
- Deviation: the branch is cezar's `cez/5463ab83`, not `fix/issue-214-…`. Reusing the linked worktree's branch has a precedent (#238).

## Changes

- `packages/core`: `bom.service.ts` (`BOM_CYCLE`), `production-order.service.ts` (`PRODUCTION_BOM_CHANGED`), `bom-fields.schema.ts` (`DUPLICATE_COMPONENT_MESSAGE`), `production-completion.schema.ts` (`MISSING_COMPONENT_MESSAGE`), `prepare-import.ts` (`IMPORT_LINE_WITHOUT_HEADER`, `IMPORT_BOM_WITHOUT_LINES`), `test-tenant-config.schema.ts`.
- The tests that pin these texts, in core, app and `tests/integration/boms-api.test.ts`.
- New guard `tests/api-messages-glossary.test.ts`.
- `BACKWARD_COMPATIBILITY.md`: new section "BOM, never recipe, in the API's messages (#214)" with a before/after table.
- `.ai/lessons.md`: the glossary lesson now covers the server's texts.

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
- `npm run test:coverage`: exit 0. 570 files, 4326 tests; 100% statements, branches, functions and lines.
- The guard fails when `DUPLICATE_COMPONENT_MESSAGE` is put back to "…already in the recipe…", and passes with the fix.
- Integration, against a local standalone build with a fresh `DATA_DIR` (Docker isn't running on this machine): `tests/integration/boms-api.test.ts` 9/9 passed (it pins the new `BOM_CYCLE` text), and `tests/integration/boms.test.ts` 10/10 passed (the screen's cycle sentence still appends the path after the colon). The full suite runs in CI.
- No UI or route change: the screens translate these refusals by code, or by the constants that changed with the text, so nothing users see changes.

## Follow-ups

- None.
