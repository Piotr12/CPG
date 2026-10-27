# Execution plan — MRP engine: 90 daily buckets from physical stock and open customer-order demand

**Date:** 2026-10-27 05:29 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue 273` → feature route (`om-auto-write-spec` → `om-auto-implement-spec` → `om-auto-create-pr`)
**Issue:** #273 (E14-S01) · **Spec PR:** #294
Source doc: .ai/specs/implemented/2026-10-27--0525UTC-mrp-engine-projection.md

## Goal

Ship `planMrp(inputs, today)` in `@cpg/core`: a pure engine that returns exactly 90 daily buckets per planned material and location, starting from today's physical stock and subtracting the outstanding demand of open customer-order lines, with the `MrpInputs`/`MrpResult` shapes and seam folders later MRP stories fill.

## Scope

- `packages/core/src/domain/document-lifecycle/lifecycle.ts`: extract `outstandingMicro` (`bigint`), with no change in behaviour.
- New `packages/core/src/domain/mrp/`: `plan-mrp.ts`, `mrp-inputs.ts`, `mrp-result.ts`, `projection/{horizon,pairs,project-buckets}.ts`, `demand/firm-demand.ts`, each with its unit tests.
- `.ai/docs/engineering-standards.md`: one bullet on `domain/mrp/`.
- The spec moves to `.ai/specs/implemented/`.

**Non-goals:** running or storing a run, UI and API (E14-S02); forecasts, safety targets, supply, proposals, exceptions, explosion and the report (E15–E18); acceptance-catalogue promotions (E14-S02 and E20-S03 run MRP end to end).

## Implementation Plan

Phase 1 is the spec's Implementation Plan, steps 1–7. The branch is stacked on the spec PR's branch (`spec/mrp-engine-projection`) so the spec file exists to move. Merge #294 first.

## Risks

- The shapes are an internal contract for later stories; the spec's Q4 makes the bucket complete now.
- The coverage gate is 100%: every branch of the new modules needs a test.

## Log

- 05:22 UTC — #273 classified as a feature; FR triage passed (no MRP code: no `planMrp`/`MrpInputs` under `packages/`; no open PR; `SDLC.md` has no Definition of Ready). Issue claimed.
- 05:25–05:35 UTC — the spec was written autonomously with eight reversible defaults (Q1–Q8). A fresh-context review found no blockers; its findings are folded in. Spec PR #294 opened with `Refs #273` and labels review, documentation, skip-qa, priority-medium and risk-low.
- 05:29 UTC — this plan; 7 steps, under the threshold of 20, so the plain engine applies.
- 05:30–05:40 UTC — steps 1.1–1.7 landed: 26 new MRP tests and 1 for `outstandingMicro`. `compareCodes` is exported from `projection/pairs.ts` and shared by the pair order and the firm-demand order. No deviation from the spec.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: MRP engine foundation

- [x] 1.1 Extract outstandingMicro in lifecycle.ts — 6dd8ae29
- [x] 1.2 Add MrpInputs and MrpResult types — b57b7572
- [x] 1.3 Add the horizon and pair helpers — cdde9a2d
- [x] 1.4 Add the firm-demand seam — 1cc87a38
- [x] 1.5 Add the bucket projection — 49ca8a8d
- [x] 1.6 Add planMrp with one test per acceptance criterion — 88aa65d3
- [x] 1.7 Document domain/mrp and move the spec to implemented — 2db4d259
