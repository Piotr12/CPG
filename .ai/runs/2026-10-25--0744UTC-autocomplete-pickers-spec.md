# Spec for #222: autocomplete for customer, supplier and location pickers and the report filters

**Date:** 2026-10-25 07:44 UTC
**Agent:** Claude Code / Opus 5.5, `om-auto-fix-issue 222` (feature route → `om-auto-write-spec`)
**Spec:** `.ai/specs/2026-10-25--0751UTC-autocomplete-pickers-report-filters.md`
**Status:** done

## Goal

Turn #222, the follow-up to #217's decision D8, into an implementable spec on a design-only PR. The implementation follows on its own PR, through `om-auto-implement-spec`, whose execution plan is that run's log.

## Log

- 07:44: #222 is labelled `enhancement`, so it took the feature route. FR triage:
  - the issue is open and unclaimed;
  - the pickers are still `NativeSelect`, and the listbox is named only through `aria-label`, so nothing is built yet;
  - `SDLC.md` has no Definition of Ready section, so the readiness check doesn't apply;
  - no spec covers it.

  Claimed the issue.
- 07:45: a read-only subagent inventoried the controls (11 entry pickers in 8 forms, 4 GET filter forms), the unit and integration tests that will churn, and how the BOM output field is labelled.
- 07:51: wrote the spec skeleton and resolved six Open Questions with autonomous defaults (Q1 to Q6 in the spec). None needs human confirmation.
- 07:58: a fresh-context subagent reviewed the spec. Applied its findings:
  - Enter on a cleared field chose the first row;
  - stale filter state after a soft navigation;
  - a select choice made before hydration was lost;
  - the Enter fix made its own step and is called out as a behaviour change;
  - a definite no-JS integration test;
  - the control count;
  - a dictionary key for "not in the list".
- Mockups and screenshots were skipped: Docker isn't available on this machine, so the test env can't boot. The proposed control is #225's `Autocomplete`, and its screenshots are already in the repo.

## Changes

- `.ai/specs/2026-10-25--0751UTC-autocomplete-pickers-report-filters.md` (new)
- this run log

## Verification

- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: exit 0, 2 files and 6 tests passed. The change is documentation only.

## Follow-ups

- Implementation PR via `om-auto-implement-spec`.
