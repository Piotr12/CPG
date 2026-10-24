# Issue #206: BOM, not recipe — sweep the remaining "recipe" wording in both languages

**Date:** 2026-10-24 17:08 UTC
**Agent:** Claude Code / claude-fable-5-1 (`om-auto-fix-issue 206`, cezar task 3abe5cd0)
**Spec:** `.ai/specs/implemented/2026-10-24--0842UTC-design-system-v1.md` (Principle 7, "one term per concept: BOM, not recipe"; its implementation note filed #206)
**Status:** in progress

## Goal

Fix #206: every user-visible "recipe"/"receptur…" in the EN and PL dictionaries and help topics says BOM (or names the components), with the unit and integration tests that assert those strings updated, and a guard that keeps the term out. Keys named `recipe`/`recipeLabel`, help topic ids, routes and API shapes stay.

## Plan

1. `en.ts` (16 values), `pl.ts` (18 lines), `help/topics.ts` (11 EN + 12 PL lines), `workbook-layout.ts` (2 EN + 2 PL purposes/meanings).
2. Tests pinning the old text: `boms/[id]/page.test.tsx`, `bom-screen.test.tsx`, `bom-controls.test.tsx`, `recipe-form.test.tsx`, `workbook-layout.test.ts`, `workbook-file.test.ts`, `tests/integration/boms.test.ts`.
3. Regression guard: a dictionary test that fails on any EN value containing "recipe" or PL value containing "receptur", over both dictionaries and both help languages.
4. Gate: lint, typecheck, test:coverage, build; `tests/integration/boms.test.ts` against a standalone build (Docker is unavailable on this machine).

## Log

- 17:08 Step 1 (concurrency): #206 open, unassigned, no `in-progress`, no comments, no open PR referencing it (`gh search prs "#206" --state open` → none; #207 is merged and only filed it). Classified as the bug chain: the issue labels are `refactor`/`priority-low`/`risk-low`, no `bug`/`feature`; a corrective copy change, not a new capability, so the default route applies.
- 17:08 Triage (`om-verify-in-repo`): proceed. `main` at d4097577 still holds 16 "recipe" values in `en.ts`, 18 "receptur" lines in `pl.ts` and 23 help lines in `help/topics.ts`, exactly the issue's inventory; only the production-orders empty state was changed by #207. Not a usage error: the design system spec's Voice section says "One term per concept: BOM, not recipe".
- 17:08 Root cause (`om-root-cause`): the BOM, production-order, import and variance-report screens were written while the domain still called a BOM revision's component list a "recipe"; the spec later settled on one term. Every server message those screens show is translated by code (`errors`) or by exact-message lookup (`fieldErrorFormatter`, `completionFieldError`), so the dictionaries can change while the API's English messages (`BOM_CYCLE`, `MISSING_COMPONENT_MESSAGE`, `DUPLICATE_COMPONENT_MESSAGE`, the import prepare messages) stay: BACKWARD_COMPATIBILITY.md protects the envelope and the issue says API shapes stay. One user-visible surface outside the issue's inventory: the import template's Instructions sheet prose in `core/src/domain/imports/workbook-layout.ts` (EN and PL "complete recipe" / "pełna receptura"), which is copy, not the protected sheet/column layout, so it is swept too and called out in the PR.
- 17:08 Worktree: reused the cezar worktree (linked, not the primary); branch `fix/issue-206-bom-not-recipe-copy` off `origin/main`; `npm ci` done.
- 17:08 Claimed #206 (assignee Piotr12, `in-progress`, claim comment).
- 17:12 Edits made in one scripted pass (every old string matched exactly once, or three times where the test repeats a button name). The touched areas' unit tests pass: 42 files, 246 tests. Left alone on purpose: the key names `recipe`/`recipeLabel` (the issue allows them), code comments and identifiers, and the API's English server messages (`BOM_CYCLE`, `MISSING_COMPONENT_MESSAGE`, `DUPLICATE_COMPONENT_MESSAGE`, the import prepare messages), which the screens translate by code or exact text and BACKWARD_COMPATIBILITY.md keeps stable.
- Wording choices: a BOM revision's component list is "Components (revision N)" / "Składniki (rewizja N)" on the BOM page (the list column already says Components); the button and dialog are "Edit BOM" / "Edytuj BOM"; the import copy says a BOM's lines are "all its components" / "wszystkie jego składniki"; "a later recipe" in the variance report help becomes "a later revision", the precise term there.
- 17:17 Gate: lint and typecheck green; the first `test:coverage` run failed only on `packages/core/src/domain/demo/replay.test.ts` ("holds the committed configuration on every day of two years…", `Error: Test timed out in 30000ms`) at a load average of 57 (ten users' sessions on this machine); build green. The file passes alone in 3.9 s, and the full coverage run passed on a second run.
- 17:19 `tests/integration/boms.test.ts` against the standalone production build of this tree (Docker is unavailable on this machine; lesson 2026-10-23): 7 tests passed in 30 s.
- 17:21 PR #210 opened (`review`, `refactor`, `needs-qa`, `priority-low`, `risk-low`); the chain lock moved onto the PR and the issue lock was released.
- 17:30 Review (`om-auto-review-pr --autofix`): head mergeable, CI in progress, no reviewer feedback to inherit, nothing already on `main`, the diff pattern scan clean. A fresh-context reviewer (subagent on the `om-code-review` checklist, `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md`) returned approve with three minors and nits, all applied: the template's `RECIPE-X` example reaches the downloaded template's Example column, so it is `BOM-X` now (four import test fixtures renamed) and the template guard also scans examples; "tego BOM" → "tego BOM-u" on the touched line; the BOMs help says "show how", not "list how"; the stale test title "the full recipe" renamed; this log's Plan moved above the Log; the API-messages follow-up is filed as an issue instead of prose (number below).

## Changes

- `packages/app/src/i18n/messages/en.ts` (16 values), `pl.ts` (18 lines), `packages/app/src/help/topics.ts` (11 EN + 12 PL lines): "recipe"/"receptur…" → BOM, or "components" where the sentence names a revision's component list ("Components (revision {number})", "The components for one base unit of its output", "a BOM's lines are all its components").
- `packages/core/src/domain/imports/workbook-layout.ts`: the BOM headers sheet's purpose, the BOM ID column's meaning (EN and PL) and the example import reference (`BOM-X`).
- Tests pinning the old text: `app/admin/[tenant]/boms/[id]/page.test.tsx`, `components/boms/{bom-screen,bom-controls,recipe-form}.test.tsx`, `components/imports/workbook-file.test.ts`, `core/domain/imports/{workbook-layout,cells}.test.ts`, `core/services/imports/import-boms.test.ts`, `tests/integration/boms.test.ts`.
- Guards: `messages.test.ts` ("say BOM, never recipe"), `topics.test.ts` (both languages), `workbook-layout.test.ts` (template prose and examples). `strings()` in `messages.test.ts` moved to the describe scope so two tests share it.

## Verification

- `npm run lint`: exit 0 (one pre-existing warning in `bom.service.ts`, untouched here).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: exit 0 (531 files, 3,864 tests, 100% thresholds met) on the second run; the first run's only failure was the 30 s timeout in `replay.test.ts` under load, reproduced as passing alone in 3.9 s.
- `npm run build`: exit 0.
- `CPG_BASE_URL=http://127.0.0.1:3461 CPG_ADMIN_PASSWORD=… npm run test:integration -- tests/integration/boms.test.ts` against the standalone build with a fresh `DATA_DIR`: 7 passed.
- Regression check: with `main`'s `en.ts`, `pl.ts`, `topics.ts` and `workbook-layout.ts` restored, the three guards fail (16 EN dictionary values, 12 EN and 13 PL help lines, 4 template strings listed) and the updated `/all its components/` assertion fails; restored, all pass.
- After the review fixes: the touched unit tests pass (22 files, 163 tests); the full gate re-run is recorded below.

## Follow-ups

- The API's English server messages still say "recipe" (`BomService` `BOM_CYCLE`, `ProductionOrderService` `PRODUCTION_BOM_CHANGED`, `MISSING_COMPONENT_MESSAGE`, `DUPLICATE_COMPONENT_MESSAGE`, `prepare-import.ts`). The screens translate them by code or exact text, and the issue keeps API shapes; whether to reword them is the owner's decision, filed as a follow-up issue from the PR's review (its number is in the closing log entry).
