# Execution plan — MRP planning exceptions (E16-S03, #280)

**Date:** 2026-11-01 07:48 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5, via `om-auto-fix-issue` → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-01--0737UTC-mrp-planning-exceptions.md` (spec PR #314)
**Issue:** #280
**Status:** in progress

## Goal

Every MRP run raises three planning exceptions, each with a stable code, structured `params` and a fixed message: Missing Planning Parameters, Missing BOM and Invalid UoM Conversion. A pair with one of them gets no guessed proposal, while every unrelated material still plans. The run stores all its exceptions, Insufficient Transfer Stock included, and the latest-run API lists them per plan.

## Scope

The spec's Implementation Plan, as written:

- the BOM validity predicate, the exception codes and their order, and the per-pair decision (`replenishPair`);
- the readable snapshot loader and the BOM read;
- the `MrpRunException` table and its migration, and the run's write and read;
- the API integration test, the realistic-dataset count and the benchmark print;
- compatibility, standards, the catalogue and the spec move.

The active copy of #278's spec is deleted here too, as on #314, because `tests/ai-filenames.test.ts` fails on `main` without it.

**Non-goals:**
- inactive BOM components and the parent exception (E17-S02);
- listing exceptions on screen and their EN/PL texts (E18-S03);
- automatic-mode batches (E19-S03);
- reading the `MaterialConversion` table;
- changing the demo generator.

## Implementation Plan

- **Phase 1, engine** (spec steps 1–4): the BOM predicate, codes and types, `replenishPair`, and `planMrp`.
- **Phase 2, loader and storage** (spec steps 5–7): the readable seams and BOM read, the table and migration, and the run's write and read.
- **Phase 3, proof and paperwork** (spec steps 8–10): the integration test, the realistic count and benchmark, and the docs.

## Risks

- A new migration moves every migration count (lesson 2026-10-23).
- The BOM revision read's plan may walk the tenant (spec, Snapshot loader); pin it, and use the fallback if needed.
- Docker may be unavailable here; if so, run the integration files on a standalone build (lesson 2026-10-23).

## Log

- 07:48 Branched `feat/mrp-planning-exceptions` from `origin/main`. The spec is copied in from #314's branch, uncommitted, and moves straight to `implemented/` at the end (lesson 2026-10-23, "Don't stack the implementation PR").

- Phase 1 (to 07:55): the engine change reached only four existing tests. Two Make tests needed a BOM fixture. The transfer tests read their exceptions through `planTransferExceptions`, because pairs with no set now add Missing Planning Parameters. One test's order changed to material first (spec Q11). 182 + 11 new engine tests passed, and core typecheck and lint exited 0.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Engine

- [x] 1.1 BOM validity predicate shared with the production dialog — 07d969df
- [x] 1.2 Exception codes, order and input types — 721b4dd6
- [x] 1.3 Per-pair decision — 721b4dd6
- [x] 1.4 Wire exceptions into planMrp — 721b4dd6

### Phase 2: Loader and storage

- [ ] 2.1 Readable snapshot seams and BOM read
- [ ] 2.2 MrpRunException table and migration
- [ ] 2.3 Store and list exceptions in the run service and API

### Phase 3: Proof and paperwork

- [ ] 3.1 Integration test
- [ ] 3.2 Realistic dataset count and benchmark print
- [ ] 3.3 Compatibility, standards, catalogue and spec move
