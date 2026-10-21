# Issue #95 (E13-S02): the production variance report

**Date:** 2026-10-21 09:42 UTC
**Agent:** Claude Code (Opus 5.5), via cezar `/om-auto-fix-issue 95`
**Spec:** `.ai/specs/implemented/2026-10-21--0947UTC-production-variance-report.md`
**Status:** done

## Goal
A report comparing each production order's target and pinned-BOM expected consumption with actual output and inputs — including extra components and zero-output waste, excluding reversed completions — with filters, in the UI and the API (issue #95).

## Log
- 09:42 Feature route (label `feature`). FR triage: no variance report exists (`reports/` holds only the stock report), no spec mentions one beyond the completions spec, and no PR references #95. `SDLC.md` has no Definition of Ready, so the ticket counts as ready. Dependency #89 (E10-S02, completions) is closed. Base branch `main` (config `auto`). Claimed the issue.
- 09:47–10:00 Spec written. A fresh-context review found 2 blockers and 4 majors, and all were folded in. Current screens come from a dev server, because Docker has no space. Design PR #132 opened, and the owner merged it.
- 09:57–10:35 Implementation on `feat/production-variance-report`, tracked in `.ai/pipeline/runs/2026-10-21--0957UTC-production-variance-report.md`. PR #135 opened, and the issue lock was handed to the PR. #131 (#92's design, Q4) confirmed the reversal rule this report reads.
- 10:45 The fresh-context code review approved, with 2 minors, both fixed in c1c1712, and 3 nits noted.
- 10:58 CI on c1c1712: everything passes except the integration job. It failed twice on unrelated sign-in waits (`users.test.ts`, then `smoke.test.ts` on the rerun), the known flake of #128, whose fix is PR #134. Both variance files passed in both runs. The final head's CI result is reported on #135.
- 09:42 Route: `om-auto-write-spec 95` on `spec/production-variance-report` (design-only PR), then `om-auto-implement-spec` on `feat/production-variance-report` (implementation PR, `Closes #95`), as for #91 (#124/#125).

## Plan
1. Research completions, the stock report, PRD §07 and the acceptance scenarios; write the spec skeleton, resolve open questions with autonomous defaults, finish it with an implementation plan.
2. Current-screen screenshots and a proposed mockup; open the design PR.
3. Implement (core schema/service/pure builder → API route → admin page, nav, EN/PL, help → integration test), gate, open the implementation PR, review, QA.

## Changes
- #132 (merged): the spec, one mockup and two current-screen screenshots.
- #135: `VarianceReportService`, `OrderTally`, the variance report schemas, the page, the API route and the screen; a sidebar entry, EN/PL strings and the help topic; two integration files, plus updated navigation and list tests; `BACKWARD_COMPATIBILITY.md` §4, the standards adoption entry and two lessons.

## Verification
- Local, on c1c1712:
  - lint: exit 0, with one existing warning;
  - typecheck: exit 0;
  - `npm run test:coverage`: 467 files / 2,989 tests, 100% in all four measures;
  - build: exit 0.
- Integration, on a fresh standalone copy with fresh data, because Docker has no space: `variance-report`, `variance-report-api`, `navigation` and `help`, 4 files / 31 tests pass.
- Browser QA: five screenshots on #135.

## Follow-ups
- #92 owns the end-to-end check of a reversed completion in the report.
- Nit: the "Extra" badge here versus "Added" on the completion form.
- A human review and QA sign-off on #135 are still needed; nothing was merged by this run.
