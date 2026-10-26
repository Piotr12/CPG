# File slice 3 (MRP) as epics E14–E20

**Date:** 2026-10-26 10:38 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, with four Opus drafting subagents
**Spec:** none (source: `.ai/specs/product-brief.md`, parked epic E06 #14)
**Status:** done

## Goal

Split E06 (#14), the parked slice 3, into epics that close the app's delivery, and show how they can be delivered in parallel. The owner approved the proposed tree ("File as proposed") and asked for it to be filed.

## Log

- Counted the catalogue (`.ai/specs/research/CPG-acceptance.md`): 372 Passed (automated), 44 Partially verified, 119 Not executed. Of the 163 open rows, all but UX-014 need an MRP run.
- Read PRD §04 and §07 and the data model's MRP entities; proposed seven epics cut along the engine's seams (run/contract, projection inputs, sizing, explosion, report, acting on proposals, journeys/closing) and checked by script that each open row maps to exactly one story.
- Owner chose "File as proposed". Four subagents drafted the 20 story bodies from one brief (shared architecture vocabulary: `domain/mrp/{projection,demand,supply,sizing,exceptions,explosion}`, `services/mrp`, `entities/mrp`); the lead wrote the seven epic bodies, then checked format, labels, placeholders and that every assigned scenario is cited in its story's acceptance criteria.
- Deviations from the approved tree, all dependency or citation fixes the drafts surfaced:
  - the snapshot loader sits in E14-S02, so E15-S01…S03 and E16-S01 also depend on it;
  - E16-S01 depends on E15-S01 for its safety-target scenarios (MRP-009, DEM-023), E16-S02 on E15-S01 for the typed demand it ranks, E17-S01 on E16-S02 for the parent start date;
  - E18-S02 depends on E15-S02/S03 (overdue markers), E18-S03 on E16-S03 (exceptions);
  - MRP-004's Beyond Horizon half is asserted in E16-S02, its horizon half in E14-S01.
- Filed #266–#272 (epics) and #273–#292 (stories) with `feature`/`documentation`, priority and risk labels and the `om-prepare-issue` label rationale in each body; wrote the epic checklists; updated #14 with the epic list and the delivery waves.
- `.ai/specs/backlog.md` did not exist on `main`: the slice 2 record (commit `1f7a9073`) was made on `cez/b95c2353`, which never merged. Restored its rows and added slice 3's.
- The bodies follow the format of `om-prepare-issue`'s output (#80, #94) and were created with `gh issue create` directly, not one `om-prepare-issue` invocation per issue; dedupe was one search for `E14`+ and `MRP` titles (none besides #85).

## Changes

- GitHub: #266–#292 created; #14 body updated.
- `.ai/specs/backlog.md` (restored E01–E13, added E14–E20, reserved ids from other sources, slice 3 sequence)
- `.ai/lessons.md` (backlog record must reach `main`)
- this run log

## Verification

- Mapping script: 163 open rows, none missing, none duplicated across stories (split rows cite their half in two stories).
- Coverage script over the drafted bodies: every scenario assigned in the brief appears in its story's acceptance criteria.
- `gh issue view` over #266–#292: labels as planned, no `{{` placeholder left, each story's `Epic:` line points at its epic.
- `npx vitest run tests/ai-filenames.test.ts`: 4 passed.

## Follow-ups

Owner decisions raised as non-blocking open questions on the stories, most notably:
- #275 — DEM-025/MRP-048 say any past residual expires; D08 (and `netForecasts`) keeps an earlier-this-month residual as due today. Needs an erratum like DEM-007's.
- #278 — MAT-026's lot rule gives 12 for min 10 / multiple 6 / need 2, while the demo generator's `lotFor` gives 10.
- #292 — E2E-010's goods receipt *during* a Test reset can't run on one server process; "all 535" needs an accepted exception.
- #290 — UX-014 asks for tooltips; today's fields use inline hints.
- The brief still lists slices 2 and 3 under *Later* (`om-discover --refresh`, owner).
