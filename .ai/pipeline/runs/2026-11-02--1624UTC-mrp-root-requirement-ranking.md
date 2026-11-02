# Execution plan: MRP root ranking (#327)

**Date:** 2026-11-02 16:24 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task ff010b5a, `om-auto-fix-issue 327` → `om-auto-implement-spec`)
**Source doc:** `.ai/specs/implemented/2026-11-02--1613UTC-mrp-root-requirement-ranking.md` (spec PR #355)
**Issue:** #327
**Status:** complete (review pending)

## Goal

A Make proposal's component needs rank in `rankShortages` by the root requirements the proposal serves (customer order, forecast, open document's need, safety target), split by share, through every level, instead of the fixed rank 1 `planned-component` of #281's Q9.

## Scope

- `@cpg/core`, `domain/mrp/` only: `mrp-result.ts` types, a shared `priority/requirements.ts`, `priority/peg-proposals.ts` (new), `priority/rank-shortages.ts`, `explosion/explode-proposal.ts`, `plan-mrp.ts`, with their tests (100%).
- The benchmark `mrp-run-timing.test.ts`, run under unchanged budgets.
- Docs: the engineering standards' priority bullet, `CPG-acceptance.md` MRP-044 evidence, the spec's implementation notes.

The spec is carried straight into `implemented/` (lesson 2026-11-02, "Close the paperwork"); spec PR #355 must merge first. The branch also deletes the stray active copy of #320's spec, as #350 and #355 do, because `tests/ai-filenames.test.ts` fails on `main` without it.

**Non-goals:** storing or showing shortages (E18-S02), any quantity, proposal, stored row, API field or screen change, integration tests (spec Q9).

## Implementation Plan

Phases follow the spec's Implementation Plan (steps 1–8).

## Risks

- The sorted insert in the queues must keep today's order for the pair's own requirements: the existing `rank-shortages.test.ts` cases pin it.
- Run time: a trace per Make pair with proposals. The benchmark records the figures.
- Q4 (an open document's share ranks 0) awaits Piotr12's confirmation; the other answer is a one-line `RANK` change.

## Progress

PR: #356

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Types and the shared queue

- [x] 1.1 Types — da4f6bbf
- [x] 1.2 Shared requirement queue — da4f6bbf, b65f479a

### Phase 2: Trace, explosion and ranking

- [x] 2.1 Tracing — da4f6bbf
- [x] 2.2 Explosion with shares — da4f6bbf
- [x] 2.3 Ranking by root — da4f6bbf
- [x] 2.4 Level loop — da4f6bbf

### Phase 3: Verification and docs

- [x] 3.1 Benchmark — e409d530
- [x] 3.2 Docs and catalogue — 4f41b87c

## Log

- 16:24 Branch `feat/mrp-root-requirement-ranking` from `origin/main` (`2dc4ad75`). Engine: om-auto-create-pr (steps: 8, --loop: no).
- 16:32 Phases 1 and 2 in one code commit (da4f6bbf): the types, the shared queue, the trace, the split and the ranking only make sense together. Mutation checks: appended queues fail the sorted-insert test, a key without the provisional flag fails the executable-first test, and a single pooled pass fails the three-level test. `requirements.test.ts` followed (b65f479a).
- 16:44 Benchmark against `main` (its `domain/mrp` checked out, then restored): `planMrp` on the ten-times worst case went from 224 to 601 ms. Profiled in a scratch test with `node:inspector` (`--cpu-prof` captures no Vitest worker). Fixed: queue head pointers instead of `splice(0, n)`, append when last, a running pool total, a flat requirement key with one literal shape, and one requirement list per traced pair shared by the trace and the ranking (e409d530). Now 458 ms. The rest is the larger requirement count, which the spec's roots imply. It is recorded as a decision for the owner in the spec's implementation notes and on the PR.
- 16:47 Gate on e409d530: `npm run lint` 0, `npm run typecheck` 0, `npm run test:coverage` 0 (670 files, 5,564 tests, 100%), `npm run build` 0. Docs: the standards' priority bullet, MRP-044's evidence, the spec's implementation notes, and a lesson on timing engine changes against `main`. No integration test (spec Q9); `tests/*.test.ts` pass on the docs.
- 16:55 Review (`om-auto-review-pr --autofix`, a fresh-context reviewer): changes requested, with no correctness defect found. Several behaviours were tested only in ways that would still pass if they broke: the insert position, rank 0 and rank 3, three keys, the share sort and the shuffled snapshot. Also, an executable lot's surplus that served a provisional need stayed rooted at the target. Fixed in 337425ee: pass 2 now runs whenever there are provisional needs, and serves them from free stock, then from re-rooted executable surplus, then from provisional proposals. Each of the reviewer's surviving mutants now fails a test. The `rootOf` cast nit is declined.
- 17:12 Gate on 337425ee: lint 0, typecheck 0, coverage 0 (670 files, 5,569 tests, 100%), build 0. Benchmark: `planMrp` alone 9, 42, 121 and 424 ms (realistic, realistic worst case, ten times, ten-times worst case). Re-review: approve, apart from the owner gate. One more minor, the tie between surplus and a provisional proposal on one need date, is pinned by a test that fails when the order is swapped.

