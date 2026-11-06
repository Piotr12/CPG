# Execution plan: MRP typed shortages, stored, in the API and on the report (#380)

**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue 380` → feature route → `om-auto-write-spec`, then `om-auto-implement-spec`)
Source doc: .ai/specs/implemented/2026-11-05--1056UTC-mrp-typed-shortages.md
Spec PR: #386 (design only, a draft until Q1 is confirmed; merge it **first**, since this branch carries the spec into `implemented/`)
Issue: #380

## Goal

Store each run's ranked shortages (`MrpPlan.shortages`) as `SHORTAGE` rows, return them per plan from `GET …/mrp/runs/latest`, and list each day's short requirements in priority order on the report's Day view, so that DEM-018 to DEM-022 and MRP-044 pass.

## Scope

- Engine: `plan-mrp.ts`, no shortages for an unreadable material (spec Q11).
- Stored form: `domain/mrp/report/stored-shortages.ts` (new).
- Service: `services/mrp/mrp-run.service.ts` (write and read) and `mrp-run-view.ts`.
- Screen and copy: `app/src/components/mrp/mrp-shortages.tsx` (new), `mrp-report.tsx`, `i18n/messages/{en,pl}.ts`, `help/topics.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md`, `research/CPG-acceptance.md`, the spec into `implemented/`.
- Integration: `tests/integration/mrp-shortages.test.ts` (new).

**Non-goals:** the ranking, any quantity, the Week view, the pair list, marks, exceptions and acceptance.

## Risks

- Run time: the ranking returns to every run. Baseline on `main` (this machine, 2026-11-05 10:58 UTC): realistic 1,464 ms with a 302 ms stall, ten-times 9,528 ms with a 450 ms stall, worst case for proposals, ten-times, 6,529 ms with a 413 ms stall.
- Tests that read every `mrp_run_exception` row see the new code.

## Log

- 10:55 UTC Classified #380 as a feature (`feature` label). No spec existed, `SDLC.md` has no Definition of Ready, and nobody had claimed it, so the feature route applied: F3c. Claimed the issue.
- 10:56 UTC Wrote the spec autonomously (11 resolved assumptions, Q1 ⚠). A fresh-context review found nothing Critical. Its two High findings were folded in: yield on time, and status draft. So were its Medium and Low ones.
- 11:00 UTC Spec PR #386 opened as a draft, with labels and assumptions comments on the PR and the issue.
- 11:01 UTC Implementation branch `feat/issue-380-mrp-typed-shortages` from `main`, draft PR #387.
- 11:10 UTC Phase 1: stored form and the unreadable-material rule in `planMrp`.
- 11:20 UTC Phase 2, first build: one `SHORTAGE` row per entry. Customer-order positions are 0-based, which the first reader refused; fixed with tests.
- 11:30 UTC **Re-planned the storage.** At ten times the worst case for proposals, a row per entry stored 162,586 rows. Interleaved against `main` on the same machine, the run took about 6.9 s against 4.15 s, and its stall was about 560 ms against 271. Instrumenting showed the next run's delete of 216,718 exception rows taking 334 ms in one stretch. Switched to one row per pair holding its entries as one text, as `BOM_REJECTIONS` stores its list. That gave 4,332 and 4,376 ms (stall 271 and 275 ms). The realistic run measured 260 against 254 ms and ten times 2,820 against 2,700 ms. Both spec copies were updated (Q2, Data Model, Risks), with an implementation note.
- 11:35 UTC Phase 3: `MrpShortages`, the Day view's last column, EN/PL copy and help. The first screenshot showed every entry wrapping two or three times, so the column got `min-w-80`.
- 11:40 UTC Phase 4: `BACKWARD_COMPATIBILITY.md`, the six rows to Passed (automated) (522 / 13 / 0), the integration test, and `mrp-report.test.ts`'s column count and end-of-scroll list. The bulk-write lesson was extended.
- 11:44 UTC Gate green. A fresh-context code review is running.
- 11:55 UTC Code review: approve, with no Critical or High findings. Folded in:
  - (Medium) a customer-order line is named from 1, as the order screens name it ("Customer order 00000012, line 1"), and the API keeps the stored position;
  - (Low) the read sets a pair's list instead of spreading it into `push`, since 200k entries overflow the call stack;
  - (Low) an entry whose `uncovered` is above its `required` is left out, compared with `parseStoredFigure` because a stored figure can exceed twelve digits;
  - (Low) a same-width bad date now tests the first field's check;
  - (Low) Polish "dla prognozy na {date}".

  Filed #390 for Invalid UoM Conversion's 0-based customer-order line. The safety stock repeating on every short day follows #279, so it goes to the owner with Q1 on #386.
- 12:00 UTC Gate green again. `mrp-shortages.test.ts`, `mrp-report.test.ts` and `mrp-report-api.test.ts` pass 24/24 on a fresh copy of the rebuilt app.

## Verification

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0.
- `npm run test:coverage`: exit 0, 681 files, 5,706 tests passed (2 skipped), 100% statements, branches, functions and lines. The first run caught `index.test.ts`'s public-API list (the new `MRP_RANK_YIELD_MS`) and two uncovered branches in `exceptionsOf`. Both were fixed with tests.
- `mrp-run-timing.test.ts` (timing project), interleaved with `main` on one machine, figures above. All its bounds pass, and it asserts there are pairs with shortages.
- Integration, against the local standalone build (Docker isn't running on this machine; lesson 2026-10-23), each pass on a fresh copy and `DATA_DIR`: `mrp-shortages.test.ts` 2/2, then all eleven `mrp-*.test.ts` files 79/79, then `e2e-*.test.ts` and `test-reset-api.test.ts` 20/20. After the column-width change, `mrp-shortages.test.ts` and `mrp-report.test.ts` 16/16 on a fresh copy. `test-reset-realistic.test.ts` is left to CI.
- Screenshot of the Day view's Short requirements from the running build (1280 px), posted on #387.
- After the review fixes: lint, typecheck and build exit 0; `npm run test:coverage` exit 0 (5,706 passed, 100%); the three report integration files 24/24.

## Implementation Plan

### Phase 1: Stored form and engine
1. `stored-shortages.ts` (`toStoredShortage`, `readStoredShortage`), and no shortages for an unreadable material in `planMrp`, with unit tests.

### Phase 2: Write and read
2. `writeResults` writes `SHORTAGE` rows and yields on time. `exceptionsOf`, `describe` and `MrpPlanView.shortages`, with service tests for the six rows, read-only access, Test reset, rerun and positions. The timing test counts the rows, and is compared with `main`.

### Phase 3: Screen and copy
3. `MrpShortages`, the Day view column, EN/PL messages, the intro and help, with component, page and help tests.

### Phase 4: Docs and integration
4. `BACKWARD_COMPATIBILITY.md`, and the six acceptance rows to Passed (automated).
5. `tests/integration/mrp-shortages.test.ts`, plus `mrp-report.test.ts` and `mrp-report-api.test.ts`.
6. Full validation gate.

## Progress

PR: #387

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Stored form and engine

- [x] 1.1 Stored shortages and the unreadable-material rule — 3fdf5ffb

### Phase 2: Write and read

- [x] 2.1 Store and read the shortages — 627c9be3

### Phase 3: Screen and copy

- [x] 3.1 Short requirements on the Day view — 9e3e0dcc

### Phase 4: Docs and integration

- [x] 4.1 Compatibility notes and acceptance rows — 0a7846f2
- [x] 4.2 Integration test — d5958d5a
- [x] 4.3 Full validation gate — 784ba792
