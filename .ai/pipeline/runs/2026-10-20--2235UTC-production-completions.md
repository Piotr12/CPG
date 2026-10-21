# Production completions — execution plan

Source doc: .ai/specs/2026-10-20--2221UTC-production-completions.md
Issue: #89
Spec PR: #117
Engine: om-auto-create-pr (steps: 10, --loop: no)
Status: complete

## Goal
Post partial production completions against Open orders. Each completion pre-fills expected consumption from the pinned revision, records actual consumption (with extra inputs and zero-output waste), and posts output and inputs atomically as one ledger group, with the variance recorded. It works in both the UI and the API.

## Scope
- The `production-orders` concept:
  - the `ProductionCompletion`/`ProductionCompletionLine` entities and their migration;
  - pure completion arithmetic, strict schemas and `ProductionCompletionService` (preview/list/post);
  - the order's `outstanding` and the Q8 state rule on `update`.
- Delivery: API routes (`/production-orders/{id}/completions`, `/preview`), the server action, the completion dialog, form and history, EN/PL strings/help, and the BACKWARD_COMPATIBILITY entry.
- Tests: unit tests at 100% coverage, plus one focused integration file.

**Non-goals:** reversal (E11-S03), Close Early/Cancel (E11-S01), the variance report (E13-S02), MRP, a demo completion seed, and a shared variable-line form in `ui/backend`.

## Implementation Plan
- **Phase 1:** the entities and migration; the domain functions and schemas.
- **Phase 2:** the service's preview/list; post; registration plus the order's `outstanding`/Q8 rule and regressions.
- **Phase 3:** routes and the action plus the contract doc; the UI (dialog/form/history/strings/help); the integration test.
- **Phase 4:** the full gate, review, and publication.

## Risks
- **Partial postings:** one transaction and one ledger call.
- **Revision drift:** expected quantities come from `order.recipe` only.
- **Double posting:** the API key, and the UI submission behind a unique index.
- **Overproduction bypass:** checked against a fresh order inside the transaction.
- **Docker Desktop is out of disk** (spec run). The local integration run may need the standalone-server fallback from the lessons; otherwise CI is the gate.

## Decisions and log
- Reuse the cezar linked worktree; no nested worktree. The spec is materialized untracked from `spec/production-completions` (PR #117) per `om-auto-implement-spec`; the spec branch stays design-only.

## Deviations from the spec
- **The form shows no live per-row variance.** The standards route all quantity arithmetic through core's `decimal.ts`, which client code cannot import (only `@cpg/core/validators/*`). The form shows *Expected* beside *Actual*; the server records the variance, and the history shows it right after posting.
- **An inactive or unknown added input is a field error on its row** (`components.N.material`), as the spec's field-message list says. BOM lines instead raise `MATERIAL_INACTIVE`/`MATERIAL_NOT_FOUND` for the whole request.
- **A missing pinned component is reported generically on `components`, without naming the material.** Field messages are translated by matching constant texts, so they carry no parameters. The form always sends every pinned row, so only API callers can trigger it.
- **The preview names a component's `description`, not `name`,** matching every other material view; `BACKWARD_COMPATIBILITY.md` documents `description`.
- **The ledger receives each line's entered quantity and unit, not its base-unit quantity,** as goods issues do. The conversion is deterministic, and the movement keeps what was entered.
- **The dialog's submission token comes from `crypto.randomUUID()`,** so the dialog needs a secure context: cpg.baby is HTTPS, and localhost qualifies.
- **The completion's UUID has no `onCreate` default:** the service always generates it before posting, because the movements carry it.

## Verification
- Review pass (`om-auto-review-pr --autofix`, fresh-context `om-code-review`): approve, with no blockers or majors. Minors fixed:
  - row errors are cleared when an added row is removed;
  - expected, available and inactive are tied to the Actual field with `aria-describedby`;
  - added inputs reuse `materialChoices`;
  - the shadcn `checkbox` is added through the CLI (with a test, and a no-op `ResizeObserver` in the jsdom setup);
  - `COMPLETION_MOVEMENTS_MAX` moved to the schema and is used in its message;
  - a page past the end of the history reads "No older completions";
  - a regression test covers the replay of the submission that completed the order.

  The remaining nits are recorded as deviations above. Rerun gate: lint (1 pre-existing warning), typecheck and build pass; 416 files / 2,703 tests at 100%; `production-completions` and `production-orders` integration 10/10 on a fresh standalone build.
- Full local gate at 4.1: `npm run lint` passes (one pre-existing warning: unused `lineError` import in `bom.service.ts`); `npm run typecheck` passes; `npm run test:coverage`: 415 files / 2,700 tests, 100% statements, branches, functions and lines; `npm run build` passes and lists both completion routes.
- Integration tests, run against the standalone production build (Docker Desktop has no disk space; shared state not pruned, per the lessons). Each run used a fresh copy and a fresh `DATA_DIR`:
  - `production-completions.test.ts`: 4/4, on both builds;
  - `production-orders.test.ts`, `smoke.test.ts` (24 migrations) and `stock.test.ts`: 3 files, 14/14.
  - The full suite is left to PR CI.
- Live UI on the standalone server:
  - desktop: order detail with history, a completed order with a waste posting and an overproduction, both dialog steps, and the acceptance guard;
  - mobile at 390 px: no horizontal scroll. The first capture squeezed the history column, so the date column is now hidden below `sm` and lines wrap at word boundaries.
  - Screenshots in `.ai/qa/artifacts_production-completions-89/` (gitignored), posted to the PR.
- Phases 1–2: db 17 files / 102 tests; core completion domain/schema/service/order tests (58 + 20) pass; targeted coverage of the new core files 100% on all four metrics; `npm run typecheck` passes; ESLint on core clean except the pre-existing `lineError` unused-import warning in `bom.service.ts`.

## Progress

PR: #119

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain and persistence

- [x] 1.1 Completion entities, migration and isolation — f31015c
- [x] 1.2 Completion arithmetic and strict schemas — 5a56686

### Phase 2: Service

- [x] 2.1 Preview and history list — 072436b
- [x] 2.2 Atomic completion posting — 072436b
- [x] 2.3 Registration, outstanding and the order state rule — 8ce558d

### Phase 3: Delivery surfaces

- [x] 3.1 API routes, server action and contract — 610aa42
- [x] 3.2 Completion dialog, history, strings and help — 37f7c95
- [x] 3.3 Focused integration journey — 2150288

### Phase 4: Verification and publication

- [x] 4.1 Full local gate and live UI evidence — 2150288
- [x] 4.2 Review, publication and final CI — 7300123
