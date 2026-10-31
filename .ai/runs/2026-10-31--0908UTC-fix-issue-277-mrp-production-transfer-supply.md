# om-auto-fix-issue #277 — MRP production orders and transfers (E15-S03): spec

**Date:** 2026-10-31 09:08 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`
**Status:** done

## Goal

Take #277 end to end with `om-auto-fix-issue`. It is labelled `feature`, so the run takes the feature route. Triage found no Definition of Ready in `SDLC.md`, no implementation in `domain/mrp/` (no `supply/` seam, no production or transfer read in the snapshot) and no PR referencing #277. No spec existed, so `om-auto-write-spec 277` writes one, and `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec; the implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 09:00 Triage passed. Claimed #277 (assignee, `in-progress`, claim comment) and branched `spec/mrp-production-transfer-supply` from `origin/main` (87c94476).
- 09:05 Read the context: lessons, the #273 and #274 specs, the engine (`plan-mrp.ts`, `projection/`, `demand/`), the snapshot reads, `transfer-quantity.ts`, `production-planning.ts`, `production-completion.ts`, `lifecycle.ts`, the `ProductionOrder`, `Transfer` and `BomComponent` entities, and PRD §04 "Transfers". Read E15-S02's notes (#276) too, so the two stories touch different files.
- 09:08 Wrote the spec and resolved eleven open questions with reversible defaults, recorded in the spec. The ones that shape the most code:
  - Q1: the source subtracts only the feasible part;
  - Q2: "can supply" means the dependable balance on the dispatch day, without requisitions or proposals;
  - Q4: transfers are evaluated last, by counted dispatch day, planned dispatch day and code;
  - Q5: an in-memory `exceptions` list and per-item `overdue` flags, nothing stored.
- 09:10 There are no UI-facing surfaces (engine and snapshot only), so there are no mockups or screenshots.
- 09:14 A fresh-context reviewer said "revise" and found no blocker. Folded in:
  - **High:** `planTransfers` writes the transfer flows itself and `planMrp` only files its items; the ledger type is exported, and a sum test guards against a double count.
  - **Medium:** the balance stays in `project-buckets.ts` through `dependableBalance`. The dispatch-day trade-off is stated (Q2, edge case). The pair rule for zero-feasible checks is defined (Q9).
  - **Low:** overdue transfers are ordered by planned dispatch day; `abandoned` isn't subtracted from a transfer; the `status` cast; Q4's same-day wording.

- 09:16 Opened spec PR #303 with its labels, assumptions and run summary, and handed the issue lock to `om-auto-implement-spec`. It runs on #307 (`feat/mrp-production-and-transfer-supply`, from `main`); its execution plan `.ai/pipeline/runs/2026-10-31--0915UTC-mrp-production-and-transfer-supply.md` is that run's log.
- 10:55 #307 is ready. Its gate is green (100% coverage). A fresh-context code review approved, and its minors are fixed. The issue lock is released.

## Changes

- `.ai/specs/2026-10-31--0908UTC-mrp-production-and-transfer-supply.md`

## Verification

- Spec review by a fresh-context subagent: one cohesive story in two phases, so no split. Its High, three Medium and four Low findings are folded in (09:14).
- `npx vitest run tests/ai-filenames.test.ts`: 5 tests passed.

## Follow-ups

- Merge #303 before #307. Then merge `main` into #307 and delete the spec's active copy (`tests/ai-filenames.test.ts` enforces it).
- #307 still needs CI's full integration suite and a human approval.
