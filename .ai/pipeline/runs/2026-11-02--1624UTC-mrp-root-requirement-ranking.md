# Execution plan: MRP root ranking (#327)

**Date:** 2026-11-02 16:24 UTC
**Agent:** Claude Code / Claude Opus 5.5 (cezar task ff010b5a, `om-auto-fix-issue 327` → `om-auto-implement-spec`)
**Source doc:** `.ai/specs/implemented/2026-11-02--1613UTC-mrp-root-requirement-ranking.md` (spec PR #355)
**Issue:** #327
**Status:** in progress

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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Types and the shared queue

- [ ] 1.1 Types
- [ ] 1.2 Shared requirement queue

### Phase 2: Trace, explosion and ranking

- [ ] 2.1 Tracing
- [ ] 2.2 Explosion with shares
- [ ] 2.3 Ranking by root
- [ ] 2.4 Level loop

### Phase 3: Verification and docs

- [ ] 3.1 Benchmark
- [ ] 3.2 Docs and catalogue

## Log

- 16:24 Branch `feat/mrp-root-requirement-ranking` from `origin/main` (`2dc4ad75`). Engine: om-auto-create-pr (steps: 8, --loop: no).
