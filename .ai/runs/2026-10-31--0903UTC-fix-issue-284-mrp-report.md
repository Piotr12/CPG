# om-auto-fix-issue #284 — MRP report (E18-S01): spec

**Date:** 2026-10-31 09:03 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--0907UTC-mrp-report.md`
**Status:** in progress

## Goal

Take #284 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route:
- triage found no Definition of Ready in `SDLC.md`, no report in the code (only #274's run header) and no PR referencing #284;
- no spec existed, so `om-auto-write-spec 284` writes one, and `om-auto-implement-spec` builds it on its own implementation PR.

This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 09:03 Triage. #284 is labelled `feature`, open and unassigned, and no PR mentions it. `/admin/[tenant]/mrp` shows only the latest run's header. `GET …/mrp/runs/latest` returns the daily figures, but unfiltered and without names or units. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-report` from `origin/main`.
- 09:05 Read the context:
  - lessons and the engineering standards;
  - #274's spec and code (`MrpRunService.latest`, `MrpDailyResult` and its unique index);
  - the stock report's page, route, validator and service;
  - PRD §07 "Last MRP report";
  - catalogue rows MRP-005, MRP-008, RUN-002, TEN-018, API-014, UX-010 and UX-021.
- 09:07 Wrote the spec and resolved nine questions with reversible defaults, recorded in the spec. The ones that shape the most code:
  - Q1: no run stays 404 `MRP_RUN_NOT_FOUND`;
  - Q3: filters and additive fields on the existing latest-run route, with no `/report` route;
  - Q4: a pair list of 25 with a lowest balance and a first shortage, and one pair's 90 days once the filters leave one;
  - Q6: `Intl.NumberFormat` on the decimal text (exact on Node 24).
- 09:10 Sent the spec to a fresh-context reviewer. Rendered two static mockups (the pair list, and one pair's days with the MRP-005 figures). Docker is down, so the current-state screenshot comes from `next dev` on a throwaway `DATA_DIR`. Nothing on the page hydrated under `next dev` in this session (no `__reactFiber` on any of 43 buttons and links), so Run MRP couldn't be clicked, and the capture shows the no-run state. Not investigated: outside this run's scope.
- 09:14 Folded in the review (approve with changes):
  - **High:** the unfiltered integration check would miss the file's pair past page 1 in a shared database. It now opens `?page=1000000`.
  - **Medium:** the name lookups use `materialsByCode` / `locationsByCode` as they are (no `fields`). The report's `IN` reads join `list-page-reads.test.ts`.
  - **Low:**
    - the stock report's filter form is extracted and shared;
    - `current()` is removed, since it has no other caller;
    - the `Intl` output is quoted exactly (hyphen-minus, Polish no-break space);
    - plans carry `materialActive` and `locationActive`;
    - the strict page query is recorded as a client-visible change;
    - the locale follow-up is filed as #304.

## Changes

- `.ai/specs/2026-10-31--0907UTC-mrp-report.md`, `.ai/specs/assets/mrp-report/`

## Verification

- Spec review by a fresh-context subagent: one cohesive capability, no split. Its High, two Medium and five Low findings are folded in (09:14).
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 7 tests passed.

## Follow-ups

- #304: show every other quantity in the reader's locale.
- Merge the spec PR before the implementation PR. Then merge `main` into the implementation PR and delete the spec's active copy (`tests/ai-filenames.test.ts`).
