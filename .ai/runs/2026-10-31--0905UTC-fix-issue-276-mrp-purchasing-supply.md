# om-auto-fix-issue #276 — MRP purchasing supply (E15-S02): spec

**Date:** 2026-10-31 09:05 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--0905UTC-mrp-purchasing-supply.md`
**Status:** in progress

## Goal

Take #276 end to end with `om-auto-fix-issue`. It is labelled `feature`, so the run takes the feature route. Triage found:
- no Definition of Ready in `SDLC.md`;
- no `domain/mrp/supply/` and no purchasing read in the MRP snapshot;
- no PR referencing #276.

No spec existed, so `om-auto-write-spec 276` writes one and `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec. The implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 09:05 Triage passed. The issue is open, unassigned and unlocked, with no comments. Claimed it (assignee, `in-progress`, claim comment) and branched `spec/mrp-purchasing-supply` from `origin/main`.
- 09:10 Read the context:
  - lessons and engineering standards;
  - the #273 engine and #274 runs specs;
  - the MRP domain, the snapshot loader and the purchasing entities;
  - `lifecycle.ts`, `listSortIndexes` and the MRP timing benchmark;
  - PRD §04 "Supply pipeline and overdue" and the acceptance rows the issue cites.
- 09:20 Wrote the spec and resolved nine open questions with reversible defaults, recorded in the spec. The ones that shape the most code:
  - Q1: an overdue requisition also counts today, flagged overdue;
  - Q2: the Overdue Supply marker lives on a new `MrpPlan.supply` entry;
  - Q3: supply entries aren't stored, so no migration.
- 09:25 Sent the spec to a fresh-context reviewer. It ran and EXPLAINed the real MikroORM queries on a migrated SQLite file. One High, two Medium and six Low findings, all folded in:
  - **High:** the PO-line read was sized by headers, but an order holds up to 100 lines. It now reads lines 10 headers at a time, at most 1,000 rows a read, and the benchmark adds full 100-line orders.
  - **Medium:** SQLite seeks the `desc` status index, so the plan test pins the seek, not an index name.
  - **Medium:** the tenant filter joins every selected to-one relation, so the spec no longer claims "no join". Each join resolves by key.
  - **Low:**
    - a Completed-with-remainder fixture is synthetic, since a reversal reopens a Completed line;
    - integration-test setup: own supplier, three distinct dates, `ourPlan` taking the pair;
    - status columns are plain strings, narrowed to `DocumentState`;
    - MRP-042 also asserts physical stock;
    - the help copy now covers overdue requisitions;
    - the benchmark counts are labelled as a chosen contract.
- No UI surface changes beyond the `mrp` help paragraph, so no mockups or screenshots: the spec is text-only.

## Changes

- `.ai/specs/2026-10-31--0905UTC-mrp-purchasing-supply.md`

## Verification

- Spec review by a fresh-context subagent: one cohesive capability, no split. Findings folded in (09:25).
- `npx vitest run tests/ai-filenames.test.ts`: 5 tests passed.

## Follow-ups

- Implementation via `om-auto-implement-spec` on its own PR, `Closes #276`.
