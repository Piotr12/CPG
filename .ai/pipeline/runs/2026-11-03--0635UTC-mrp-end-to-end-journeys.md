# Execution plan: MRP end-to-end journeys (#291)

Source doc: .ai/specs/implemented/2026-11-03--0626UTC-mrp-end-to-end-journeys.md
Spec PR: #364 · Issue: #291 · Branch: `feat/mrp-end-to-end-journeys` (from `main`, lesson 2026-11-02: the spec is carried straight into `implemented/`)
Engine: om-auto-create-pr (steps: 10, --loop: no)

## Goal
Integration tests that run the twelve cross-domain journeys (E2E-001, 002, 003, 005, 007, 008, 012, 015, 016, 019, 021 and E2E-010's MRP half) through the screens and the bearer API, prove UX-023's planning half, and run MRP on screen over the realistic Test dataset; then promote the catalogue rows.

## Scope
- `tests/integration/journeys.ts` (new helper), four `e2e-*.test.ts` files, additions to `test-reset-api.test.ts` and `test-reset-realistic.test.ts`.
- `.ai/specs/research/CPG-acceptance.md`.
- `.github/workflows/ci.yml` only if a shard passes 14 min (spec Q10).

**Non-goals:** product code changes (a defect becomes a bug issue, spec Q11), E20-S03's catalogue-wide recheck, E20-S01's tooltips.

## Risks
- Suite time: measured per file, with shards checked on CI (Q10).
- Prod growth: list headroom recorded after a full local run.
- No Docker here: integration files run against a local standalone server (lesson 2026-10-23). The full suite runs on CI.

## Implementation Plan

### Phase 1: Journeys
1. `journeys.ts`: API client with the finance-key walk, screen run and accept, and file accounts.
2. `e2e-supply-chain.test.ts`: E2E-001, E2E-015.
3. `e2e-planning.test.ts`: E2E-002, E2E-003, E2E-016.
4. `e2e-corrections.test.ts`: E2E-007, E2E-008, E2E-012, E2E-019.
5. `e2e-automatic.test.ts`: E2E-005, E2E-021.
6. E2E-010's MRP half in `test-reset-api.test.ts`.
7. The realistic screen run in `test-reset-realistic.test.ts`.
8. UX-023's file-level assertions.

### Phase 2: Verification and catalogue
9. Full order on one server; times and Prod headroom; CI shard check.
10. Catalogue rows, spec moved to implemented, run log, lessons; full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Journeys

- [x] 1.1 journeys.ts helper — 128a081d
- [x] 1.2 e2e-supply-chain: E2E-001, E2E-015 — 128a081d
- [x] 1.3 e2e-planning: E2E-002, E2E-003, E2E-016 — 2a5570df
- [ ] 1.4 e2e-corrections: E2E-007, E2E-008, E2E-012, E2E-019
- [ ] 1.5 e2e-automatic: E2E-005, E2E-021
- [ ] 1.6 E2E-010 MRP half
- [ ] 1.7 Realistic screen run
- [ ] 1.8 UX-023 file-level assertions

### Phase 2: Verification and catalogue

- [ ] 2.1 Full order on one server, times, Prod headroom, CI shards
- [ ] 2.2 Catalogue, spec status, run log, lessons, full gate
